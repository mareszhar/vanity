import type {
  VanityAppAutoImports,
  VanityConfig,
  VanityStyleAutoImports,
} from '../../config'
import type {
  VanityAutoImportDeclarationFile,
  VanityAutoImportDeclarationSource,
} from './autoImportDeclarations'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { VanityError } from '../../diagnostics'
import { normalizePath } from '../core/path'
import { getExportNamesFromFile, resolveConfiguredModuleSource } from '../projection/exportNames'
import { resolveAppAutoImports } from './applicationImports'
import {
  createGeneratedAutoImportBridge,
  getModuleSpecifier,
  renderAppAutoImportDeclarations,
  renderStyleAutoImportDeclarations,
} from './autoImportDeclarations'
import { selectAutoImportNames } from './autoImportNames'

export type { VanityAutoImportDeclarationFile } from './autoImportDeclarations'

const styleFileName = 'vanity-style-auto-imports.d.ts'
const appFileName = 'vanity-app-auto-imports.d.ts'

/** Filesystem paths for one module role's declaration and discovery bridge. */
export interface VanityAutoImportDeclarationPaths {
  readonly declaration: string
  readonly bridge: string
}

export interface VanityStyleAutoImportSource extends VanityAutoImportDeclarationSource {
  /** Absolute file used for static export discovery and compiler injection. */
  readonly file: string
}

/** Planned style-module declarations, sources, and discovery bridge. */
export interface VanityStyleAutoImportPlan {
  readonly sources: readonly VanityStyleAutoImportSource[]
  readonly names: readonly string[]
  readonly declaration: VanityAutoImportDeclarationFile
  readonly bridge: VanityAutoImportDeclarationFile
}

/** Planned application-module declarations, sources, and Vue integration. */
export interface VanityAppAutoImportPlan {
  readonly sources: readonly VanityAutoImportDeclarationSource[]
  readonly names: readonly string[]
  readonly vueTemplates: boolean
  readonly declaration: VanityAutoImportDeclarationFile
  readonly bridge: VanityAutoImportDeclarationFile
}

/** Complete declaration plan for both module roles under one project root. */
export interface VanityAutoImportPlan {
  readonly root: string
  readonly style?: VanityStyleAutoImportPlan
  readonly app?: VanityAppAutoImportPlan
  readonly declarations: readonly VanityAutoImportDeclarationFile[]
  readonly bridges: readonly VanityAutoImportDeclarationFile[]
}

export interface VanityAutoImportRoles {
  readonly style: readonly VanityStyleAutoImports[]
  readonly app?: VanityAppAutoImports
}

export function getAutoImportDeclarationPaths(root: string, role: 'style' | 'app'): VanityAutoImportDeclarationPaths {
  const name = role === 'style' ? styleFileName : appFileName
  return {
    declaration: join(root, '.vanity', 'types', name),
    bridge: join(root, 'node_modules', '@types', `vanity-${role}-auto-imports`, 'index.d.ts'),
  }
}

/** Expand `shared` exactly once so every host uses the same module-role routing. */
export function getAutoImportRoles(options: VanityConfig): VanityAutoImportRoles {
  const value = options.autoImports
  if (value === undefined)
    return { style: [] }

  if (typeof value === 'string')
    return { style: [value], app: convertSharedToApp(value) }

  const style = [
    ...(value.shared === undefined ? [] : [value.shared]),
    ...(value.style === undefined ? [] : [value.style]),
  ]
  return {
    style,
    app: mergeAppAutoImports(
      value.shared === undefined ? undefined : convertSharedToApp(value.shared),
      value.app,
    ),
  }
}

export async function planAutoImportDeclarations(
  options: VanityConfig,
  context: { root: string },
): Promise<VanityAutoImportPlan> {
  const root = normalizePath(resolve(context.root))
  const roles = getAutoImportRoles(options)
  const style = await planStyleAutoImports(roles.style, options.compiler?.system, root)
  const app = await planAppAutoImports(roles.app, options.compiler?.system, root)

  assertAutoImportRoleSeparation(style, app)

  return {
    root,
    style,
    app,
    declarations: [
      ...(style === undefined ? [] : [style.declaration]),
      ...(app === undefined ? [] : [app.declaration]),
    ],
    bridges: [
      ...(style === undefined ? [] : [style.bridge]),
      ...(app === undefined ? [] : [app.bridge]),
    ],
  }
}

