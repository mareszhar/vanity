# vanity — spec: recipes, ports, Hail, Vue, Nuxt, and demos

Recipes, ports, Hail, Vue, Nuxt, and demos consume the same locked-system contract while keeping their distinct responsibilities visible.

## 1. Recipes

The canonical detailed contract is [spec-recipes.md](./spec-recipes.md).

`ds.recipe()` retains:

- `base`;
- `variants`;
- `toggles`;
- `compound`;
- `defaults`;
- finite precompiled class selection;
- strict literals and permissive widened props;
- dev diagnostics for untyped invalid values;
- default folding only when semantically safe;
- class/debug/source provenance;
- `fromTokenGroup`;
- published ports.

Every arm accepts the full styling input, including ordered arrays, conditions, fragments, `tdec`, ports, selectors, and raw values.

Layer assignment uses `inLayer` or `.layer()` like every emitter. Recipe-specific `layer:` config is not accepted.

## 2. Anatomy

`ds.anatomy()` retains:

- the recipe grammar;
- exact declared parts;
- part-keyed class results;
- part-scoped `'<part>:<condition>'` keys;
- typed part references for cross-part selectors;
- published ports;
- `useAnatomy` Vue reactivity helper.

Part-scoped condition keys receive the same branded hover improvement as ordinary conditions.

## 3. Call-site projection

The call-site law stays:

- a wider props object is accepted and unknown keys are ignored;
- an inline misspelled key fails through excess-property checking;
- known variant keys always validate values;
- public prop types hover as a simple optional object;
- `propsOf()` turns recipe/anatomy shape into Vue runtime props;
- toggles receive native boolean casting;
- `propsOf.group({ button, card })` uses object keys as namespace identity and produces exact hyphenated keys;
- no export-name guessing exists.

## 4. Ports

The canonical detailed contract is [spec-ports.md](./spec-ports.md).

Ports retain declaration, interpolation, validation, publication, serialization, SSR, and HMR semantics.

Alignment:

```TS
const gap = ds.port(ds.t.space.sm)

gap.dec(ds.t.space.lg)
```

`port.dec()` produces declaration data and never mutates an element.

Contracts:

- default determines data type and CSS fallback;
- raw strings remain valid;
- interpolation emits `var(--port, default)`;
- exact type/default/label/description/deprecation metadata survives projection;
- Standard Schema remains synchronous, ID-bound, and explicitly rebound in app/SSR;
- `ports(...)` merges fragments and skips falsy entries;
- recipe/anatomy `ports:` publishes existing handles;
- consumers theme values through published ports without internal DOM knowledge.

## 5. Atoms

Atoms are emitted through `ds.atoms()` rather than a `define*` module, because atoms are output, not a modular definition registered into system shape.

Retain:

- bounded property/value map;
- shorthands and toggles;
- explicit allowed conditions;
- one precompiled class per declared combination;
- exact token-key completion;
- labeled unsafe value escape with audit;
- dynamic application values redirect to ports;
- preset-provided default map.

Layer behavior follows the common emitter contract.

## 6. Hail

Hail is the one deletable opinionated layer and ships from `@mszr/vanity/presets`. Its complete contract lives in [spec-hail.md](./spec-hail.md); the public plugin machinery it dogfoods lives in [spec-extensions.md](./spec-extensions.md).

Hail is the single preset export. Its constructor/control layer, token presets, and rule presets are independently selectable. The core keeps CSS-relative colors, calculations, accessibility contrast, conditions, recipes, and primitives; Hail owns normalized design ranges, semantic elevation, base-step sizing, aesthetic contrast, starter tokens, and global opinions.

Only the plural `/presets` entrypoint ships. Project-specific headless selectors and component conventions stay in the application unless a future independently justified plugin earns them.

## 7. Vue

Retain:

- `usePorts` as a typed computed fragment merge;
- `useAnatomy` as the one reactivity-bearing anatomy wrapper;
- no `useRecipe` wrapper;
- `propsOf` in `/vue`, not on `ds`;
- SFC mapping from scoped/deep/slotted/global/v-bind/manual variant props to classes, ports, rules/raw, and `propsOf`;
- framework-local validator binding;
- SSR equality between server style objects and hydration.

