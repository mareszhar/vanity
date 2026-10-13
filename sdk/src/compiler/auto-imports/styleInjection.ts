/** Shared preparation of the style role's exact compiler injection. */
import type { VanityCompilerOptions, VanityStyleAutoImports } from '../../config'
import type { StyleAutoImportInjection } from '../core/transform'
import type { StyleModuleHost } from '../modules/resolution'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { normalizePath } from '../core/path'
import { buildStyleModule } from '../modules/build'
import { getStyleAutoImportAliases } from '../modules/source'
import { planStyleAutoImports } from './autoImportPlan'
import { writeAutoImportDeclarationFiles } from './autoImportWriter'

export interface StyleAutoImportState {
  systemSource?: string
  systemDeps: Set<string>
  shimContent?: string
}

export async function prepareStyleAutoImports({ values, system, root, state, host, filePath, nativeTypeHost }: {
  values: readonly VanityStyleAutoImports[]
  system: VanityCompilerOptions['system']
  root: string
  state: StyleAutoImportState
  host: StyleModuleHost
  filePath: string
  nativeTypeHost?: 'nuxt'
}): Promise<StyleAutoImportInjection | undefined> {
  if (values.length === 0)
    return undefined

  const stylePlan = await planStyleAutoImports(values, system, root)
  if (stylePlan === undefined)
    return undefined

  const { sources, names } = stylePlan
  const sourceTexts = new Map(await Promise.all(sources.map(async source =>
    [source.file, await readFile(source.file, 'utf-8')] as const,
  )))
  const source = [...sourceTexts.values()].join('\n')

  if (nativeTypeHost !== 'nuxt')
    await writeAutoImportDeclarationFiles([stylePlan.declaration, stylePlan.bridge])

  if (source !== state.systemSource) {
    const bundles = await Promise.all(sources.map(source => buildStyleModule({
      filePath: source.file,
      root,
      ...host,
    })))

    state.systemSource = source
    state.systemDeps = new Set([
      ...sources.map(source => source.file),
      ...bundles.flatMap(bundle => bundle.watchFiles.map(normalizePath)),
    ])
  }

  if (state.systemDeps.has(filePath))
    return undefined

  const ambientAliases = new Map(sources.flatMap(source =>
    [...getStyleAutoImportAliases(sourceTexts.get(source.file)!, source.file, source.imports)],
  ))

  const shim = join(root, 'node_modules', '.vanity', 'vanity-style-auto-imports.mjs')
  const content = names.length === 0
    ? 'export {}\n'
    : `${sources.map(source => `export { ${source.imports.join(', ')} } from '${source.from}'`).join('\n')}\n`
  if (content !== state.shimContent) {
    await mkdir(dirname(shim), { recursive: true })
    await writeFile(shim, content)
    state.shimContent = content
  }

  return names.length === 0 ? undefined : { aliases: ambientAliases, path: shim }
}