/** Refuse one global name only when the two module roles resolve it differently. */
function assertAutoImportRoleSeparation(
  style: VanityStyleAutoImportPlan | undefined,
  app: VanityAppAutoImportPlan | undefined,
): void {
  if (!style || !app)
    return

  const styles = groupSourcesByName(style.sources)
  const apps = groupSourcesByName(app.sources)
  for (const [name, styleSources] of styles) {
    const appSources = apps.get(name)
    if (!appSources)
      continue
    if ([...styleSources].every(source => appSources.has(source)))
      continue

    throw new VanityError({
      code: 'VANITY_AUTO_IMPORT_INVALID',
      message: `auto-import '${name}' is exposed by different autoImports module roles`,
      detail: [
        `style: ${[...styleSources].map(source => `'${source}'`).join(', ')}`,
        `app: ${[...appSources].map(source => `'${source}'`).join(', ')}`,
      ],
      path: ['autoImports', name],
      fix: 'rename one export, or narrow autoImports.style or autoImports.app with include or exclude',
    })
  }
}

export async function planStyleAutoImports(
  values: readonly VanityStyleAutoImports[],
  system: NonNullable<VanityConfig['compiler']>['system'],
  root: string,
): Promise<VanityStyleAutoImportPlan | undefined> {
  if (values.length === 0)
    return undefined

  const sources: VanityStyleAutoImportSource[] = []
  for (const value of values) {
    const requested = getStyleSource(value, system)
    const resolved = resolveConfiguredModuleSource(requested, root, 'autoImports.style')
    await readSource(resolved.file, 'autoImports.style')
    const filter = typeof value === 'object' ? value : {}
    const imports = selectAutoImportNames(
      getExportNamesFromFile(resolved.file, root),
      filter,
      '[vanity] autoImports.style',
    )
    sources.push({ from: resolved.from, file: resolved.file, imports })
  }

  assertSourceNamesAreUnambiguous(sources, 'style auto-import')
  const paths = getAutoImportDeclarationPaths(root, 'style')
  const declaration: VanityAutoImportDeclarationFile = {
    role: 'style',
    kind: 'declaration',
    typeScriptReference: true,
    path: paths.declaration,
    text: renderStyleAutoImportDeclarations(sources, { relativeTo: paths.declaration }),
  }
  const bridge: VanityAutoImportDeclarationFile = {
    role: 'style',
    kind: 'bridge',
    typeScriptReference: false,
    path: paths.bridge,
    text: createGeneratedAutoImportBridge(getModuleSpecifier(paths.declaration, paths.bridge)),
  }
  return {
    sources,
    names: getUniqueNames(sources),
    declaration,
    bridge,
  }
}

async function planAppAutoImports(
  value: VanityAppAutoImports | undefined,
  system: NonNullable<VanityConfig['compiler']>['system'],
  root: string,
): Promise<VanityAppAutoImportPlan | undefined> {
  if (value === undefined)
    return undefined

  const resolved = resolveAppAutoImports(getAppAutoImportsForSystem(value, system), root)
  const sources: VanityAutoImportDeclarationSource[] = resolved.sources.map(source => ({
    from: source.from,
    imports: [...source.imports],
  }))
  const paths = getAutoImportDeclarationPaths(root, 'app')
  const { names, vueTemplates } = resolved
  const declaration: VanityAutoImportDeclarationFile = {
    role: 'app',
    kind: 'declaration',
    typeScriptReference: true,
    path: paths.declaration,
    text: renderAppAutoImportDeclarations(sources, {
      declarationFile: paths.declaration,
      vueTemplates,
    }),
  }
  const bridge: VanityAutoImportDeclarationFile = {
    role: 'app',
    kind: 'bridge',
    typeScriptReference: false,
    path: paths.bridge,
    text: createGeneratedAutoImportBridge(getModuleSpecifier(paths.declaration, paths.bridge)),
  }
  return { sources, names, vueTemplates, declaration, bridge }
}

