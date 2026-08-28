/**
 * The Nuxt module ([spec-vue.md §4]): wires the `/vite` plugin, injects
 * the configured system's bound functions into evaluated style modules,
 * registers the configured application runtime imports, and ships the SSR
 * scheme recipe (cookie + `data-scheme`).
 *
 * The Nuxt DevTools tab is the `/vite` plugin's manifest view (`/__vanity/`)
 * embedded — one implementation serves plain Vite and Nuxt alike
 * ([spec-introspection.md §2]).
 */

import type { NuxtModule } from '@nuxt/schema'
import type { Plugin, PluginOption } from 'vite'
import type {
  VanityCompilerOptions,
  VanityRuntimeAutoImports,
  VanityViteOptions,
} from './vite'
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import {
  addImports,
  addImportsSources,
  addPluginTemplate,
  addTypeTemplate,
  addVitePlugin,
  defineNuxtModule,
  resolveAlias,
  updateTemplates,
} from '@nuxt/kit'
import { selectAutoImportNames } from './internal/autoImportNames'
import { exportNamesFromFile } from './internal/exportNames'
import {
  isPackageSpecifier,
  normalizeRuntimeAutoImports,
  runtimeAutoImportIgnore,
} from './internal/runtimeAutoImports'
import { withVanityViteHost } from './internal/viteHost'
import { protectRelativeColorSyntax } from './nuxt/postcss'
import { styleAutoImportDeclarations, styleExportNames, vanityPlugin } from './vite'

export interface VanityNuxtOptions extends Omit<VanityViteOptions, 'compiler'> {
  /** Nuxt's adapter accepts one configured plain system entry. */
  compiler?: Omit<VanityCompilerOptions, 'system'> & {
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

/** Nuxt module entry: `modules: ['@mszr/vanity/nuxt']`. */
const vanityNuxtModule: NuxtModule<VanityNuxtOptions, VanityNuxtOptions, false> = defineNuxtModule({
  meta: {
    name: '@mszr/vanity',
    configKey: 'vanity',
  },
  defaults: {},
  setup(options, nuxt) {
    const compiler = options.compiler ?? {}
    const app = options.app ?? {}
    const { system, styleAutoImports = false, ...viteOptions } = compiler
    let styleImports: NonNullable<VanityCompilerOptions['styleAutoImports']> | undefined
    let systemEntry: string | undefined
    let autoImportEntry: string | undefined
    const resolveSourcePath = (path: string) => {
      const aliased = resolveAlias(path, nuxt.options.alias)
      return isAbsolute(aliased) ? aliased : resolve(nuxt.options.rootDir, aliased)
    }

    if (system) {
      systemEntry = resolveSourcePath(system)
      readConfiguredModule(systemEntry)
    }

    if (styleAutoImports) {
      autoImportEntry = resolveNuxtStyleAutoImportSource(styleAutoImports, systemEntry, resolveSourcePath)
      readConfiguredModule(autoImportEntry)

      // Fail at configuration time for a missing system, even when it
      // currently has no value exports. A zero-export declaration remains a
      // valid generated state and can grow without restarting Nuxt.
      // Let the Vite integration rediscover value exports on every system
      // source change; pinning an initial list would stale the injection shim
      // until a dev-server restart.
      styleImports = typeof styleAutoImports === 'object'
        ? styleAutoImports.include !== undefined
          ? { from: autoImportEntry, include: styleAutoImports.include }
          : { from: autoImportEntry, exclude: styleAutoImports.exclude }
        : autoImportEntry

      const declarations = addTypeTemplate({
        filename: 'vanity-style-auto-imports.d.ts',
        getContents: () => {
          const currentNames = selectAutoImportNames(
            styleExportNames(readConfiguredModule(autoImportEntry!)),
            typeof styleAutoImports === 'object' ? styleAutoImports : {},
            '[vanity] compiler.styleAutoImports',
          )
          return styleAutoImportDeclarations(autoImportEntry!, currentNames)
        },
      })

      // Nuxt regenerates the type template during prepare. This explicit
      // watch edge also covers export additions/removals while the same dev
      // server is running. Nuxt can report watched paths as root-relative.
      nuxt.hook('builder:watch', async (_event, path) => {
        if (resolveSourcePath(path) === autoImportEntry)
          await updateTemplates({ filter: template => template.dst === declarations.dst })
      })
    }

    if (app.runtimeAutoImports !== undefined)
      registerNuxtRuntimeAutoImports(app.runtimeAutoImports, resolveSourcePath)

    // TypeScript cannot natively connect an inferred mapped token handle back
    // to its object-literal definition for rename-symbol. The bundled plugin
    // supplies those graph-aware locations; Nuxt users pay no setup tax.
    installTypescriptPlugin(nuxt.options.typescript.tsConfig as VanityTsConfig)

    // Nuxt's production cssnano default uses a calc parser that rejects CSS
    // relative-color channel identifiers. Keep every safe minification pass,
    // but preserve these standards-valid expressions byte-for-byte.
    protectRelativeColorSyntax(nuxt.options.postcss)

    addVitePlugin(toVitePlugins(vanityPlugin(withVanityViteHost({
      compiler: {
        ...viteOptions,
        ...(systemEntry === undefined || /\.css\.[cm]?[jt]sx?$/.test(systemEntry)
          ? {}
          : { system: systemEntry }),
        ...(styleImports === undefined ? {} : { styleAutoImports: styleImports }),
      },
    }, 'nuxt'))))

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

function readConfiguredModule(from: string): string {
  try {
    return readFileSync(from, 'utf-8')
  }
  catch {
    throw new Error(
      `[vanity] the configured Vanity module does not exist: ${from}\n`
      + `  fix: point compiler.system or compiler.styleAutoImports at a readable module`,
    )
  }
}

function resolveNuxtStyleAutoImportSource(
  value: Exclude<NonNullable<VanityCompilerOptions['styleAutoImports']>, false>,
  systemEntry: string | undefined,
  resolveSourcePath: (path: string) => string,
): string {
  if (typeof value === 'string')
    return resolveSourcePath(value)

  if (typeof value === 'object' && value.from !== undefined)
    return resolveSourcePath(value.from)

  if (systemEntry === undefined) {
    throw new TypeError(
      '[vanity] compiler.styleAutoImports without a source requires one plain compiler.system entry',
    )
  }

  return systemEntry
}

function toVitePlugins(options: PluginOption[]): Plugin[] {
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

function registerNuxtRuntimeAutoImports(
  value: VanityRuntimeAutoImports,
  resolveSourcePath: (path: string) => string,
): void {
  const config = normalizeRuntimeAutoImports(value)

  for (const preset of config.presets) {
    addImports(preset.imports.map(importName => ({
      name: importName,
      from: preset.from,
    })))
  }

  for (const source of config.sources) {
    const sourceFrom = source.from

    if (isPackageSpecifier(source.from)) {
      const ignore = runtimeAutoImportIgnore(source)
      const packagePreset: Parameters<typeof addImportsSources>[0] = {
        package: source.from,
        ...(ignore === undefined ? {} : { ignore: [ignore] }),
      }
      addImportsSources(packagePreset)
      continue
    }

    const from = resolveSourcePath(source.from)
    const names = exportNamesFromFile(from)
    const selected = selectAutoImportNames(names, source, `[vanity] app.runtimeAutoImports source '${sourceFrom}'`)

    addImports(selected.map(name => ({ name, from })))
  }
}
