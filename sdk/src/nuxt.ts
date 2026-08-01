/**
 * The Nuxt module ([spec-vue.md §4]): wires the `/vite` plugin, injects
 * the configured system's bound functions into evaluated style modules, and
 * ships the SSR scheme recipe (cookie + `data-scheme`). It deliberately does
 * not register application auto-imports; that remains the Nuxt app's choice.
 *
 * The Nuxt DevTools tab is the `/vite` plugin's manifest view (`/__vanity/`)
 * embedded — one implementation serves plain Vite and Nuxt alike
 * ([spec-introspection.md §2]).
 */

import type { NuxtModule } from '@nuxt/schema'
import type { Plugin, PluginOption } from 'vite'
import type { VanityAutoImports, VanityViteOptions } from './vite'
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import {
  addPluginTemplate,
  addTypeTemplate,
  addVitePlugin,
  defineNuxtModule,
  resolveAlias,
  updateTemplates,
} from '@nuxt/kit'
import { protectRelativeColorSyntax } from './nuxt/postcss'
import { styleAutoImportDeclarations, styleExportNames, vanityPlugin } from './vite'

/**
 * Optional application auto-imports for Vue-facing Vanity helpers.
 *
 * Nothing registers these implicitly. A Nuxt app opts in visibly:
 *
 * `imports: { presets: [...vanityNuxtImports] }`
 */
export const vanityNuxtImports = [
  {
    from: '@mszr/vanity/vue',
    imports: ['propsOf', 'useAnatomy', 'usePorts'],
  },
  {
    from: '@mszr/vanity/runtime',
    imports: ['ports', 'setCustomProperties', 'setCustomProperty'],
  },
]

export interface VanityNuxtOptions extends Omit<VanityViteOptions, 'autoImports'> {
  /**
   * The plain consolidated system module (`~/design/system.ts`). Vite projects
   * app/SSR imports from its portable contract.
   */
  system?: string
  /**
   * Opt into generated globals inside evaluated `*.css.ts` files.
   *
   * `true` reads exports from `system`; `{ from }` keeps the locked contract
   * and its style-only authoring facade as separate plain modules.
   */
  styleAutoImports?: boolean | {
    readonly from: string
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
    const { system, styleAutoImports = false, ...viteOptions } = options
    let autoImports: VanityAutoImports | undefined
    let systemEntry: string | undefined
    let autoImportEntry: string | undefined
    const resolveSourcePath = (path: string) => {
      const aliased = resolveAlias(path, nuxt.options.alias)
      return isAbsolute(aliased) ? aliased : resolve(nuxt.options.rootDir, aliased)
    }

    if (system) {
      systemEntry = resolveSourcePath(system)
      readSystemModule(systemEntry)
    }

    if (systemEntry && styleAutoImports) {
      autoImportEntry = styleAutoImports === true
        ? systemEntry
        : resolveSourcePath(styleAutoImports.from)
      readSystemModule(autoImportEntry)

      // Fail at configuration time for a missing system, even when it
      // currently has no value exports. A zero-export declaration remains a
      // valid generated state and can grow without restarting Nuxt.
      // Let the Vite integration rediscover value exports on every system
      // source change; pinning an initial list would stale the injection shim
      // until a dev-server restart.
      autoImports = {
        from: autoImportEntry,
        emitDeclarations: false,
        registerTypes: false,
      }

      const declarations = addTypeTemplate({
        filename: 'vanity-auto-imports.d.ts',
        getContents: () => {
          const currentNames = styleExportNames(readSystemModule(autoImportEntry!))
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

    // TypeScript cannot natively connect an inferred mapped token handle back
    // to its object-literal definition for rename-symbol. The bundled plugin
    // supplies those graph-aware locations; Nuxt users pay no setup tax.
    installTypescriptPlugin(nuxt.options.typescript.tsConfig as VanityTsConfig)

    // Nuxt's production cssnano default uses a calc parser that rejects CSS
    // relative-color channel identifiers. Keep every safe minification pass,
    // but preserve these standards-valid expressions byte-for-byte.
    protectRelativeColorSyntax(nuxt.options.postcss)

    addVitePlugin(toVitePlugins(vanityPlugin({
      ...viteOptions,
      ...(systemEntry === undefined || /\.css\.[cm]?[jt]sx?$/.test(systemEntry)
        ? {}
        : { system: systemEntry }),
      autoImports,
    })))

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

function readSystemModule(from: string): string {
  try {
    return readFileSync(from, 'utf-8')
  }
  catch {
    throw new Error(
      `[vanity] the configured system module does not exist: ${from}\n`
      + `  fix: point vanity.system at your plain consolidated module — e.g. system: '~/design/system.ts'`,
    )
  }
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
