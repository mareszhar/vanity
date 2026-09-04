/**
 * The Nuxt module ([spec-vue.md §4]): wires the `/vite` plugin, injects
 * the configured system's bound functions into evaluated style modules,
 * registers the configured application imports, and ships the SSR
 * scheme recipe (cookie + `data-scheme`).
 *
 * The Nuxt DevTools tab is the `/vite` plugin's manifest view (`/__vanity/`)
 * embedded — one implementation serves plain Vite and Nuxt alike
 * ([spec-introspection.md §2]).
 */

import type { NuxtModule } from '@nuxt/schema'
import type { Plugin, PluginOption } from 'vite'
import type { VanityAutoImportPlan } from './compiler/auto-imports/autoImportPlan'
import type {
  VanityAppAutoImports,
  VanityAppAutoImportSource,
  VanityAutoImports,
  VanityStyleAutoImports,
} from './config'
import type {
  VanityCompilerOptions,
  VanityViteOptions,
} from './vite'
import { join, resolve } from 'node:path'
import {
  addImports,
  addPluginTemplate,
  addTypeTemplate,
  addVitePlugin,
  defineNuxtModule,
  updateTemplates,
} from '@nuxt/kit'
import { isPackageSpecifier } from './compiler/auto-imports/applicationImports'
import { styleAutoImportDeclarations } from './compiler/auto-imports/autoImportDeclarations'
import { planAutoImportDeclarations } from './compiler/auto-imports/autoImportPlan'
import { configureVanityViteHost } from './compiler/hosts/viteHost'
import { renderVanityNuxtConfigTypes } from './nuxt/configTypes'
import { protectRelativeColorSyntax } from './nuxt/postcss'
import { vanityPlugin } from './vite'

/**
 * Options configured under the `vanity` key in `nuxt.config.ts`.
 *
 * The shape reuses the shared `VanityConfig` contract so `vanity.config.ts`
 * can be passed to Nuxt unchanged. Nuxt narrows `compiler.system` to one
 * project-relative or absolute source entry; paired portable artifacts and
 * multiple system entries are Vite-only options.
 */
export interface VanityNuxtOptions extends Omit<VanityViteOptions, 'compiler'> {
  /** Compiler options; Nuxt evaluates one configured plain system entry. */
  compiler?: Omit<VanityCompilerOptions, 'system'> & {
    /** Path to the consolidated system module; relative paths use Nuxt's root. */
    system?: string
  }
}

/**
 * A user-forced scheme rides a cookie so SSR paints the right mode with no
 * flash ([spec-vue.md §5], [spec-tokens.md §3]). Toggling is writing
 * the cookie — `useCookie('vanity-scheme').value = 'dark'` — the `html`
 * attribute follows reactively, and the emitted `[data-scheme]` scopes pin
 * `color-scheme`. Clear it back to null to follow the OS preference.
 */
const SCHEME_PLUGIN = `
import { defineNuxtPlugin, useCookie, useHead } from '#imports'

export default defineNuxtPlugin(() => {
  const scheme = useCookie('vanity-scheme', { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

  useHead({
    htmlAttrs: {
      'data-scheme': () => (scheme.value === 'light' || scheme.value === 'dark' ? scheme.value : undefined),
    },
  })
})
`

/**
 * Nuxt module entry: `modules: ['@mszr/vanity/nuxt']`.
 *
 * Its `configKey` is `vanity`, so the same `VanityConfig` can be supplied as
 * `vanity: vanityConfig` in `nuxt.config.ts`.
 */
const vanityNuxtModule: NuxtModule<VanityNuxtOptions, VanityNuxtOptions, false> = defineNuxtModule({
  meta: {
    name: '@mszr/vanity',
    configKey: 'vanity',
  },
  defaults: {},
  async setup(options, nuxt) {
    addTypeTemplate({
      filename: 'vanity-config.d.ts',
      getContents: renderVanityNuxtConfigTypes,
    })

    let plan = await planAutoImportDeclarations(options, { root: nuxt.options.rootDir })
    if (plan.style) {
      const styleTemplate = addTypeTemplate({
        filename: 'vanity-style-auto-imports.d.ts',
        getContents: () => renderNuxtStyleAutoImportDeclarations(plan, nuxt.options.rootDir, nuxt.options.buildDir),
      })
      let watched = new Set(plan.style.sources.map(source => source.file))
      nuxt.hook('builder:watch', async (_event, path) => {
        if (!watched.has(resolve(nuxt.options.rootDir, path)))
          return

        plan = await planAutoImportDeclarations(options, { root: nuxt.options.rootDir })
        watched = new Set(plan.style?.sources.map(source => source.file) ?? [])
        await updateTemplates({ filter: template => template.dst === styleTemplate.dst })
      })
    }

    if (plan.app) {
      addImports(plan.app.sources.flatMap(source => source.imports.map(name => ({ name, from: source.from }))))
    }

    // TypeScript cannot natively connect an inferred mapped token handle back
    // to its object-literal definition for rename-symbol. The bundled plugin
    // supplies those graph-aware locations; Nuxt users pay no setup tax.
    installTypescriptPlugin(nuxt.options.typescript.tsConfig as VanityTsConfig)

    // Nuxt's production cssnano default uses a calc parser that rejects CSS
    // relative-color channel identifiers. Keep every safe minification pass,
    // but preserve these standards-valid expressions byte-for-byte.
    protectRelativeColorSyntax(nuxt.options.postcss)

    addVitePlugin(createVitePlugins(vanityPlugin(configureVanityViteHost(
      resolveRootedViteOptions(options, nuxt.options.rootDir),
      'nuxt',
    ))))

    addPluginTemplate({
      filename: 'vanity-scheme.mjs',
      getContents: () => SCHEME_PLUGIN,
    })

    // The DevTools tab: token browser, recipe/anatomy inspector, ports,
    // escapes — the manifest view the /vite plugin serves in dev.
    if (nuxt.options.dev) {
      nuxt.hook('devtools:customTabs' as never, ((tabs: unknown[]) => {
        tabs.push({
          name: 'vanity',
          title: 'vanity',
          icon: 'i-carbon-color-palette',
          view: { type: 'iframe', src: '/__vanity/' },
        })
      }) as never)
    }
  },
})

