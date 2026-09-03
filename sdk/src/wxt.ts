/**
 * WXT adapter: projects Vanity's host-neutral compiler and declaration plan
 * through WXT's native module hooks. It owns no compiler primitive.
 */

import type { VanityConfig } from './config'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { addViteConfig, defineWxtModule } from 'wxt/modules'
import { appAutoImportDeclarations, styleAutoImportDeclarations } from './compiler/auto-imports/autoImportDeclarations'
import { loadVanityConfig, planAutoImportDeclarations } from './prepare'
import { vanityPlugin } from './vite'

export type { VanityConfig } from './config'

/** WXT module entry: add `@mszr/vanity/wxt` to WXT's `modules` list. */
const vanityWxtModule = defineWxtModule<VanityConfig>({
  configKey: 'vanity',
  async setup(wxt, options) {
    const configPath = join(wxt.config.root, 'vanity.config.ts')
    // WXT supplies `{}` for an omitted module option. Treat that exactly like
    // no option so `modules: ['@mszr/vanity/wxt']` can use the shared config.
    const inlineOptions = options ?? {}
    const hasInlineOptions = Object.keys(inlineOptions).length > 0
    const vanity = hasInlineOptions
      ? inlineOptions
      : existsSync(configPath)
        ? await loadVanityConfig(configPath, { root: wxt.config.root })
        : {}
    addViteConfig(wxt, () => ({ plugins: vanityPlugin(vanity) }))

    wxt.hook('prepare:types', async (_wxt, entries) => {
      const plan = await planAutoImportDeclarations(vanity, { root: wxt.config.root })
      if (plan.style) {
        const path = join(wxt.config.wxtDir, 'types', 'vanity-style-auto-imports.d.ts')
        entries.push({
          path,
          text: styleAutoImportDeclarations(plan.style.sources, { relativeTo: path }),
          tsReference: true,
        })
      }
      if (plan.app) {
        const path = join(wxt.config.wxtDir, 'types', 'vanity-app-auto-imports.d.ts')
        entries.push({
          path,
          text: appAutoImportDeclarations(plan.app.sources, {
            declarationFile: path,
            vueTemplates: plan.app.vueTemplates,
          }),
          tsReference: true,
        })
      }
    })
  },
})

export default vanityWxtModule
