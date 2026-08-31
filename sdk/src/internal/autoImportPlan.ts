import type {
  VanityAppAutoImports,
  VanityConfig,
  VanityStyleAutoImports,
} from '../config'
import type { AutoImportDeclarationFile, AutoImportDeclarationSource } from './autoImportDeclarations'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { normalizePath } from '@vanilla-extract/integration'
import { resolveAppAutoImports } from './applicationImports'
import {
  appAutoImportDeclarations,
  generatedAutoImportBridge,
  moduleSpecifierFor,
  styleAutoImportDeclarations,
} from './autoImportDeclarations'
import { selectAutoImportNames } from './autoImportNames'
import { exportNamesFromFile, resolveConfiguredModuleSource } from './exportNames'

export type { AutoImportDeclarationFile } from './autoImportDeclarations'

const styleFileName = 'vanity-style-auto-imports.d.ts'
const appFileName = 'vanity-app-auto-imports.d.ts'

export interface AutoImportDeclarationPaths {
  readonly declaration: string
  readonly bridge: string
}

export interface VanityStyleAutoImportSource extends AutoImportDeclarationSource {
  /** Absolute file used for static export discovery and compiler injection. */
  readonly file: string
}

export interface VanityStyleAutoImportPlan {
  readonly sources: readonly VanityStyleAutoImportSource[]
  readonly names: readonly string[]
  readonly declaration: AutoImportDeclarationFile
  readonly bridge: AutoImportDeclarationFile
}

export interface VanityAppAutoImportPlan {
  readonly sources: readonly AutoImportDeclarationSource[]
  readonly names: readonly string[]
  readonly vueTemplates: boolean
  readonly declaration: AutoImportDeclarationFile
  readonly bridge: AutoImportDeclarationFile
}

export interface VanityAutoImportPlan {
  readonly root: string
  readonly style?: VanityStyleAutoImportPlan
  readonly app?: VanityAppAutoImportPlan
  readonly declarations: readonly AutoImportDeclarationFile[]
  readonly bridges: readonly AutoImportDeclarationFile[]
}

export interface VanityAutoImportRoles {
  readonly style: readonly VanityStyleAutoImports[]
  readonly app?: VanityAppAutoImports
}

export function autoImportDeclarationPaths(root: string, role: 'style' | 'app'): AutoImportDeclarationPaths {
  const name = role === 'style' ? styleFileName : appFileName
  return {
    declaration: join(root, '.vanity', 'types', name),
    bridge: join(root, 'node_modules', '@types', `vanity-${role}-auto-imports`, 'index.d.ts'),
  }
}

/** Expand `shared` exactly once so every host uses the same module-role routing. */
export function autoImportRoles(options: VanityConfig): VanityAutoImportRoles {
  const value = options.autoImports
  if (value === undefined)
    return { style: [] }

  if (typeof value === 'string')
    return { style: [value], app: sharedAsApp(value) }

  const style = [
    ...(value.shared === undefined ? [] : [value.shared]),
    ...(value.style === undefined ? [] : [value.style]),
  ]
  return {
    style,
    app: mergeAppAutoImports(
      value.shared === undefined ? undefined : sharedAsApp(value.shared),
      value.app,
    ),
  }
}