Style-module handles imported in component code are projected serialized runtime handles; build authoring code never executes in the browser.

## 8. Integration adapters

Vanity's compiler is mounted into an external build host by a Vanity-owned adapter:

```text
Vanity compiler ── mounted by host adapter ──▶ build host
       │                                      │
       ├─ evaluates style modules             ├─ owns module graph/bundling
       ├─ emits CSS                           ├─ transforms application modules
       └─ projects portable contracts          └─ registers ambient types/imports
```

Style modules and application modules are distinct module roles. Each has its own processing pipeline and receives only bindings valid for its job:

| Entry | User-facing adapter | Style-module pipeline | Application-module pipeline |
| --- | --- | --- | --- |
| `/vite` | `vanityPlugin` | Evaluates `*.css.ts`, emits CSS, and projects the locked system. | Uses Vite auto-import transforms for application modules and Vue templates when the host uses Vue. |
| `/nuxt` | The default Nuxt module | Mounts the `/vite` compiler through Nuxt's Vite configuration. | Registers app imports through Nuxt's native import registry. |
| `/wxt` | The default WXT module | Mounts the `/vite` compiler through WXT's Vite configuration. | Registers generated declarations through WXT's `prepare:types` hook. |
| `/vue` | Vue runtime helpers | None. | Explicit runtime helpers such as `usePorts`, `useAnatomy`, and `propsOf`; no bundler registration. |

The Vite adapter is configured through one registration:

```ts
vanityPlugin({
  compiler: {
    system: './src/design/system.ts',
    layerOrder: ['vendor', 'app'],
  },
  autoImports: {
    style: './src/design/authoring.ts',
    app: {
      presets: ['core', 'vue'],
      sources: ['@mono/styles', './src/app-imports.ts'],
    },
  },
})
```

The same host-neutral object may live in the conventional `vanity.config.ts`:

```TS
import { defineVanityConfig } from '@mszr/vanity/config'

export default defineVanityConfig({
  compiler: {
    system: './src/design/system.ts',
  },
  autoImports: {
    style: './src/design/authoring.ts',
    app: ['core', 'vue'],
  },
})
```

One authoring file can serve both compiler evaluation and application-safe shared imports. `$system` names that same `compiler.system` entry, and the barrel may destructure the helpers it wants to expose:

```TS
// src/design/authoring.ts
import { createSystem } from '@mszr/vanity'

export const ds = createSystem()
  .addTokens({ color: { brand: '#635bff' } })
  .consolidate({ prefix: 'app' })

export const { class: cls, t } = ds
```

```TS
// vanity.config.ts
export default {
  compiler: { system: './src/design/authoring.ts' },
  autoImports: { shared: '$system' },
}
```

The compiler evaluates the file for `cls` and `t`; application modules receive the generated projection. The shared route creates no third module role.

The file is optional for adapters and is the CLI's default configuration source. `vanity prepare` reads it without loading Vite or Nuxt, statically discovers enabled module-role routes, and reconciles their declarations before a separate typecheck.

`compiler.baseline` selects a project-relative or absolute policy baseline. When omitted, the compiler reads `vanity.baseline.json` at the project root if present. Nuxt resolves it from `rootDir`, even when Vite's source root is `app/`. Baseline identities also use project-relative source paths, so check and every host accept the same authored findings. Invalid CSS, token-kind mismatches and system errors cannot be accepted. The [check and baseline contract](./spec-introspection.md#policy-baselines) defines repeat counts, reconciliation and incomplete evidence.

The development server watches the selected baseline, including an absent or invalid configured file. Creating, editing or deleting it re-evaluates dependent styles; repairing it clears the error overlay without a server restart.

