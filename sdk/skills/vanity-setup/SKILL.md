---
name: vanity-setup
description: Install, wire, or upgrade Vanity (@mszr/vanity) in a project — Nuxt module, `vanity.config.ts`, the system module and authoring barrel, auto-imports and generated type declarations, a shared design-system package consumed by several apps or surfaces (Nuxt sites/apps, a WXT browser extension, a Tauri shell), cascade-layer coexistence with other CSS, and dev-server/HMR/upgrade problems. Use this whenever you add Vanity to a repo, create a new surface or package that should use the shared design system, see errors about auto-imports, module roles, or missing declarations, or bump Vanity's version.
---

# Setting up Vanity

Setup happens once per project or surface. Afterwards, styling is `vanity-styling` and the system's content is `vanity-system`.

## 1. The pieces

```text
vanity.config.ts      where the system is, and which names are injected where
design/system.ts      createSystem() … .consolidate() → export const ds   (plain TS)
design/authoring.ts   the authoring barrel: re-exports ds and the helpers style modules use bare
design/base.css.ts    document rules (reset, html/body), imported once by the app shell
**/*.css.ts           style modules: evaluated at build time, emit CSS, export class handles
```

Vanity compiles through Vite 6, 7 or 8. Nuxt, WXT, and plain Vite apps all mount the same compiler.

Style imports use the host's client aliases, resolver plugins and virtual modules. Import a package by name when its Node entry is needed: style modules execute in Node at build time, so a named request selects Node unless the host redirects it into another package. Other aliases keep their selected files, even browser entries. An alias to a different entry of the same named package still resolves from the written package request. Native imports such as `node:fs` are valid in authoring code.

## 2. A Nuxt app

```sh
pnpm add @mszr/vanity
pnpm add -D pug @vue/language-plugin-pug vue-tsc   # Pug templates + typed templates (optional but recommended)
```

```ts
// vanity.config.ts
import { defineVanityConfig } from '@mszr/vanity/config'

export default defineVanityConfig({
  compiler: { system: './app/design/system.ts' },
  autoImports: {
    shared: './app/design/authoring.ts',  // ds + helpers: bare names in *.css.ts, `ds` in app code
    app: ['core', 'vue'],                 // usePorts, useAnatomy, propsOf, ports, setCustomProperty…
  },
})
```

```ts
// nuxt.config.ts
import vanityConfig from './vanity.config.ts'

export default defineNuxtConfig({
  modules: ['@mszr/vanity/nuxt'],
  vanity: vanityConfig,
  typescript: {
    strict: true,
    tsConfig: {
      compilerOptions: { allowImportingTsExtensions: true },          // import * as s from './X.css.ts'
      vueCompilerOptions: { plugins: ['@vue/language-plugin-pug'] },  // typecheck Pug templates
    },
  },
})
```

```ts
// app/design/authoring.ts — keep it to what style modules really use
import { ds } from './system.ts'

export { ds }
export const { anatomy, class: cls, fontFace, fragment, keyframes, port, raw, recipe, rules, t } = ds
```

