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

Layer assignment uses `inLayer` or `.layer()` like every emitter. Recipe-specific `layer:` config is removed.

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

`defineAtoms` becomes `ds.atoms()` because atoms are emitted output, not a modular definition registered into system shape.

Retain:

- bounded property/value map;
- shorthands and toggles;
- explicit allowed conditions;
- one precompiled class per declared combination;
- exact token-key completion;
- labeled unsafe value escape with audit;
- runtime lane redirect to ports;
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

The integrations share compiler and application lanes, but each adapter registers those lanes through its host:

| Entry | User-facing adapter | Compiler lane | Application lane |
| --- | --- | --- | --- |
| `/vite` | `vanityPlugin` | Evaluates `*.css.ts`, emits CSS, and projects the locked system. | Uses Vite auto-import transforms for application modules and Vue templates when the host uses Vue. |
| `/nuxt` | The default Nuxt module | Installs the `/vite` compiler lane internally. | Registers runtime imports through Nuxt's native import registry. |
| `/vue` | Vue runtime helpers | None. | Explicit runtime helpers such as `usePorts`, `useAnatomy`, and `propsOf`; no bundler registration. |

The Vite adapter is configured through one registration:

```ts
vanityPlugin({
  compiler: {
    system: './src/design/system.ts',
    layerOrder: ['vendor', 'app'],
    styleAutoImports: './src/design/authoring.ts',
  },
  app: {
    runtimeAutoImports: {
      presets: ['core', 'vue'],
      sources: ['@mono/styles', './src/app-imports.ts'],
    },
  },
})
```

The common compiler lane evaluates `*.css.ts`, imports a locked system from plain `system.ts`, emits one system CSS artifact and one CSS artifact per style source, preserves lazy splitting, writes the manifest, provides stable dev endpoints and DevTools, recovers from dependency errors without restart, generates browser and SSR projections from portable data, and supports precompiled package contracts. `compiler.layerOrder` establishes the host-wide order of CSS layer roots; its detailed semantics live in [spec-engine.md §9](./spec-engine.md#9-compiler-projection).

`compiler.styleAutoImports` remains opt-in and exposes authoring exports only to evaluated `*.css.ts` modules. `true` reuses the single `compiler.system` entry; a string names another source; a filtered object may omit `from` to reuse `compiler.system`. It generates exact ambient declarations at a stable path, regenerates on configuration or export changes, registers those declarations with the host, includes a generated-file banner, preserves TSDoc and exact types, allows explicit imports or user aliasing, and avoids injecting into modules upstream of the system. Use `include` or `exclude` for deliberate narrowing, never both.

`app.runtimeAutoImports` remains opt-in and supplies runtime-facing values to application modules. It never changes how `*.css.ts` modules are evaluated. A string names one source, an array selects built-in presets, and the object form combines `presets` with `sources`. Built-in presets provide named Vanity runtime groups; package and local sources are curated barrels and contribute all named value exports by default. Use `{ from, include }` or `{ from, exclude }` for deliberate narrowing; the two filters cannot be combined. Template injection is adapter-specific as shown above.

Generated types are the only ambient declaration source. Plain Vite writes Vanity's generated runtime declarations to the automatically discovered `node_modules/@types/vanity-runtime-auto-imports` package and overwrites that file so removed exports do not linger. Nuxt delegates declaration generation to its native import registry; both adapters preserve the authored exports' overloads, generics, literal types, and TSDoc.

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
- the comparison demo keeps Vanity's lane core-only to make the core/opinion boundary visible;
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