function convertSharedToApp(value: VanityStyleAutoImports): VanityAppAutoImports {
  if (typeof value === 'string')
    return { sources: [value] }
  return { sources: [{ from: value.from ?? '$system', ...(value.include === undefined ? { exclude: value.exclude } : { include: value.include }) }] }
}

function mergeAppAutoImports(
  shared: VanityAppAutoImports | undefined,
  app: VanityAppAutoImports | undefined,
): VanityAppAutoImports | undefined {
  if (shared === undefined)
    return app
  if (app === undefined)
    return shared

  const sharedOptions = getAppOptions(shared)
  const configuredAppOptions = getAppOptions(app)
  return {
    presets: [...(sharedOptions.presets ?? []), ...(configuredAppOptions.presets ?? [])],
    sources: [...(sharedOptions.sources ?? []), ...(configuredAppOptions.sources ?? [])],
  }
}

function getAppOptions(value: VanityAppAutoImports): import('./applicationImports').VanityAppAutoImportsOptions {
  if (typeof value === 'string')
    return { sources: [value] }
  if (!Array.isArray(value))
    return value as import('./applicationImports').VanityAppAutoImportsOptions
  return { presets: value }
}

function getStyleSource(
  value: VanityStyleAutoImports,
  system: NonNullable<VanityConfig['compiler']>['system'],
): string {
  const requested = typeof value === 'string' ? value : value.from ?? '$system'
  if (requested !== '$system')
    return requested
  const values = system === undefined ? [] : Array.isArray(system) ? system : [system]
  if (values.length !== 1) {
    throw new VanityError({
      code: 'VANITY_AUTO_IMPORT_INVALID',
      message: 'autoImports.style using $system requires exactly one compiler.system entry',
      path: ['autoImports', 'style'],
      fix: 'configure exactly one compiler.system entry before using $system',
    })
  }
  const [systemSource] = values
  return typeof systemSource === 'string' ? systemSource : systemSource.entry
}

/** Resolve the `$system` source fence before an adapter delegates app imports. */
export function getAppAutoImportsForSystem(
  value: VanityAppAutoImports,
  system: NonNullable<VanityConfig['compiler']>['system'],
): VanityAppAutoImports {
  const replace = (source: string): string => source === '$system' ? getStyleSource('$system', system) : source
  if (typeof value === 'string')
    return replace(value)
  if (Array.isArray(value))
    return value
  const config = value as import('./applicationImports').VanityAppAutoImportsOptions
  if (config.sources === undefined)
    return config

  return {
    ...config,
    sources: config.sources.map(source =>
      typeof source === 'string'
        ? replace(source)
        : { ...source, from: replace(source.from) }),
  }
}

async function readSource(path: string, owner: string): Promise<void> {
  try {
    await readFile(path, 'utf8')
  }
  catch {
    throw new VanityError({
      code: 'VANITY_AUTO_IMPORT_INVALID',
      message: `the configured ${owner} module does not exist: ${path}`,
      path: ['autoImports', owner],
      fix: `point ${owner} at a readable module`,
    })
  }
}

function getUniqueNames(sources: readonly VanityAutoImportDeclarationSource[]): string[] {
  return [...new Set(sources.flatMap(source => source.imports))].sort()
}

function groupSourcesByName(sources: readonly VanityAutoImportDeclarationSource[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const source of sources) {
    for (const name of source.imports) {
      const values = result.get(name) ?? new Set<string>()
      values.add(source.from)
      result.set(name, values)
    }
  }
  return result
}

function assertSourceNamesAreUnambiguous(sources: readonly VanityAutoImportDeclarationSource[], kind: string): void {
  for (const [name, values] of groupSourcesByName(sources)) {
    if (values.size > 1) {
      throw new VanityError({
        code: 'VANITY_AUTO_IMPORT_INVALID',
        message: `${kind} '${name}' is provided by both ${[...values].map(value => `'${value}'`).join(' and ')}`,
        path: ['autoImports', name],
        fix: 'rename the export or narrow one source with include/exclude',
      })
    }
  }
}