export async function planAutoImportDeclarations(
  options: VanityConfig,
  context: { root: string },
): Promise<VanityAutoImportPlan> {
  const root = normalizePath(resolve(context.root))
  const roles = autoImportRoles(options)
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
export function assertAutoImportRoleSeparation(
  style: VanityStyleAutoImportPlan | undefined,
  app: VanityAppAutoImportPlan | undefined,
): void {
  if (!style || !app)
    return

  const styles = sourcesByName(style.sources)
  const apps = sourcesByName(app.sources)
  for (const [name, styleSources] of styles) {
    const appSources = apps.get(name)
    if (!appSources)
      continue
    if ([...styleSources].every(source => appSources.has(source)))
      continue

    throw new TypeError(
      `[vanity] auto-import '${name}' is exposed by different autoImports module roles\n`
      + `  style: ${[...styleSources].map(source => `'${source}'`).join(', ')}\n`
      + `  app: ${[...appSources].map(source => `'${source}'`).join(', ')}\n`
      + '  fix: rename one export, or narrow autoImports.style or autoImports.app with include or exclude',
    )
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
    const requested = styleSource(value, system)
    const resolved = resolveConfiguredModuleSource(requested, root, 'autoImports.style')
    await readSource(resolved.file, 'autoImports.style')
    const filter = typeof value === 'object' ? value : {}
    const imports = selectAutoImportNames(
      exportNamesFromFile(resolved.file, root),
      filter,
      '[vanity] autoImports.style',
    )
    sources.push({ from: resolved.from, file: resolved.file, imports })
  }

  assertSourceNamesAreUnambiguous(sources, 'style auto-import')
  const paths = autoImportDeclarationPaths(root, 'style')
  const declaration: AutoImportDeclarationFile = {
    role: 'style',
    kind: 'declaration',
    typeScriptReference: true,
    path: paths.declaration,
    text: styleAutoImportDeclarations(sources, { relativeTo: paths.declaration }),
  }
  const bridge: AutoImportDeclarationFile = {
    role: 'style',
    kind: 'bridge',
    typeScriptReference: false,
    path: paths.bridge,
    text: generatedAutoImportBridge(moduleSpecifierFor(paths.declaration, paths.bridge)),
  }
  return {
    sources,
    names: uniqueNames(sources),
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

  const resolved = resolveAppAutoImports(appAutoImportsForSystem(value, system), root)
  const sources: AutoImportDeclarationSource[] = resolved.sources.map(source => ({
    from: source.from,
    imports: [...source.imports],
  }))
  const paths = autoImportDeclarationPaths(root, 'app')
  const { names, vueTemplates } = resolved
  const declaration: AutoImportDeclarationFile = {
    role: 'app',
    kind: 'declaration',
    typeScriptReference: true,
    path: paths.declaration,
    text: appAutoImportDeclarations(sources, {
      declarationFile: paths.declaration,
      vueTemplates,
    }),
  }
  const bridge: AutoImportDeclarationFile = {
    role: 'app',
    kind: 'bridge',
    typeScriptReference: false,
    path: paths.bridge,
    text: generatedAutoImportBridge(moduleSpecifierFor(paths.declaration, paths.bridge)),
  }
  return { sources, names, vueTemplates, declaration, bridge }
}

function sharedAsApp(value: VanityStyleAutoImports): VanityAppAutoImports {
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

  const sharedOptions = appOptions(shared)
  const configuredAppOptions = appOptions(app)
  return {
    presets: [...(sharedOptions.presets ?? []), ...(configuredAppOptions.presets ?? [])],
    sources: [...(sharedOptions.sources ?? []), ...(configuredAppOptions.sources ?? [])],
  }
}

function appOptions(value: VanityAppAutoImports): import('./applicationImports').VanityAppAutoImportsOptions {
  if (typeof value === 'string')
    return { sources: [value] }
  if (!Array.isArray(value))
    return value as import('./applicationImports').VanityAppAutoImportsOptions
  return { presets: value }
}

function styleSource(
  value: VanityStyleAutoImports,
  system: NonNullable<VanityConfig['compiler']>['system'],
): string {
  const requested = typeof value === 'string' ? value : value.from ?? '$system'
  if (requested !== '$system')
    return requested
  const values = system === undefined ? [] : Array.isArray(system) ? system : [system]
  if (values.length !== 1) {
    throw new TypeError(
      '[vanity] autoImports.style using $system requires exactly one compiler.system entry',
    )
  }
  const [systemSource] = values
  return typeof systemSource === 'string' ? systemSource : systemSource.entry
}

/** Resolve the `$system` source fence before an adapter delegates app imports. */
export function appAutoImportsForSystem(
  value: VanityAppAutoImports,
  system: NonNullable<VanityConfig['compiler']>['system'],
): VanityAppAutoImports {
  const replace = (source: string): string => source === '$system' ? styleSource('$system', system) : source
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
    throw new Error(
      `[vanity] the configured ${owner} module does not exist: ${path}\n`
      + `  fix: point ${owner} at a readable module`,
    )
  }
}

function uniqueNames(sources: readonly AutoImportDeclarationSource[]): string[] {
  return [...new Set(sources.flatMap(source => source.imports))].sort()
}

function sourcesByName(sources: readonly AutoImportDeclarationSource[]): Map<string, Set<string>> {
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

function assertSourceNamesAreUnambiguous(sources: readonly AutoImportDeclarationSource[], kind: string): void {
  for (const [name, values] of sourcesByName(sources)) {
    if (values.size > 1)
      throw new TypeError(`[vanity] ${kind} '${name}' is provided by both ${[...values].map(value => `'${value}'`).join(' and ')}`)
  }
}
