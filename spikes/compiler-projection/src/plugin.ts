import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import type { CompiledStyleDefinition, PortableContract } from './types.ts'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { normalizePath } from 'vite'
import { renderLayerOrderPrelude, renderStyleCss, renderSystemCss } from './css.ts'
import { discoverLocalDependencies } from './dependencies.ts'
import { writeIfChanged } from './files.ts'
import { fingerprint } from './hash.ts'
import { compileStyle, readContract } from './worker-client.ts'

const PUBLIC_SYSTEM_CSS = 'virtual:compiler-projection/system/'
const PUBLIC_STYLE_CSS = 'virtual:compiler-projection/style/'
const RESOLVED_RUNTIME = '\0compiler-projection:runtime:'
const RESOLVED_SYSTEM_CSS = '\0compiler-projection:system-css:'
const RESOLVED_STYLE_CSS = '\0compiler-projection:style-css:'

export interface ContractSource {
  entry: string
  artifact?: string
}

export interface CompilerProjectionOptions {
  contracts: Array<string | ContractSource>
  target: 'browser' | 'ssr'
  layerOrder: string[]
  artifactDirectory: string
  cascadeFileName?: string
}

export interface ProjectionSnapshot {
  revision: number
  cssWrites: number
  manifestWrites: number
  compatibilityIds: string[]
  cssIds: string[]
  runtimeModuleIds: string[]
  errors: string[]
  manifestFile: string
  systemCssFiles: string[]
}

export interface CompilerProjectionHarness {
  plugin: Plugin
  snapshot: () => ProjectionSnapshot
}

interface NormalizedSource {
  entry: string
  artifact?: string
  dependencies: Set<string>
}

