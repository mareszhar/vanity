# vanity — architecture

## 1. Behavioral spine

```text
compose                                  resolve                     project
──────────────────────────────────────  ──────────────────────────  ──────────────────────
createSystem(config)                     consolidate(options)        CSS
  → open immutable system                 → locked system            application modules
  → define detached contributions         → in-process contract      runtime contract
  → add / expect / augment / overwrite    → portable contract        semantic map/manifest
```

Composition accumulates meaning. Resolution binds deferred context and validates the whole. Projection derives representations for particular consumers. These are not one object's universal phases: a semantic subject may have distinct logical, resolved, and runtime handles.

Every open-system chain link returns a new object. One open system may produce multiple locked forks. The locked object removes all registration and consolidation methods.

`consolidate()`:

- resolves logical names, references, roots, conditions, axes, layers, registrations, runtime schema, metadata, and identities;
- resolves adaptive portable values and scans constructor restrictions;
- validates named system rules and orders them by layer, explicit order, then registration;
- performs no CSS emission, DOM access, filesystem writes, global registration, or style-module lookup;
- returns a deterministic in-process contract importable by Node tools and config;
- retains build-only closures only inside that in-process boundary.

## 2. Compiler-owned projection

```text
plain system.ts
  └─ consolidate() → locked system + in-process contract
       ├─ compiler evaluates build-only closures
       ├─ portable system contract
       │    ├─ application-system projection
       │    ├─ browser runtime-controller factory
       │    └─ DOM-free SSR projection
       ├─ semantic map → manifest artifact
       ├─ system CSS → virtual CSS artifact
       └─ style modules → one virtual CSS artifact per source
```

Style sources use the ecosystem-standard `*.css.ts` / `*.css.js` suffix. Plain `system.ts` owns creation and consolidation. The compiler intentionally recognizes only `*.css.ts` and `*.css.js` style modules.

The compiler:

- emits system CSS once per CSS-artifact fingerprint;
- keeps system CSS separate from per-style-module CSS;
- imports the system CSS virtual module from each style module and relies on module-ID deduplication;
- keeps lazy style CSS in the lazy chunk;
- owns a separate first-loaded cross-system cascade prelude;
- generates browser and SSR modules from portable data, never by trusting tree-shaking of the in-process contract;
- lowers or executes all closures before serialization;
- tracks attempted transforms and their dependency graphs even when the first transform fails;
- retains the last good artifact set after an error;
- replaces artifacts atomically on recovery;
- writes only when bytes change.

This model is proven in [`spikes/compiler-projection`](../../spikes/compiler-projection/README.md) and the permanent compiler integration suite.

### Actors and hosts

```text
Vanity-owned                         external
────────────                         ────────
compiler ── mounted by adapter ──▶ build host (Vite / Nuxt / WXT)
   │                                  │
   ├─ evaluates style modules         ├─ module graph
   ├─ projects contracts              ├─ bundling and transforms
   └─ emits CSS/artifacts              └─ type-registration lifecycle
```

A **host** supplies context or capability to a mounted guest:

- a **system host** supplies policy and registered shape to plugins and portable values;
- a **build host** supplies the module graph and build lifecycle to Vanity's compiler;
- a **host adapter** is Vanity-owned code that mounts the compiler and registers bindings with one build host.

The **engine** is the immutable capability kernel behind `createSystem()`. It is architecture and maintainer vocabulary, not a second public construction layer; users do not need a `createEngine()` workflow.

## 3. Four identities

One fingerprint cannot serve all consumers. Each ID is a hash of its complete normalized projection, not a manually maintained field list.

| Identity | Projection | Invalidates |
| --- | --- | --- |
| compatibility ID | structural public schema, policies, plugin IDs/versions/options, recorded overwrites | duplicate-package/HMR compatibility and package composition |
| CSS-artifact fingerprint | complete emission IR: values, names, roots, scopes, axes, layers, registrations, fallbacks | system CSS |
| runtime schema ID | mutable slots, roots/query strategies, controls, validators, hydration addresses | runtime-controller and snapshot compatibility |
| docs/provenance revision | descriptions, source locations, explanations, documentation metadata | manifest/docs only |

A token value edit changes CSS identity without invalidating runtime shape. A description edit changes only documentation identity and must not rewrite CSS or churn mtimes.

Physical paths, object references, function source, and package-install location never establish compatibility.

## 4. Package boundary

A precompiled design-system package ships:

- full Node/build JavaScript retaining build closures for downstream style compilation;
- adjacent portable JSON for browser, SSR, and tool projections;
- declarations whose exported locked surface is simplified at the boundary.

