import type {
  VanityConfig,
  VanityRuntimeAutoImports,
  VanityStyleAutoImports,
} from '../config'
import type { AutoImportDeclarationFile, AutoImportDeclarationSource } from './autoImportDeclarations'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { normalizePath } from '@vanilla-extract/integration'
import {
  generatedAutoImportBridge,
  moduleSpecifierFor,
  runtimeAutoImportDeclarations,
  styleAutoImportDeclarations,
} from './autoImportDeclarations'
import { selectAutoImportNames } from './autoImportNames'
import { exportNamesFromFile } from './exportNames'
import { resolveRuntimeAutoImports } from './runtimeAutoImports'

export type { AutoImportDeclarationFile } from './autoImportDeclarations'

const styleFileName = 'style-auto-imports.d.ts'
const runtimeFileName = 'runtime-auto-imports.d.ts'

export interface AutoImportDeclarationPaths {
  readonly declaration: string
  readonly bridge: string
}

export interface VanityStyleAutoImportPlan {
  readonly from: string
  readonly names: readonly string[]
  readonly declaration: AutoImportDeclarationFile
  readonly bridge: AutoImportDeclarationFile
}

export interface VanityRuntimeAutoImportPlan {
  readonly sources: readonly AutoImportDeclarationSource[]
  readonly names: readonly string[]
  readonly vueTemplates: boolean
  readonly declaration: AutoImportDeclarationFile
  readonly bridge: AutoImportDeclarationFile
}

export interface VanityAutoImportPlan {
  readonly root: string
  readonly style?: VanityStyleAutoImportPlan
  readonly runtime?: VanityRuntimeAutoImportPlan
  readonly declarations: readonly AutoImportDeclarationFile[]
  readonly bridges: readonly AutoImportDeclarationFile[]
}

export function autoImportDeclarationPaths(root: string, lane: 'style' | 'runtime'): AutoImportDeclarationPaths {
  const name = lane === 'style' ? styleFileName : runtimeFileName
  return {
    declaration: join(root, '.vanity', 'types', name),
    bridge: join(root, 'node_modules', '@types', `vanity-${lane}-auto-imports`, 'index.d.ts'),
  }
}

export async function planAutoImportDeclarations(
  options: VanityConfig,
  context: { root: string },
): Promise<VanityAutoImportPlan> {
  const root = normalizePath(resolve(context.root))
  const style = await planStyleAutoImports(options.compiler?.styleAutoImports, options.compiler?.system, root)
  const runtime = await planRuntimeAutoImports(options.app?.runtimeAutoImports, root)

  assertAutoImportLaneSeparation(style?.names ?? [], runtime?.names ?? [])

  return {
    root,
    style,
    runtime,
    declarations: [
      ...(style === undefined ? [] : [style.declaration]),
      ...(runtime === undefined ? [] : [runtime.declaration]),
    ],
    bridges: [
      ...(style === undefined ? [] : [style.bridge]),
      ...(runtime === undefined ? [] : [runtime.bridge]),
    ],
  }
}

/** Refuse ambiguous globals before either host registers its auto-import lane. */
export function assertAutoImportLaneSeparation(
  styleNames: readonly string[],
  runtimeNames: readonly string[],
): void {
  const runtime = new Set(runtimeNames)
  const duplicate = styleNames.find(name => runtime.has(name))
  if (duplicate !== undefined) {
    throw new TypeError(
      `[vanity] auto-import '${duplicate}' is exposed by both compiler.styleAutoImports and app.runtimeAutoImports\n`
      + '  fix: rename one export, or narrow one lane with include or exclude',
    )
  }
}

export async function planStyleAutoImports(
  value: VanityStyleAutoImports | undefined,
  system: NonNullable<VanityConfig['compiler']>['system'],
  root: string,
): Promise<VanityStyleAutoImportPlan | undefined> {
  if (value === undefined || value === false)
    return undefined

  const from = resolveStyleSource(value, system, root)
  await readSource(from, 'compiler.styleAutoImports')
  const filter = typeof value === 'object' ? value : {}
  const names = selectAutoImportNames(
    exportNamesFromFile(from, root),
    filter,
    '[vanity] compiler.styleAutoImports',
  )
  const paths = autoImportDeclarationPaths(root, 'style')
  const declaration: AutoImportDeclarationFile = {
    lane: 'style',
    kind: 'declaration',
    typeScriptReference: true,
    path: paths.declaration,
    text: styleAutoImportDeclarations(from, names, { relativeTo: paths.declaration }),
  }
  const bridge: AutoImportDeclarationFile = {
    lane: 'style',
    kind: 'bridge',
    typeScriptReference: false,
    path: paths.bridge,
    text: generatedAutoImportBridge(moduleSpecifierFor(paths.declaration, paths.bridge)),
  }

  return { from, names, declaration, bridge }
}

async function planRuntimeAutoImports(
  value: VanityRuntimeAutoImports | undefined,
  root: string,
): Promise<VanityRuntimeAutoImportPlan | undefined> {
  if (value === undefined)
    return undefined

  const resolved = resolveRuntimeAutoImports(value, root)
  const sources: AutoImportDeclarationSource[] = resolved.sources.map(source => ({
    from: source.from,
    imports: [...source.imports],
  }))

  const paths = autoImportDeclarationPaths(root, 'runtime')
  const { names, vueTemplates } = resolved
  const declaration: AutoImportDeclarationFile = {
    lane: 'runtime',
    kind: 'declaration',
    typeScriptReference: true,
    path: paths.declaration,
    text: runtimeAutoImportDeclarations(sources, {
      declarationFile: paths.declaration,
      vueTemplates,
    }),
  }
  const bridge: AutoImportDeclarationFile = {
    lane: 'runtime',
    kind: 'bridge',
    typeScriptReference: false,
    path: paths.bridge,
    text: generatedAutoImportBridge(moduleSpecifierFor(paths.declaration, paths.bridge)),
  }

  return { sources, names, vueTemplates, declaration, bridge }
}

function resolveStyleSource(
  value: VanityStyleAutoImports,
  system: NonNullable<VanityConfig['compiler']>['system'],
  root: string,
): string {
  const explicit = typeof value === 'string' ? value : typeof value === 'object' ? value.from : undefined
  if (explicit !== undefined)
    return resolveLocalSource(explicit, root, 'compiler.styleAutoImports')

  if (typeof system !== 'string') {
    throw new TypeError(
      '[vanity] compiler.styleAutoImports without a source requires one plain compiler.system entry',
    )
  }

  return resolveLocalSource(system, root, 'compiler.system')
}

function resolveLocalSource(value: string, root: string, owner: string): string {
  if (isAbsolute(value))
    return normalizePath(value)

  if (value.startsWith('~')) {
    throw new Error(
      `[vanity] ${owner} cannot resolve '${value}' outside a framework alias; `
      + 'use a project-relative or absolute path',
    )
  }

  return normalizePath(resolve(root, value))
}

async function readSource(path: string, owner: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  }
  catch {
    throw new Error(
      `[vanity] the configured ${owner} module does not exist: ${path}\n`
      + `  fix: point ${owner} at a readable module`,
    )
  }
}