function cleanId(id: string): string {
  return id.replace(/[?#].*$/, '')
}

function normalizeFile(file: string): string {
  return normalizePath(resolve(cleanId(file)))
}

function asSource(input: string | ContractSource): NormalizedSource {
  if (typeof input === 'string')
    return { entry: normalizeFile(input), dependencies: new Set() }

  return {
    entry: normalizeFile(input.entry),
    artifact: input.artifact ? normalizeFile(input.artifact) : undefined,
    dependencies: new Set(),
  }
}

function isPortableContract(value: unknown): value is PortableContract {
  if (!value || typeof value !== 'object')
    return false
  const candidate = value as Partial<PortableContract>
  return candidate.format === 1
    && typeof candidate.name === 'string'
    && typeof candidate.prefix === 'string'
    && Boolean(candidate.identities)
    && Array.isArray(candidate.tokens)
}

function resolveImport(source: string, importer: string | undefined): string | undefined {
  const cleanSource = cleanId(source)
  if (cleanSource.startsWith('\0') || cleanSource.startsWith('virtual:'))
    return undefined
  if (isAbsolute(cleanSource))
    return normalizeFile(cleanSource)
  if (!cleanSource.startsWith('.') || !importer)
    return undefined
  return normalizeFile(resolve(dirname(cleanId(importer)), cleanSource))
}

function runtimeModule(contract: PortableContract, target: 'browser' | 'ssr'): string {
  const tokenNames = Object.fromEntries(contract.tokens.map(token => [token.name, `--${contract.prefix}-${token.name}`]))
  const shared = {
    compatibilityId: contract.identities.compatibility,
    runtimeSchemaId: contract.identities.runtime,
    tokenNames,
    ports: contract.runtimePorts,
  }

  if (target === 'ssr') {
    return [
      `const projection = ${JSON.stringify(shared)};`,
      `export const ds = Object.freeze({`,
      `  plane: "SSR_FACADE_SENTINEL",`,
      `  ...projection,`,
      `  snapshot(values = {}) { return JSON.stringify({ schema: projection.runtimeSchemaId, values }) },`,
      `});`,
      `export const unusedProjection = () => "UNUSED_RUNTIME_SENTINEL";`,
      '',
    ].join('\n')
  }

  return [
    `const projection = ${JSON.stringify(shared)};`,
    `export const ds = Object.freeze({`,
    `  plane: "RUNTIME_FACADE_SENTINEL",`,
    `  ...projection,`,
    `  apply(root, name, value) { root.style.setProperty(projection.tokenNames[name], value) },`,
    `});`,
    `export const unusedProjection = () => "UNUSED_RUNTIME_SENTINEL";`,
    '',
  ].join('\n')
}

export function compilerProjection(options: CompilerProjectionOptions): CompilerProjectionHarness {
  if (options.contracts.length === 0)
    throw new Error('[projection] at least one contract source is required')
  if (options.layerOrder.length === 0)
    throw new Error('[projection] cascade prelude requires at least one layer root')

  const sources = options.contracts.map(asSource)
  const artifactByEntry = new Map<string, PortableContract>()
  const contractByRuntimeId = new Map<string, PortableContract>()
  const systemCssById = new Map<string, string>()
  const styleCssById = new Map<string, string>()
  const styleByFile = new Map<string, CompiledStyleDefinition>()
  const styleDependencies = new Map<string, Set<string>>()
  const attemptedStyles = new Set<string>()
  const errors = new Map<string, string>()
  const runtimeIds = new Set<string>()
  const writtenSystemFiles = new Map<string, string>()
  const manifestFile = join(resolve(options.artifactDirectory), 'manifest.json')
  const cascadeFileName = options.cascadeFileName ?? 'assets/cascade.css'

  let config: ResolvedConfig | undefined
  let devServer: ViteDevServer | undefined
  let revision = 0
  let cssWrites = 0
  let manifestWrites = 0

  async function artifactFor(source: NormalizedSource): Promise<PortableContract> {
    if (source.artifact) {
      const parsed: unknown = JSON.parse(await readFile(source.artifact, 'utf8'))
      if (!isPortableContract(parsed))
        throw new Error(`[projection] invalid precompiled artifact ${source.artifact}`)
      return parsed
    }

    return readContract(source.entry)
  }

  function dependenciesFor(source: NormalizedSource): Set<string> {
    const dependencies = new Set(discoverLocalDependencies(source.entry).map(normalizeFile))
    if (source.artifact)
      dependencies.add(source.artifact)
    source.dependencies = dependencies
    return dependencies
  }

  async function flushManifest(): Promise<void> {
    const systems = sources
      .map((source) => {
        const contract = artifactByEntry.get(source.entry)
        if (!contract)
          return undefined
        return {
          source: source.entry,
          precompiled: Boolean(source.artifact),
          identities: contract.identities,
          name: contract.name,
          prefix: contract.prefix,
          layerRoot: contract.layerRoot,
          tokens: contract.tokens,
          runtimePorts: contract.runtimePorts,
        }
      })
      .filter(system => system !== undefined)
      .sort((a, b) => a.source.localeCompare(b.source))

    const styles = [...styleByFile.entries()]
      .map(([source, style]) => ({
        source,
        className: style.className,
        layer: style.layer,
        contractCompatibilityId: style.contract.identities.compatibility,
      }))
      .sort((a, b) => a.source.localeCompare(b.source))

    const contents = `${JSON.stringify({ format: 1, systems, styles }, null, 2)}\n`
    if (await writeIfChanged(manifestFile, contents))
      manifestWrites++
  }

  async function registerArtifact(entry: string, contract: PortableContract): Promise<void> {
    artifactByEntry.set(entry, contract)
    const css = renderSystemCss(contract)
    systemCssById.set(contract.identities.css, css)

    const systemFile = join(resolve(options.artifactDirectory), 'systems', `${contract.identities.css}.css`)
    writtenSystemFiles.set(contract.identities.css, systemFile)
    if (await writeIfChanged(systemFile, css))
      cssWrites++
  }

  async function refreshSource(source: NormalizedSource): Promise<PortableContract> {
    try {
      dependenciesFor(source)
      const artifact = await artifactFor(source)
      await registerArtifact(source.entry, artifact)
      errors.delete(source.entry)
      revision++
      await flushManifest()
      return artifact
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.set(source.entry, message)
      revision++
      throw error
    }
  }

  async function ensureSource(source: NormalizedSource): Promise<PortableContract> {
    return artifactByEntry.get(source.entry) ?? refreshSource(source)
  }

  function sourceForResolvedFile(file: string): NormalizedSource | undefined {
    const normalized = normalizeFile(file)
    return sources.find(source => source.entry === normalized)
  }

  async function registerCompiledStyle(id: string, style: CompiledStyleDefinition): Promise<string> {
    styleByFile.set(id, style)
    const styleCss = renderStyleCss(style)
    const styleId = fingerprint({ id, css: styleCss })
    styleCssById.set(styleId, styleCss)
    systemCssById.set(style.contract.identities.css, renderSystemCss(style.contract))
    await registerArtifact(
      sources.find(source => artifactByEntry.get(source.entry)?.identities.compatibility === style.contract.identities.compatibility)?.entry
      ?? `style:${id}`,
      style.contract,
    )
    await flushManifest()
    return styleId
  }

  const plugin: Plugin = {
    name: 'compiler-projection-spike',
    enforce: 'pre',

    configResolved(resolved) {
      config = resolved
    },

    configureServer(server) {
      devServer = server
      for (const source of sources)
        server.watcher.add([...dependenciesFor(source)])
    },

    async buildStart() {
      for (const source of sources) {
        for (const dependency of dependenciesFor(source))
          this.addWatchFile(dependency)
        await ensureSource(source)
      }

      if (options.target === 'browser') {
        this.emitFile({
          type: 'asset',
          fileName: cascadeFileName,
          source: renderLayerOrderPrelude(options.layerOrder),
        })
      }
    },

    transformIndexHtml: {
      order: 'pre',
      handler() {
        if (options.target !== 'browser')
          return undefined
        const base = config?.base ?? '/'
        const href = `${base}${base.endsWith('/') ? '' : '/'}${cascadeFileName}`
        return [{
          tag: 'link',
          attrs: { rel: 'stylesheet', href },
          injectTo: 'head-prepend',
        }]
      },
    },

    async resolveId(source, importer) {
      if (source.startsWith(PUBLIC_SYSTEM_CSS))
        return `${RESOLVED_SYSTEM_CSS}${source.slice(PUBLIC_SYSTEM_CSS.length).replace(/\.css$/, '')}.css`
      if (source.startsWith(PUBLIC_STYLE_CSS))
        return `${RESOLVED_STYLE_CSS}${source.slice(PUBLIC_STYLE_CSS.length).replace(/\.css$/, '')}.css`

      const resolved = resolveImport(source, importer)
      if (!resolved)
        return undefined
      const contractSource = sourceForResolvedFile(resolved)
      if (!contractSource)
        return undefined

      const contract = await ensureSource(contractSource)
      const runtimeId = `${options.target}:${contract.identities.compatibility}:${contract.identities.runtime}`
      const virtualId = `${RESOLVED_RUNTIME}${runtimeId}`
      contractByRuntimeId.set(runtimeId, contract)
      runtimeIds.add(virtualId)
      return virtualId
    },

    load(id) {
      if (id.startsWith(RESOLVED_RUNTIME)) {
        const runtimeId = id.slice(RESOLVED_RUNTIME.length)
        const contract = contractByRuntimeId.get(runtimeId)
        if (!contract)
          throw new Error(`[projection] missing runtime artifact '${runtimeId}'`)
        return runtimeModule(contract, options.target)
      }

      if (id.startsWith(RESOLVED_SYSTEM_CSS)) {
        const cssId = id.slice(RESOLVED_SYSTEM_CSS.length).replace(/\.css$/, '')
        const css = systemCssById.get(cssId)
        if (!css)
          throw new Error(`[projection] missing system CSS '${cssId}'`)
        return css
      }

      if (id.startsWith(RESOLVED_STYLE_CSS)) {
        const styleId = id.slice(RESOLVED_STYLE_CSS.length).replace(/\.css$/, '')
        const css = styleCssById.get(styleId)
        if (!css)
          throw new Error(`[projection] missing style CSS '${styleId}'`)
        return css
      }

      return undefined
    },

    async transform(_code, rawId) {
      const id = normalizeFile(rawId)
      if (!id.endsWith('.css.ts') && !id.endsWith('.css.js'))
        return undefined

      attemptedStyles.add(id)
      const dependencies = new Set(discoverLocalDependencies(id).map(normalizeFile))
      styleDependencies.set(id, dependencies)
      for (const dependency of dependencies)
        this.addWatchFile(dependency)
      devServer?.watcher.add([...dependencies])

      try {
        const style = await compileStyle(id)
        const styleId = await registerCompiledStyle(id, style)
        errors.delete(id)
        return {
          code: [
            `import ${JSON.stringify(`${PUBLIC_SYSTEM_CSS}${style.contract.identities.css}.css`)};`,
            `import ${JSON.stringify(`${PUBLIC_STYLE_CSS}${styleId}.css`)};`,
            `export default ${JSON.stringify(style.className)};`,
            '',
          ].join('\n'),
          map: null,
        }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.set(id, message)
        throw new Error(`[projection] failed to compile ${id}\n${message}`)
      }
    },

    async handleHotUpdate({ file, modules, server, timestamp }) {
      const changed = normalizeFile(file)
      const affectedSources = sources.filter(source => source.dependencies.has(changed))
      const affectedStyles = [...attemptedStyles].filter((style) => {
        return style === changed || styleDependencies.get(style)?.has(changed)
      })

      if (affectedSources.length === 0 && affectedStyles.length === 0)
        return undefined

      for (const source of affectedSources) {
        try {
          await refreshSource(source)
        }
        catch {
          // Preserve the last good artifacts. The next transform reports the
          // fresh compiler error; a later change gets another clean attempt.
        }
      }

      const invalidated = new Set(modules)
      const ids = [...affectedStyles, ...runtimeIds]
      for (const id of ids) {
        const module = server.moduleGraph.getModuleById(id)
        if (!module)
          continue
        server.moduleGraph.invalidateModule(module, invalidated, timestamp, true)
        invalidated.add(module)
      }

      return [...invalidated]
    },
  }

  return {
    plugin,
    snapshot() {
      return {
        revision,
        cssWrites,
        manifestWrites,
        compatibilityIds: [...new Set([...artifactByEntry.values()].map(contract => contract.identities.compatibility))].sort(),
        cssIds: [...systemCssById.keys()].sort(),
        runtimeModuleIds: [...runtimeIds].sort(),
        errors: [...errors.values()],
        manifestFile,
        systemCssFiles: [...writtenSystemFiles.values()].sort(),
      }
    },
  }
}