export default vanityNuxtModule

interface VanityTsConfig {
  compilerOptions?: {
    plugins?: Array<{ name: string } & Record<string, unknown>>
    [key: string]: unknown
  }
  [key: string]: unknown
}

function installTypescriptPlugin(tsconfig: VanityTsConfig): void {
  const compilerOptions = tsconfig.compilerOptions ??= {}
  const plugins = compilerOptions.plugins ??= []

  if (!plugins.some(plugin => plugin.name === '@mszr/vanity/typescript'))
    plugins.push({ name: '@mszr/vanity/typescript' })
}

/** Nuxt's Vite root may be `srcDir`; authored config paths are project-root relative. */
function resolveRootedViteOptions(options: VanityNuxtOptions, root: string): VanityViteOptions {
  const compiler = options.compiler ?? {}
  return {
    ...options,
    compiler: {
      ...compiler,
      ...(compiler.system === undefined ? {} : { system: resolveRootedSource(compiler.system, root) }),
    },
    ...(options.autoImports === undefined ? {} : { autoImports: resolveRootedAutoImports(options.autoImports, root) }),
  }
}

/**
 * Nuxt owns application globals through `addImports`. A shared source would
 * otherwise declare the same global once as Nuxt's `const` and once as a style
 * `var`, which collapses the useful type to `any`. Style-only names remain in
 * this template; exact shared names are already visible in both module roles
 * through Nuxt's native registry.
 */
function renderNuxtStyleAutoImportDeclarations(
  plan: VanityAutoImportPlan,
  root: string,
  buildDir: string | undefined,
): string {
  const style = plan.style
  if (style === undefined)
    return ''

  const appNamesBySource = new Map<string, Set<string>>()
  for (const source of plan.app?.sources ?? []) {
    const names = appNamesBySource.get(source.from) ?? new Set<string>()
    for (const name of source.imports)
      names.add(name)
    appNamesBySource.set(source.from, names)
  }

  const path = join(buildDir ?? join(root, '.nuxt'), 'vanity-style-auto-imports.d.ts')
  return styleAutoImportDeclarations(style.sources.map(source => ({
    ...source,
    imports: source.imports.filter(name => !appNamesBySource.get(source.from)?.has(name)),
  })), { relativeTo: path })
}

function resolveRootedAutoImports(value: VanityAutoImports, root: string): VanityAutoImports {
  if (typeof value === 'string')
    return resolveRootedSource(value, root)

  return {
    ...value,
    ...(value.shared === undefined ? {} : { shared: resolveRootedStyleSource(value.shared, root) }),
    ...(value.style === undefined ? {} : { style: resolveRootedStyleSource(value.style, root) }),
    ...(value.app === undefined ? {} : { app: resolveRootedApplicationSource(value.app, root) }),
  }
}

function resolveRootedStyleSource(value: VanityStyleAutoImports, root: string): VanityStyleAutoImports {
  if (typeof value === 'string')
    return resolveRootedSource(value, root)
  return {
    ...value,
    ...(value.from === undefined ? {} : { from: resolveRootedSource(value.from, root) }),
  }
}

function resolveRootedApplicationSource(value: VanityAppAutoImports, root: string): VanityAppAutoImports {
  if (typeof value === 'string')
    return resolveRootedSource(value, root)
  if (!('sources' in value) || value.sources === undefined)
    return value
  return {
    ...value,
    sources: value.sources.map(source => resolveRootedApplicationEntry(source, root)),
  }
}

function resolveRootedApplicationEntry(
  source: string | VanityAppAutoImportSource,
  root: string,
): string | VanityAppAutoImportSource {
  if (typeof source === 'string')
    return resolveRootedSource(source, root)
  return { ...source, from: resolveRootedSource(source.from, root) }
}

function resolveRootedSource(source: string, root: string): string {
  if (source === '$system' || isPackageSpecifier(source))
    return source
  return resolve(root, source)
}

function createVitePlugins(options: PluginOption[]): Plugin[] {
  const plugins: Plugin[] = []

  for (const option of options) {
    collectVitePlugin(option, plugins)
  }

  return plugins
}

function collectVitePlugin(option: PluginOption, plugins: Plugin[]): void {
  if (Array.isArray(option)) {
    for (const nested of option) {
      collectVitePlugin(nested, plugins)
    }

    return
  }

  if (isVitePlugin(option)) {
    plugins.push(option)
  }
}

function isVitePlugin(option: unknown): option is Plugin {
  return typeof option === 'object' && option !== null && 'name' in option
}
