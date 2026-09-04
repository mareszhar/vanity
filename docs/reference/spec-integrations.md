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

`port.dec()` replaces `port.set()` because it produces declaration data and never mutates an element.

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

The file is optional for adapters and is the CLI's default configuration source. `vanity prepare` reads it without loading Vite or Nuxt, statically discovers enabled module-role routes, and reconciles their declarations before a separate typecheck. Use `vanity prepare --root <project>` when running from another directory or `--config <path>` for a differently named module. The equivalent programmatic surface is `planAutoImportDeclarations()` for host-owned registration and `writeAutoImportDeclarations()` for filesystem reconciliation. Shared config paths should be project-relative or absolute; framework aliases such as `~` are available only when an adapter resolves them. Running the command alongside `nuxt prepare` is safe; Nuxt still owns its native application type registry, so Nuxt does not require this extra step.

The shared style-module pipeline evaluates `*.css.ts`, imports a locked system from plain `system.ts`, emits one system CSS artifact and one CSS artifact per style source, preserves lazy splitting, writes the manifest, provides stable dev endpoints and DevTools, recovers from dependency errors without restart, generates browser and SSR projections from portable data, and supports precompiled package contracts. `compiler.layerOrder` establishes the host-wide order of CSS layer roots; its detailed semantics live in [spec-system.md §9](./spec-system.md#9-compiler-projection).

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

`shared` expands into both module roles and creates no third declaration file. `style` targets only `*.css.ts`; `app` targets only application modules. A direct source string is shorthand for `shared`. `$system` explicitly means `compiler.system`, including inside `sources`; it is not a package specifier. Each source string is otherwise either a relative/absolute path or a package specifier. A bare `src/system.ts` is a package lookup and receives a fix pointing to `./src/system.ts` when that was intended.

Style sources expose exact authoring exports only to evaluated style modules. Application sources expose runtime-facing values only to application modules. A string names one source, an array selects built-in presets, and an object combines `presets` with filtered `sources`. Use `{ from, include }` or `{ from, exclude }` for deliberate narrowing; the two filters cannot be combined. An `app` or `shared` source cannot be a `*.css.ts` style module or re-export one: those modules are compiler-evaluated, not application-safe authoring. Vanity rejects that graph with `VANITY_APP_AUTO_IMPORT_STYLE_MODULE`; keep the style module out of the barrel and import its emitted handle directly where application code uses it. When one source legitimately supplies a name to both module roles, generated `declare var` declarations coexist. Different sources claiming one name fail with Vanity's configuration diagnostic.

Vanity's generated declarations are the ambient source for these two module roles. Plain Vite and `vanity prepare` write canonical declarations to `.vanity/types/vanity-style-auto-imports.d.ts` and `.vanity/types/vanity-app-auto-imports.d.ts`, then place small reference bridges in the automatically discovered `node_modules/@types/vanity-style-auto-imports` and `node_modules/@types/vanity-app-auto-imports` packages. They overwrite both files so removed exports do not linger, use relative local references or bare package specifiers so the generated text is portable across checkouts, and preserve the authored exports' overloads, generics, and literal types through `typeof` references. Nuxt renders the style declaration through a Nuxt type template and registers app imports through Nuxt's native import registry.

Every TypeScript project that uses these generated bindings must include the generated declarations. Plain Vite uses `vanity-style-auto-imports` and/or `vanity-app-auto-imports` in `compilerOptions.types`, or directly includes the canonical `.vanity/types` files. `vanity prepare` checks this and reports `VANITY_AUTO_IMPORT_DECLARATIONS_NOT_INCLUDED` with the missing entry. Nuxt and WXT register their generated references through their native preparation hooks.

### Source-shipping authoring packages

The type half and value half are distinct. A host injects the real value import while compiling a style module. An intermediate package that only typechecks source needs declarations, not that runtime import.

| Mode | In each style file | Package and consumer cost | Suits |
| --- | --- | --- | --- |
| Explicit barrel import | `import { cls, t } from '@acme/design/authoring'` | None outside the file. | A package with a handful of style modules. |
| Per-package host wiring | Nothing | Each TypeScript program reaching a style file prepares declarations. | A styling-heavy package scaffolded with its host setup. |
| Type-only unlock | `import type {} from '@acme/design/vanity-style-auto-imports'` | Nothing for consumers. | A source-shipping package that keeps its declaration requirement local. |

These are trade-offs, not a ranking, and one workspace may mix them. A package publishing the generated style declaration exports it as a bare package specifier, so the unlock import resolves in every consuming program. Run `vanity prepare` in that package before `npm pack` or publishing: `.vanity/` is normally ignored and the generated declaration must exist for the explicit `files` entry to ship it. Keep the barrel reference bare in the package's Vanity config, then export the generated file:

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

TypeScript still owns the completion's import edit; Vanity only ranks this explicitly named source in style modules. When a generated Vanity declaration already names the barrel, the plugin discovers it and no duplicate `authoringBarrels` entry is needed. In a source-shipping package, the plugin also shows an informational `VANITY_AMBIENT_SOURCE_DECLARATION` notice for an ambient style file without the unlock import. Set `"vanity": { "suppressAmbientSourceDeclarationNotice": true }` in that package's `package.json` when its chosen per-package host wiring makes that notice unhelpful.

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
- style dependency edits updating affected modules;
- export-shape changes following one documented reload rule;
- process and watcher cleanup.

Both HMR recovery sequences are mandatory: a dependency failure repaired in place, and a dependency introduced after a successful transform.

The Vite integration tracks attempted style entries and their dependencies, preserves last-good CSS, invalidates environment module graphs, and eagerly retries affected entries on the same server. Both recovery orders are permanent compiler-projection fixtures.

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
- canary throughout the refactor;
- reinstated demos with the preserved capability walk.