`vanity check` uses the configured client resolver and compiler without serving or bundling an application. Vite 6–8, WXT and Vitest 5 configurations support this headless path. Install the project's host package; these adapters use optional peers, including Vitest's public Node entry. Check selects production mode through the host's own configuration, so default identifiers match a production build. Each run creates one configured pipeline, disables HTTP and WebSocket serving, and closes it afterward. WXT can briefly probe port availability while reading its development-server configuration. Nuxt cannot supply its client pipeline without a framework build; check reports the reason and exits 2. Use its production build for compiler evidence.

Use `vanity prepare --root <project>` when running from another directory or `--config <path>` for a differently named module. The equivalent programmatic surface is `planAutoImportDeclarations()` for host-owned registration and `writeAutoImportDeclarations()` for filesystem reconciliation.

Shared config paths should be project-relative or absolute; framework aliases such as `~` are available only when an adapter resolves them. Running the command alongside `nuxt prepare` is safe because Nuxt still owns its native application type registry and does not require this extra step.

The shared style-module pipeline:

- evaluates `*.css.ts` and imports a locked system from plain `system.ts`;
- emits one system CSS artifact and one CSS artifact per style source while preserving lazy splitting;
- loads each style source's generated CSS in development and in production, under any public base;
- writes the manifest and provides stable development endpoints and DevTools;
- recovers from source dependency errors without a restart;
- generates browser and SSR projections from portable data; and
- supports precompiled package contracts.

None of this depends on where a style source sits. A source outside the build root, such as a package's `*.css.ts` files compiled by the consuming application, is evaluated, addressed, served, hot-updated, and recovered exactly like one inside it.

`compiler.system` accepts a module path, a `{ entry, artifact?, packageName?, exportName? }` source object, or an array of either in Vite, Nuxt, and WXT. Nuxt resolves relative entries and artifacts from `rootDir`, even when Vite uses `srcDir`; package specifiers and absolute paths retain their meaning. Each entry exports one consolidated system; configure separate entries for distinct systems. Malformed entries fail during adapter setup or shared config loading/preparation with `VANITY_COMPILER_INVALID_INPUT` and an indexed configuration path. `$system` auto-imports still require exactly one entry; for multiple systems, name the intended auto-import source explicitly.

`compiler.system` names the entry the compiler evaluates. It may be a system module or a static barrel that re-exports one, and the host resolves the spelling you write using its own aliases, export conditions, extension rules, directory indexes, and symlink policy — so a package export or a symlinked path resolves the same way your application imports resolve. An arbitrary host virtual module is not a substitute for a real module.

That module may export the consolidated system and values taken from it, including renamed destructured members:

```TS
// src/design/ds.ts — a valid compiler.system entry
export const ds = createSystem()
  .addTokens({ color: { brand: '#635bff' } })
  .consolidate({ prefix: 'app' })

export const { class: cls, rules, t } = ds
```

Application code receives a generated projection of that module, so an export that is neither the system nor a value taken from it has nowhere to travel: Vanity raises `VANITY_APP_EXPORT_IN_SYSTEM_MODULE`, names the export and the fix, and asks you to move the declaration into any other module and import it normally. Type-only exports are erased and never rejected. Ordinary modules and pure re-export barrels pass through the host graph untouched, so their objects, functions, closures, and live bindings keep ordinary JavaScript semantics — and a barrel and the module it re-exports share one system without sharing one export namespace.

System CSS is emitted once per CSS identity, independently of which style module reaches the system first, and every style that uses a system keeps an edge to it. Component CSS stays lazy, and systems you never reach stay unemitted.

Vanity watches every resolved input a style module depends on, including data imports such as JSON, and stops at its own package boundary so its implementation dependencies never land in your watch set.

The supported Vite range is `^6.0.0 || ^7.0.0 || ^8.0.0`.

### Style-module imports

Style modules use the host's client resolver for aliases, resolver plugins, relative paths and virtual modules. The host's loader supplies virtual source. In development, optimizer metadata replaces a prebundled cache answer with its original source before evaluation; ownership and HMR watch that original path. An optimizer answer without original-source metadata fails compilation rather than evaluating a browser prebundle.