`cls` is a local alias for `ds.class` (`class` can't be a bare binding). Debug class names and diagnostics still point at the authored call.

`autoImports` keys route a source to module roles:

| Key | Injected into | Use when |
| --- | --- | --- |
| `shared` | style modules **and** app code (app code sees the runtime-safe projection, e.g. `ds`) | a single app whose components and composables use `ds` directly |
| `style` | style modules only | a package-provided barrel where app code imports `ds` explicitly from the package (a shared design-system package uses `style`, so consumers' app code isn't handed names it didn't import) |
| `app` | app code only | runtime helpers: `'core'` (`ports`, `setCustomProperty`…), `'vue'` (`propsOf`, `useAnatomy`, `usePorts`) |

```vue
<!-- app/app.vue: load document rules once -->
<script setup lang="ts">
import '~/design/base.css.ts'
</script>
```

Listing it in Nuxt's `css` option works too (`css: ['~/design/base.css.ts']`); Vanity compiles `*.css.ts` entries there like any other style module. That's the better home in a Nuxt layer shared by several apps.

Component imports can use `./Card.css` or `./Card.css.ts`; both support Nuxt's production SSR styles. Keep the host's inline-styles setting appropriate to the app. `?inline` requests a default CSS string instead of class exports; `?raw` requests authored source and does not compile it.

Run `nuxi prepare` (or start the dev server) once so Nuxt generates the auto-import declarations, then `nuxi typecheck`. A first `nuxt build` proves the compiler path end to end.

Nuxt's framework build supplies compiler evidence; the headless check command cannot acquire its configured client pipeline and exits 2 with that explanation. Outside Nuxt, check supports Vite, WXT and Vitest configurations. For gradual declarations-policy adoption, a reviewed baseline belongs at the project root, including in Nuxt 4 projects whose Vite source root is `app/`. `compiler.baseline` can select another project-relative or absolute file. Check and host builds read the same baseline.

Role guidance (`usage`) is advisory. Token property restrictions (`restrict`) operate even without a declarations policy; a reviewed policy baseline can accept their existing findings, and new violations still fail.

Where style modules live is a project convention: colocated next to the component (`UiCard/UiCard.vue` + `UiCard/UiCard.css.ts`) or in a separate tree reached through an alias. Pick one and write it in the project's conventions doc.

## 3. Several surfaces sharing one design system

The system belongs to its own workspace package; every surface consumes it as source. Read `references/monorepo.md` for the full layout (package exports, Nuxt layers, the WXT module, Tauri, packages that ship `*.css.ts`, and isolated typechecks with `vanity prepare`).

## 4. Coexisting with other CSS

Vanity emits into cascade layers named after the system prefix (`app.reset`, `app.tokens`, `app.recipes`, `app.utilities`, `app.overrides`). Unlayered CSS (a third-party stylesheet, a global `.css` file) beats all of them. To give other CSS a defined place, name the top-level layer order in the config:

```ts
export default defineVanityConfig({
  compiler: { system: './app/design/system.ts', layerOrder: ['vendor', 'app'] },
})
```

and import third-party CSS into `@layer vendor` (e.g. `@import url('lib.css') layer(vendor);`). Vanity places the order statement first in the document.

## 5. Upgrading Vanity

Stop the dev server before installing a new version, then start it again: a running server keeps the old compiler in memory and can fail with errors such as `VANITY_VITE_BUILD_FAILED` that disappear after a restart. Read the release notes for breaking changes (pre-1.0 minors may break), rerun `nuxi prepare`, typecheck, and build.

Runtime snapshots use version 2. A stored version 1 snapshot is rejected with a diagnostic and falls back to defaults; do not rewrite its version field. Runtime validators receive CSS text or finite numbers, so adapt schemas that previously inspected value objects or token handles. Keep validator implementations pure and bind the same IDs on the client and server.

## 6. Agent skills

The Vanity package ships these skills in `node_modules/@mszr/vanity/skills/`. Link them into the project so they stay in sync with the installed version:

```sh
mkdir -p .agents/skills
for skill in node_modules/@mszr/vanity/skills/*/; do ln -sfn "../../$skill" ".agents/skills/$(basename "$skill")"; done
```

`.agents/skills/` is a [cross-client convention](https://agentskills.io/client-implementation/adding-skills-support#where-to-scan). Follow your agent harness's skill-discovery and setup instructions; if it uses another location or registration step, link or register these same skill directories there.

Add a short project conventions doc (file placement, helper mixins in the authoring barrel, naming) and reference it from `AGENTS.md` or your harness's project instructions; the skills defer to it on project taste.

## 7. Setup problems

| Symptom | Cause | Fix |
| --- | --- | --- |
| `cls`/`t` "cannot find name" in `*.css.ts` | declarations not generated or not included | run `nuxi prepare`; outside Nuxt, `npx vanity prepare` and include the generated types (see monorepo reference) |
| auto-imported `propsOf`/`useAnatomy`/`usePorts` typed as `any` | the app doesn't declare `@mszr/vanity` as a dependency, so Nuxt can't emit a package import for it | add it to that package's `dependencies`, rerun `nuxi prepare` |
| `VANITY_SYSTEM_IN_STYLE_MODULE` | system created in a `*.css.ts` | move it to the plain system module |
| `VANITY_AUTHORING_IN_APP_MODULE` | app code imports `@mszr/vanity` | app code uses `ds` and style handles; authoring stays in style/system modules |
| `VANITY_APP_EXPORT_IN_SYSTEM_MODULE` | the system module exports unrelated values | move them to another module |
| `VANITY_APP_AUTO_IMPORT_STYLE_MODULE` | an app/shared barrel re-exports a `*.css.ts` | import style modules directly where they're used |
| `VANITY_VITE_SOURCE_PACKAGE_BYPASSED` | Vite config pre-bundles/externalizes a package that ships Vanity source | remove that `optimizeDeps.include`/`ssr.external` entry |
| styles stale or missing after upgrading | old compiler still running | restart the dev server |
