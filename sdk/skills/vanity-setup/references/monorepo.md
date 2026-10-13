# One design system, many surfaces

Layout for a workspace where several deployables (a marketing site, a web app wrapped by Tauri for desktop/mobile, a WXT browser extension) share one design system and shared components. Every surface consumes the packages **as source**: the consuming build compiles their `*.css.ts`.

```text
packages/design-system/        tokens, conditions, axes; the authoring barrel; the Vanity config
packages/design-components/    shared Vue components + their *.css.ts
packages/nuxt-base/            Nuxt layer: registers Vanity once for every Nuxt surface
apps/site/                     Nuxt, extends nuxt-base
apps/web/                      Nuxt (SPA/static); Tauri wraps its static build
apps/extension/                WXT + Vue
```

## The design-system package

```json
{
  "name": "@acme/design-system",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./authoring": "./src/authoring.ts",
    "./system": "./src/system.ts",
    "./vanity": "./src/vanity.ts"
  },
  "dependencies": { "@mszr/vanity": "^0.8.0" }
}
```

```ts
// src/system.ts — the only place the system is built
import { createSystem } from '@mszr/vanity'

export const ds = createSystem()/* … */.consolidate({ prefix: 'acme', root: ':root' })
```

```ts
// src/index.ts — what app code may import: the locked system
export { ds } from './system.ts'
```

```ts
// src/authoring.ts — the names style modules use bare
import { ds } from './system.ts'

export { ds }
export const { anatomy, class: cls, fragment, keyframes, port, raw, recipe, rules, t } = ds
```

```ts
// src/vanity.ts — one config object for every host
import { fileURLToPath } from 'node:url'
import { defineVanityConfig } from '@mszr/vanity/config'

const entry = (name: string) => fileURLToPath(import.meta.resolve(`./${name}.ts`))

export default defineVanityConfig({
  compiler: { system: entry('system') },
  autoImports: { style: entry('authoring'), app: ['core', 'vue'] },
})
```

Resolving entries with `import.meta.resolve` makes the config correct from any consumer's root.

## Nuxt surfaces through a shared layer

```ts
// packages/nuxt-base/nuxt.config.ts
import { fileURLToPath } from 'node:url'
import vanityConfig from '@acme/design-system/vanity'

export default defineNuxtConfig({
  modules: ['@mszr/vanity/nuxt'],
  vanity: vanityConfig,
  // document rules for every surface; resolve explicitly because `~` would point at the extending app
  css: [fileURLToPath(import.meta.resolve('./app/styles/globals.css.ts'))],
  typescript: { tsConfig: { vueCompilerOptions: { plugins: ['@vue/language-plugin-pug'] } } },
})

// apps/site/nuxt.config.ts
export default defineNuxtConfig({ extends: ['@acme/nuxt-base'] })
```

Each surface lists `@acme/design-system` (and `@mszr/vanity`) in its `dependencies` so auto-import declarations resolve as packages.

## Tauri

Tauri ships the web app's static build (`nuxt generate`/SPA output). Nothing Vanity-specific is needed: the CSS is ordinary static files. Use the same system; desktop/mobile differences belong in conditions (`media('(hover: hover)')`, `media('(pointer: coarse)')`) or an axis set by the shell at startup.

## WXT extension

```ts
// apps/extension/wxt.config.ts
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue', '@mszr/vanity/wxt'],
})

// apps/extension/vanity.config.ts — the WXT module reads this conventional file
export { default } from '@acme/design-system/vanity'
```

WXT runs its own Vite build per entrypoint (popup, options, content script); the module mounts Vanity in it and registers the generated declarations during `wxt prepare`. Popup and options pages are ordinary documents: the shared system works unchanged.

Content scripts render inside someone else's page, where `:root` tokens would leak into (and be overridden by) the host page. Mount content-script UI inside a shadow root and load the extension's CSS there. A separately rooted system for embedded UI needs its own system module (one module exports one system) listed alongside the main one in `compiler.system`. Vite, Nuxt, and WXT accept paths, source objects, and mixed lists; test embedded topologies in a real extension build, including shadow-root CSS delivery.

## Packages that ship `*.css.ts`

A components package isn't built on its own; each consumer compiles its style modules. Two rules make that work everywhere:

1. **Import authoring names explicitly** in the package's style modules, because a consumer's program may not declare the ambient names:

   ```ts
   // packages/design-components/src/UiButton/UiButton.css.ts
   import { cls, recipe, t } from '@acme/design-system/authoring'
   ```

2. **Don't pre-bundle or externalize it.** Vanity already declares every package that depends on `@mszr/vanity` to Vite (`optimizeDeps.exclude`, `ssr.noExternal`). An explicit `optimizeDeps.include`/`ssr.external` entry for it raises `VANITY_VITE_SOURCE_PACKAGE_BYPASSED`; remove the entry.

Name the package's component exports from `src/index.ts`; consumers register them with Nuxt's `components` option or import them directly.

## Typechecking a package on its own

A package typechecked in isolation (`vue-tsc -p packages/design-components`) has no Nuxt to generate declarations. Either:

- import authoring names explicitly (rule 1 above) — nothing else needed; or
- run `npx vanity prepare --config <path-to-vanity.config.ts>` before typechecking and include the generated `.vanity/types/*.d.ts` (or the `vanity-style-auto-imports` / `vanity-app-auto-imports` entries in `compilerOptions.types`). `vanity prepare` reports `VANITY_AUTO_IMPORT_DECLARATIONS_NOT_INCLUDED` when the tsconfig misses them.

## Duplicate installs

pnpm can install the same Vanity version more than once (different peer sets). Vanity deduplicates systems by their content, not by file path, so this is fine. Two *different* systems claiming the same prefix and root fail loudly with both owners named; give each system its own `prefix`.