A package-name import such as `package` or `package/subpath` selects the package's Node entry when the client answer belongs to that package. The package's own browser-disabled metadata also authorizes its Node entry, whether the host returns a stub, a file or a package-entry error. A redirect into another package retains the host answer. An alias to another entry of the same package still selects Node from the written package request. Imports inside Vanity's implementation keep Node resolution and its substrate externals; a builtin such as `node:fs` remains native when the client would stub it, while a bare builtin name redirected to a polyfill keeps that package.

Other aliases and plugin-selected files retain their host answers, including runnable browser entries. If a browser entry throws during evaluation, the diagnostic names each browser-selected import in the throwing module's recorded importer chain and recommends importing the package by name. An unmapped stack keeps the original message and labels reached browser entries as possible causes. A browser-disabled stub without the named package's own disabling metadata fails with the same package-name repair.

Nuxt development's client and server requests share its existing client resolver. A production SSR build after the client build closes has no live client environment and uses its own environment's resolver; opaque aliases and plugin choices can therefore differ between those environments. Named package requests select Node in both.

Configured-system source and member discovery runs during configuration. Evaluation starts after plugin initialization at the first style, projection, HTML or manifest consumer. Concurrent consumers share one attempt and see only a complete result. A failed attempt retains its diagnostic until a relevant edit starts a new attempt; watch builds and development updates preserve accepted artifacts while that attempt runs.