A package boundary is a read site: simplify accumulated intersection types there so consumer hovers show one public object and builder internals never leak. The emitted declarations must not require `type-fest`.

The compiler validates that build JavaScript and adjacent portable data agree. A stale pair fails with package name, both identities, and a rebuild fix.

## 5. CSS ownership

One system owns one CSS namespace:

- token/custom-property prefix;
- top-level cascade layer root;
- declared root/scope set;
- system CSS artifact.

Two runtime-compatible systems may share a runtime controller. They may not emit different CSS into the same effective namespace unless their ownership is demonstrably disjoint. A collision fails and names both sources and CSS identities.

Per-system layers are nested:

```css
@layer app;
@layer app.reset, app.tokens, app.recipes, app.utilities, app.overrides;
```

The host integration emits the cross-system order prelude before any system or lazy stylesheet:

```css
@layer vendor, library, app;
```

## 6. Type architecture

Accumulation uses plain intersections:

```text
S & Record<Name, Contribution>
```

`Simplify` is deferred to human read sites: callbacks, locked surfaces, and package exports. Applying it at every chain link is prohibited because the spike fails around forty links.

Callback-bearing inputs use an intersection guard, not a conditional wrapper, so contextual typing survives.

Requirements collapse failed argument types to readable string-literal messages. Met `never` checks are tuple-wrapped. Reverse-mapped inputs avoid `unknown | T` destroying contextual typing.

These are regression rules, not implementation suggestions. The type-accumulation, system-scale, and package-boundary spikes are permanent references.

The open environment tracks constructors, token policy, axes, plugin requirements, and the full policy book independently. Policy remains in that environment so restrictions added before or after a constructor can reproject the same callable surface without subtracting members.

Every non-plugin registrable kind shares a detached definition-module carrier: immutable entries, kind identity, and a scoped `.add()` grammar. Token modules retain their graph-specific carrier but implement the same grammar. Mounting—not definition—normalizes entries against the current system.

Callable constructor families project `call` as the function and every other call-like definition member onto that function object. The projection is type-exact while its closures remain build-only.

## 7. Rule and value IR

The value IR records data type, expression, dependencies, support requirements, serialization, optional folding, extension identity, and provenance.

Every styling emitter lowers to one ordered, lossless rule IR supporting:

- declaration order and repeated declarations;
- nested selector rules;
- grouping and conditional at-rules;
- `@layer` and `@scope`;
- descriptor at-rules such as `@property`, `@font-face`, `@counter-style`, `@page`, keyframes, and view-transition rules;
- family-specific placement/cascade rules;
- labeled raw nodes for syntax not yet typed.

`@property` is unlayered and resolves duplicate registrations by stylesheet order. `@font-face` and `@keyframes` may live inside layers, where layer priority participates in name collision resolution. The IR records those differences explicitly.

Named system rules sit above rule IR. Their name and metadata are shape/provenance; `css` lowers into the same ordered IR as every emitter. The versioned portable contract currently stores this low-level shape in `ruleGroups`, but the public authoring language remains `defineRules`, `addRule(s)`, `overwriteRule(s)`, `expectRule(s)`, and `ds.rules`. The system artifact records fingerprints and emits each named rule once, independent of how many styling surfaces are evaluated.

Relative colors add a value-IR node carrying the selected color space, origin, component map, and alpha. Component expressions retain references, liveness, requirements, and constructor provenance; serialization chooses native relative syntax or an exact fold. No intermediate stage stringifies a live value.

The folder walks mixed expression trees bottom-up. Constant branches collapse independently; live references keep only the minimal operation shell needed around them. This is what lets Hail use one algebra for static, token, and mutable controls without a shadow implementation.

## 8. HMR and failure recovery

The compiler records:

- successful and failed style entry IDs;
- every discovered static dependency, including dependencies of failed entries;
- last-good system/style CSS and manifest bytes;
- each identity projection;
- output write counts and mtimes.

Required recovery sequences:

1. success → dependency error → fix → same server recovers;
2. first request fails → dependency fixed → same server discovers and recompiles;
3. contract edit changes the relevant identities only;
4. docs-only edit updates the manifest without touching CSS;
5. incompatible export-shape change performs the documented reload rather than serving stale state.

## 9. Trust boundaries

- Build closures never cross into browser or SSR bundles.
- Portable contracts and their materialized artifacts are validated data, not serialized arbitrary objects.
- Runtime validator implementations cross by stable IDs and explicit binding.
- DTCG plugin codecs cross by stable identity/version and JSON-safe payload.
- Source maps and structured diagnostics carry authored locality through compiler layers.
- No public feature relies on process-global mutable registries.