`compiler.layerOrder` sets the host-wide order of CSS layer roots, declared first in integrated HTML documents; its semantics live in [spec-system.md §9](./spec-system.md#9-compiler-projection).

### CSS queries

An ordinary style-module import exports JavaScript values such as class names, recipes and ports. A CSS query selects the module's complete compiled stylesheet, including its system and imported style CSS and their layer statements. The stylesheet passes through the host's configured CSS pipeline.

| Query | Meaning |
| --- | --- |
| `inline` | Default-exported CSS string; no stylesheet installation or extraction. |
| `url` | Default-exported stylesheet URL; production builds emit its processed CSS asset. |
| `url&inline` | Development CSS data URL. Vite's CSS URL hook rejects this combination in production builds. |
| `direct` | Development CSS response with `text/css`; production uses normal stylesheet extraction. Combined with `inline`, development serves CSS and production exports a string. |
| Vue style and `transform-only` queries | Compiled CSS handled by the host's CSS pipeline; Vue's scoped, custom-element and CSS-module queries retain their native meaning. |
| `raw` | Default-exported authored source text, including with other flags; it does not evaluate the style module. |
| `used`, `import`, and request timestamps alone | Request decorations; the module retains its JavaScript exports. |

`raw` takes precedence over CSS content forms. Other combinations follow the host's CSS behavior. Each loaded query is a separate module id and updates after edits to the style module or its dependencies. Nuxt's production SSR stylesheet collection can request `inline&used` through either the documented `./Card.css` shorthand or an explicit `./Card.css.ts` import; both deliver the client stylesheet's CSS to server-rendered HTML.

### Module roles and type consumers

| Role/consumer | What happens | Ambient declarations |
| --- | --- | --- |
| style modules (`*.css.ts`) | Vanity's compiler evaluates authoring calls at build time and emits CSS. | Exact authoring bindings are injected only here. |
| application modules | The host transforms application and SSR code; the browser receives restored handles and runtime controllers. | Application-facing bindings are injected only here. |
| TypeScript program | TypeScript includes declaration files independently of which module role receives a binding. | A declaration can be required while a consumer only typechecks source. |

`autoImports` is opt-in. Its keys route sources into module roles; they do not name processors:

```TS
autoImports: {
  shared: '@acme/design/authoring',
  app: ['core', 'vue'],
}
```

When a package also publishes build JavaScript plus a portable system artifact, the consumer pairs them through the configured `system` object. The strict reader compares compatibility, CSS, runtime, and docs identities; a description-only source edit keeps CSS bytes stable but still requires the pair to be regenerated when its docs identity changes. The diagnostic names the package and the identities that disagree.

`shared` expands into both module roles and creates no third declaration file. `style` targets only `*.css.ts`; `app` targets only application modules. A direct source string is shorthand for `shared`.

`$system` explicitly means `compiler.system`, including inside `sources`; it is not a package specifier. Every other source string is a relative/absolute path or a package specifier. A bare `src/system.ts` is a package lookup and receives a fix pointing to `./src/system.ts` when `./src/system.ts` was intended.

Source shapes and restrictions are explicit:

- style sources expose exact authoring exports only to evaluated style modules;
- application sources expose runtime-facing values only to application modules;
- a string names one source, an array selects built-in presets, and an object combines `presets` with filtered `sources`;
- use `{ from, include }` or `{ from, exclude }` for deliberate narrowing; the two filters cannot be combined;
- an `app` or `shared` source cannot be a `*.css.ts` style module or re-export one because those modules are compiler-evaluated, not application-safe authoring;
- that invalid graph produces `VANITY_APP_AUTO_IMPORT_STYLE_MODULE`; keep the style module out of the barrel and import its emitted handle directly where application code uses it; and
- when one source legitimately supplies a name to both module roles, generated `declare var` declarations coexist, while different sources claiming one name fail with Vanity's configuration diagnostic.

Vanity's generated declarations are the ambient source for the two module roles. Plain Vite and `vanity prepare` write canonical declarations to `.vanity/types/vanity-style-auto-imports.d.ts` and `.vanity/types/vanity-app-auto-imports.d.ts`, then place small reference bridges in the automatically discovered `node_modules/@types/vanity-style-auto-imports` and `node_modules/@types/vanity-app-auto-imports` packages.

The declaration writer overwrites both files so removed exports do not linger, uses relative local references or bare package specifiers so generated text is portable across checkouts, and preserves authored overloads, generics, and literal types through `typeof` references. Nuxt renders the style declaration through a Nuxt type template and registers app imports through Nuxt's native import registry.

Every TypeScript project that uses these generated bindings must include the generated declarations. Plain Vite uses `vanity-style-auto-imports` and/or `vanity-app-auto-imports` in `compilerOptions.types`, or directly includes the canonical `.vanity/types` files.

`vanity prepare` checks this and reports `VANITY_AUTO_IMPORT_DECLARATIONS_NOT_INCLUDED` with the missing entry. Nuxt and WXT register their generated references through their native preparation hooks.

### Source packages

A **source package** ships Vanity source: `*.css.ts` style modules, a configured system module or its static re-export graph, or a precompiled system with its portable artifact. It works the same when linked from a workspace or installed from a registry.

Vanity declares every package whose dependencies or peer dependencies reach `@mszr/vanity`, including packages through which an application reaches a source package. In Vite, these packages appear in the resolved `optimizeDeps.exclude` and `ssr.noExternal` settings so their source passes through Vanity. This also declares a package that uses Vanity only at runtime; that costs optimizer speed but does not change correctness. Nuxt inherits the same Vite declarations, and WXT mounts the same adapter.

An explicit `optimizeDeps.include` or `ssr.external` entry for a declared package takes precedence and warns with `VANITY_VITE_SOURCE_PACKAGE_BYPASSED`: `Configuration entry "<entry>" includes <package>. Vanity source in or beneath <package> will run as build-time code instead of passing through Vanity.` Remove that entry; for a CommonJS dependency, name it as `<package> > <dependency>`. A CommonJS declared package that cannot enter the SSR transform reports the same code with a package-author fix to publish ESM. When `compiler.diagnostics` is configured, the warning goes there; otherwise the adapter writes it through Vite's logger. It warns once per package per plugin instance.

When an application module imports `@mszr/vanity`, the adapter raises `VANITY_AUTHORING_IN_APP_MODULE` and names the importing module: `Application module '<importer>' imports Vanity's authoring entry '@mszr/vanity'.` Move Vanity authoring into `compiler.system` or a `*.css.ts` style module, then import the configured system in application code. The error applies to client and SSR application graphs; configured system members and style modules are handled by Vanity's compiler. Test files that Vitest runs through the application's Vite config may import `@mszr/vanity`, as the [testing kit](./testing-kit.md) does; this error does not apply when Vitest runs them.

Application auto-imports transform application modules, including workspace-linked packages whose resolved files sit outside `node_modules`; they skip installed dependencies and `.git`. This keeps application auto-import parsing out of dependency code.

The type half and value half are distinct. A host injects the real value import while compiling a style module. An intermediate package that only typechecks source needs declarations, not that runtime import.

| Mode | In each style file | Package and consumer cost | Suits |
| --- | --- | --- | --- |
| Explicit barrel import | `import { cls, t } from '@acme/design/authoring'` | None outside the file. | A package with a handful of style modules. |
| Per-package host wiring | Nothing | Each TypeScript program reaching a style file prepares declarations. | A styling-heavy package scaffolded with its host setup. |
| Type-only unlock | `import type {} from '@acme/design/vanity-style-auto-imports'` | Nothing for consumers. | A source package that keeps its declaration requirement local. |

Vanity recognizes authoring sources by their role rather than by their location, so a source package keeps its export-derived class names and source-local diagnostics whether it is linked from a workspace or installed under `node_modules`. Unrelated dependencies and raw Vanilla Extract modules keep their own processing.

These are trade-offs, not a ranking, and one workspace may mix them. A package publishing the generated style declaration exports it as a bare package specifier, so the unlock import resolves in every consuming program.

Run `vanity prepare` in that package before `npm pack` or publishing: `.vanity/` is normally ignored and the generated declaration must exist for the explicit `files` entry to ship it. Keep the barrel reference bare in the package's Vanity config, then export the generated file:

```json
{
  "files": ["src", ".vanity/types/vanity-style-auto-imports.d.ts"],
  "exports": {
    "./authoring": "./src/authoring.ts",
    "./vanity-style-auto-imports": {
      "types": "./.vanity/types/vanity-style-auto-imports.d.ts"
    }
  }
}
```

An authoring barrel such as `export const { class: cls, t } = ds` preserves its authored aliases in debug names and provenance, so the concise explicit form remains traceable. For mode 1, the optional `@mszr/vanity/typescript` plugin can also rank those barrel exports above unrelated auto-imports in `*.css.ts` while leaving application-module completions untouched:

```json
{
  "compilerOptions": {
    "plugins": [{
      "name": "@mszr/vanity/typescript",
      "authoringBarrels": ["@acme/design/authoring"]
    }]
  }
}
```

TypeScript still owns the completion's import edit; Vanity only ranks this explicitly named source in style modules. When a generated Vanity declaration already names the barrel, the plugin discovers it and no duplicate `authoringBarrels` entry is needed.

In a source package, the plugin shows an informational `VANITY_AMBIENT_SOURCE_DECLARATION` notice for an ambient style file without the unlock import. Set `"vanity": { "suppressAmbientSourceDeclarationNotice": true }` in that package's `package.json` when its chosen per-package host wiring makes the notice unhelpful.

For document-level rules, put the selectors in the intended layer rather than hiding a second styling system:

```TS
ds.inLayer('reset').rules({
  ':root': { colorScheme: 'light dark' },
  html: { minBlockSize: '100%' },
  body: { minBlockSize: '100%', margin: 0 },
})
```

## 9. SSR and HMR

Preserve:

- static linked CSS with styled first paint;
- no per-request style collection;
- server projection of runtime slots and mode attributes;
- hydration without redundant rewrites;
- compatible runtime state across HMR;
- style and style dependency edits updating affected modules;
- export-shape changes following one documented reload rule;
- process and watcher cleanup.

Both HMR recovery sequences are mandatory: a dependency failure repaired in place, and a dependency introduced after a successful transform.

Consumers wait for known in-flight system evaluations and rebuild bundles whose system snapshot has changed. Overlapping saves therefore use current system inputs for both diagnostics and output. Successful recovery installs each consumer's current CSS even when an overlapping failed update already compiled it.

Separate file saves are not atomic: a style referencing a token its system does not yet define remains invalid. Failures report without a grace period; when accepted CSS is retained, the diagnostic states that it excludes the failed edit. Defining the missing token retries consumers without a stylesheet resave or server restart.

The Vite integration tracks attempted style entries and their dependencies, preserves last-good CSS, uses Vite's `watchChange` hook and `ModuleGraph.invalidateModule` only at the host boundary, and eagerly retries affected entries on the same server. A value edit that changes CSS identity follows the new browser module URL and removes stale ownership, including under a non-root `base`. A docs-only edit updates the manifest without sending a CSS update. A change to an application-imported runtime identity, or the repair of a configured system, requests a full reload; compatible CSS edits keep runtime state and the page. Both recovery orders are permanent compiler-projection fixtures.

In development, a retired stylesheet leaves each page once its replacement CSS is installed there. This applies to stylesheets Vite serves as CSS modules; a link a host renders into server HTML, such as Nuxt's development renderer, can keep retired rules until the next page load, because Vanity does not retract host-rendered markup. Stylesheet delivery order never changes Vanity's cascade ([styling §8](./spec-css.md#8-layers)).

Deleted style modules retire their compiler ownership, stylesheet and graph entries. Vanity retires every stylesheet it serves from that module, including rules authored with vanilla-extract’s `style()` through Vanity’s pipeline. Files compiled by a separately registered vanilla-extract plugin belong to that plugin’s lifecycle. A module that still imports one receives the host’s missing-import error; restoring the file repairs it without restarting the dev server. A Nuxt SSR error page recovers on a fresh page request. Watch builds retire deleted sources before publishing their manifest, including a file unwatched after its consumer was removed.

### 9.1 Updating dependencies

Stop the development server before changing the installed version of Vanity or its build host, then start it again after installation completes. A running server can retain loaded compiler code while reading files from the updated installation. Reloading the browser does not restart that process.

If a compilation error such as `VANITY_VITE_BUILD_FAILED` first appears after a dependency update, retry with a freshly started server before changing your system or styles. Use the reported file, underlying cause and fix guidance to investigate errors that persist after restarting.

## 10. Demos

The permanent canary proves:

```text
plain system.ts
→ two eager style modules
→ one lazy component
→ one system CSS artifact
→ runtime axis and token mutation
→ DOM-free snapshot + SSR hydration
→ failed-transform recovery
→ manifest + explain
```

The shipped demo set is deliberately differentiated:

- the Prism flagship uses the locked system and Hail's selected opinions;
- the comparison demo keeps Vanity core-only to make the core/opinion boundary visible;
- every workspace type/build pipeline includes both demos;
- generated exact auto-import declarations replace tracked ambient mirrors;
- browser assertions cover computed outcomes, SSR, HMR, optimizer, accessibility, and lifecycle behavior;
- Nuxt, Vue, and Pug remain exemplary integration choices, not core architecture.

## 11. Semantic elevation

Hail owns elevation as an optional, scheme-live semantic lightness coordinate exposed only through `oklchx.inE()` and `oklchx.from(base, { e })`.

Elevation reuses a compatible host `scheme` axis or contributes the canonical one, emits one direction token, and leaves non-elevation colors flat. This keeps the opinion removable without weakening core CSS capability.

## 12. Evidence

- recipe/anatomy output, types, hover, call-site law, and part conditions;
- port `dec`, validation, publication, SSR, and Vue reactivity;
- exact `propsOf` and grouped projections;
- atom bounded output and escape audits;
- Hail public-contract dogfood, selection, ownership, and packed consumption;
- generated auto-import declaration text, regeneration, and no-`any` Selenita tests;
- Vite/Nuxt build, dev, SSR, HMR, optimizer, and packed-app gates;
- system CSS ownership across independent documents, linked and installed source packages, and shared CSS identities;
- module-role diagnostics and export-namespace projection through style, browser, and SSR graphs;
- failure-atomic artifact publication and same-server recovery;
- HMR under root and non-root public bases, and client and SSR module graphs on each supported Vite major;
- canary throughout the refactor;
- reinstated demos with the preserved capability walk.

