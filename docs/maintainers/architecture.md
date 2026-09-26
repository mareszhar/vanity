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

- evaluates each configured system entry independently of style-module request order and emits system CSS once per CSS-artifact fingerprint;
- keeps system CSS separate from per-style-module CSS;
- imports the system CSS virtual module from each style module that reaches that system and relies on module-ID deduplication;
- keeps lazy style CSS in the lazy chunk;
- owns a separate first-loaded cross-system cascade prelude;
- generates browser and SSR modules from portable data, never by trusting tree-shaking of the in-process contract;
- lowers or executes all closures before serialization;
- resolves configured entries through the build host while retaining configured spelling, physical module identity, and authored source as separate facts;
- computes each configured system's authored member modules from its static re-export graph and serves each projection under the member's resolved module ID;
- instruments source package authoring modules by role, including linked and physically installed packages, while leaving unrelated dependencies and raw Vanilla Extract modules to their own loaders;
- tracks attempted transforms and their dependency graphs even when the first transform fails;
- retains the last good artifact set after an error;
- replaces artifacts atomically on recovery;
- writes only when bytes change.

This model is proven in [`spikes/compiler-projection`](../../spikes/compiler-projection/README.md) and the permanent compiler integration suite.

A configured system's member set contains its entry and the authored modules in its static re-export graph. A pure barrel remains an ordinary host module; its edges reach the authored members. The host loads a member by its physical ID, and Vanity projects it under that same ID. During dependency scanning only, the adapter returns a shield ID for a member so the scanner does not crawl build-time imports.

Every compiler-owned stylesheet is addressed under the artifact directory inside the build root: system CSS at `.vanity/virtual/system/`, style CSS at `.vanity/virtual/style/`. `.vanity/virtual/` is an address namespace and is never written to disk — unlike `.vanity/manifest.json` beside it. The host boundary owns both conversions between a compiler-owned ID and a browser URL: each happens once, ID to URL where a string is handed to the browser and URL to ID where a request arrives, and the two are exact inverses. An address outside the root is a contract violation rather than a case to handle. A style module's own source path is not one of these addresses: it names a real file that may legitimately sit outside the root, so the host adapter converts it on its own route and keeps the host's filesystem spelling.

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

The value kernel is the immutable bundle of portable value capabilities behind `createSystem()`. It is an implementation boundary, not a second public construction layer; users create an open system directly.

## 3. Four identities

One fingerprint cannot serve all consumers. Each ID is a hash of its complete normalized projection, not a manually maintained field list.

| Identity | Projection | Invalidates |
| --- | --- | --- |
| compatibility ID | structural public schema, named-rule names/order, policies, plugin IDs/versions/options, recorded overwrites; excludes token values, descriptions, authored paths, and object identity | duplicate-package/HMR compatibility and package composition |
| CSS-artifact fingerprint | complete emission IR: values, names, roots, scopes, axes, layers, registrations, fallbacks, named-rule selectors/declarations; excludes descriptions and documentation metadata | system CSS |
| runtime schema ID | mutable slots, roots/query strategies, controls, validators, hydration addresses, app-visible conditions/layers/consts | runtime-controller and snapshot compatibility |
| docs/provenance revision | descriptions, source locations, explanations, documentation metadata | manifest/docs only |

A token value edit changes CSS identity without invalidating runtime shape. A description edit changes only documentation identity and must not rewrite CSS, send a CSS update, or churn CSS mtimes. Named-rule names remain structural documentation/compatibility data but do not become CSS bytes when the emitted rule is unchanged. The generated application backing is selected by runtime-schema identity. Each authored member receives an export projection under its physical module ID, so a configured barrel and its leaf can share runtime state without sharing JavaScript exports. Actual system exports use the generated backing; ordinary exports remain host-module edges so objects, callables, and live bindings retain JavaScript module semantics. A change in the authored member set changes module ownership and requires invalidating the affected graph nodes.

The configured authored system module is a module-role boundary. It may export the evaluated system and values taken from that system, including renamed destructured members; an unrelated application export receives `VANITY_APP_EXPORT_IN_SYSTEM_MODULE` with the small move-and-import fix. Pure ordinary modules and re-export barrels remain in the host graph unchanged, so their objects, callables, closures, and live bindings keep native module semantics.

Physical paths, object references, function source, and package-install location never establish compatibility.

## 4. Package boundary

A precompiled design-system package ships:

- full Node/build JavaScript retaining build closures for downstream style compilation;
- adjacent portable JSON for browser, SSR, and tool projections;
- declarations whose exported locked surface is simplified at the boundary.

A package boundary is a read site: simplify accumulated intersection types there so consumer hovers show one public object and builder internals never leak. The emitted declarations must not require `type-fest`.

The two published command-line/tooling entries remain JavaScript by host contract:

- `sdk/typescript.cjs` is loaded by TypeScript as a CommonJS language-service plugin.
- `sdk/bin/vanity.mjs` is the executable ESM wrapper around the built CLI.

They are intentionally exempt from the SDK TypeScript program because their host APIs are runtime-injected and their implementation is shipped as source. The naming-law audit includes both files explicitly so the repository-wide naming rule still applies to them.

The compiler validates that build JavaScript and adjacent portable data agree across all four identities. A stale pair fails with package name, the mismatching identities, and a rebuild fix; a docs-only source edit can therefore require regeneration even when the resulting CSS bytes are unchanged.

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

Configured system CSS is a semantic system artifact, addressed by its CSS identity and owned independently of the style module that first reaches it. A style retains an edge to every configured system it uses; materializing a configured system does not make unrelated system or component CSS eager. Shared CSS identities keep all current system and style owners, and an artifact is retired only after its last owner and any required graph transition release it.

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

Named system rules sit above rule IR. Their name is structural, their description is documentation, and their effective layer/order and `css` lower into the same ordered IR as every emitter. The versioned portable contract currently stores this low-level shape in `ruleGroups`; the exact named-rule grammar belongs to [spec-system-authoring.md §9](../reference/spec-system-authoring.md#9-named-system-rules). The system artifact records fingerprints and emits each named rule once, independent of how many styling surfaces are evaluated.

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

Candidates are built completely—CSS, portable data, build exports, inspection records, namespace membership, runtime lookup, and serialized artifact—before accepted compiler state changes. A failed candidate leaves the last-good system and CSS virtual modules addressable, restores evaluation state, and remains watchable for a retry. CSS-identity changes switch style edges to the new virtual module and retire the old one only when no owner or transition still needs it; same-identity docs changes update the manifest without a CSS notification.

The member set changes when a configured barrel starts or stops re-exporting an authored module, or when a configured entry turns from an authored module into a pure re-export or back. Vanity invalidates every module that joined or left the set across client and SSR graphs and sends one full reload; the next request then uses the new ownership. An unrelated application save leaves that set alone.

Persisted candidates are staged as a complete file set before replacement. Existing regular files are backed up, and a later write failure or a candidate that is no longer current restores every already-replaced file before any new in-memory generation is accepted. This is failure-atomic within the running process, not a guarantee against power loss or process termination during the rename sequence; an incomplete rollback reports its recovery files.

## 9. Trust boundaries

- Build closures never cross into browser or SSR bundles.
- Portable contracts and their materialized artifacts are validated data, not serialized arbitrary objects.
- Runtime validator implementations cross by stable IDs and explicit binding.
- DTCG plugin codecs cross by stable identity/version and JSON-safe payload.
- Source maps and structured diagnostics carry authored locality through compiler layers.
- No public feature relies on process-global mutable registries.

## 10. Source ownership and boundaries

A file boundary exists to separate concerns a reader holds separately, not to satisfy a line-count target. Split when a file mixes mental models, when one concern's types would make unrelated code depend on another concern, or when two concerns change for unrelated reasons. Do not split a cohesive object merely because it is long: following one stateful thing through several files is harder to maintain than reading it in one place.

Three boundaries are intentionally shaped by that rule:

- `system/open.ts` is large because it materializes the complete chainable authoring surface. Its many method signatures and implementations are one public mental model; separating them by size would make the surface harder to navigate.
- `tokens/module.ts` keeps the inert graph and its closely related authoring, build, runtime, emission, and introspection projections together. Those operations share one private graph representation and splitting them would leak that representation across files.
- `values/kernel.ts` keeps the kernel, constructor binding, and value serialization together while they remain one small value-semantics model. `substrate/vanilla-extract/adapter.ts` likewise keeps the backend adapter's authoring, file-scope, serialization, and transformation lifecycle together. Its boundary is enforced by the backend-import guard, not by fragmenting the adapter.

### Current domain ownership

The source tree follows the mental model of the system:

| Domain | Canonical ownership |
| --- | --- |
| values | `kernel.ts` for immutable value capabilities and compatibility; `defaults.ts` for package bindings; `protocol.ts`, `extensions.ts`, and `codecs.ts` for portable value, extension, and DTCG codec contracts |
| tokens | `builder.ts` for the one `.add()` authoring grammar; `module.ts` for inert graph assembly and graph projections; `requirements.ts`, `derive.ts`, `resolve.ts`, `expressions.ts`, `fold.ts`, and `handle.ts` for their named semantic operations |
| system | `createSystem.ts`, `state.ts`, `open.ts`, `consolidate.ts`, `locked.ts`, `modules.ts`, and `shape.ts` for lifecycle, surfaces, and system-shape projections; `policies.ts`, `plugins.ts`, `axes.ts`, `definitions.ts`, `rules.ts`, `conditions.ts`, and `surface.ts` for their respective registries and models |
| CSS | `context.ts`, `class.ts`, `rules.ts`, `raw.ts`, `tokens.ts`, `compile.ts`, `emit.ts`, `validation.ts`, and the focused value/rule modules for neutral styling semantics and emission |
| runtime | `contract.ts` for serializable runtime data; `controller.ts` for roots, axes, snapshots, hydration, reconciliation, HMR, and inspection |
| introspection | `system.ts` for the canonical semantic map; `manifest.ts` and `manifestValidation.ts` for manifest production and reading; `dtcg.ts` and `interchange.ts` for DTCG orchestration and codec contracts |
| compiler | `core/` for host-neutral system/source transforms, `modules/` for style-source bundling and evaluation, `projection/` for system-to-artifact source including `systemCss.ts`, `hmr/` for CSS ownership/invalidation and host notifications, `auto-imports/` for routing, `hosts/` for host integration, and root-level `publication.ts` for failure-atomic artifact publication |
| substrate | `types.ts` for the portable module contract and explicitly Vanilla Extract-bound lifecycle contract; `index.ts` for selection; `vanilla-extract/adapter.ts` for all backend-specific integration |
| styling domains | `recipes/`, `atoms/`, and `ports/` remain separate because their authoring and projection semantics differ; `plugins/` and `presets/` likewise retain their domain boundaries |

Package entrypoints expose capabilities or select adapters. They do not become alternate homes for domain implementations.

The substrate keeps its portability boundary explicit:

| Contract | Owns | Portable |
| --- | --- | --- |
| `VanityPortableModuleSubstrate` | scope, function serialization, and style-module transformation operations that can survive across implementations | yes |
| `VanityVanillaExtractModuleLifecycle` | backend file scope, module serialization, package resolution, initialization, and Vite-plugin operations | no |

`vanilla-extract/adapter.ts` is the sole translation point for the backend lifecycle and for capture/identifier shapes that mirror Vanilla Extract. The cross-specification substrate boundaries and their re-entry conditions live in [decisions.md](./decisions.md); this section records the ownership and implementation seam.

### Compiler and Vite boundaries

The compiler owns Vanity's pipeline, while a host adapter owns how that pipeline is mounted. In particular, `compiler/modules/` answers the complete question “how does this style source become a live system?”: bundling and evaluation stay together, while resolved-input ownership remains broader than source instrumentation. `compiler/projection/` answers “how does this resolved system become browser or SSR artifact source?”: runtime module generation and `systemCss.ts` are projections and are not Vite-specific. `compiler/hmr/` owns module ownership and transition state; the host adapter supplies graph APIs, base-less graph/HMR addresses, based browser URLs, and transport notifications. The host boundary owns both conversions between a compiler-owned ID and a browser URL, so no compiler-owned address is ever resolved by guessing from a string's shape.

The plugin runs in more hosts than an application's dev server and build. It runs on Vite 5 through 8, in development servers, one-shot builds, and watch builds, and in client and SSR graphs. Nuxt runs a client host and a server host from one plugin instance, and WXT mounts the same plugin. Vitest reuses the application's Vite config by default, and tests create their own servers and builds. Adapter behavior is defined over all of these. The authoring-import guard, for example, serves application graphs only. Its plugin's `apply` leaves it out of a Vitest host, while a server that a test creates has no Vitest plugin and keeps the guard.

Vite reads hook filters differently across its supported range. Its Vite 6–8 development container compiles each hook filter at its first call and caches it by plugin object for the process; Vite 5 development applies no filters. Vite 8 binds filters for each one-shot build, Rollup compiles them per build, and Rolldown snapshots watch filters once when the watcher is created. Vanity keeps `load` and `resolveId` unfiltered for development and watch hosts. On Vite 6–8, a serve host holds each filter absent until that hook's first development call proves the absent filter was cached for every server sharing the plugin object. Watch hosts hold both filters until they close. On Vite 5, the active-host slot is released when a one-shot build closes or a watcher's `closeWatcher` hook runs. One-shot builds add their member files to an instance-wide union and assign a fresh filter object only when no hold is active; handlers still check membership for the active target. A build during a development hold joins the union but runs unfiltered. This monotone rule keeps every build that reads a filter able to project its members. The host-graph compatibility gate proves these projections on each supported major; the isolated [plugin ownership spike](../../spikes/plugin-module-ownership/README.md) records the host evidence.

Vite exposes no single public operation that removes one accepted module from every environment graph while retaining modules other systems still own, so the adapter invalidates through Vite first and then updates the graph indexes retirement requires; those structures are checked before use and the seam fails with a focused error rather than silently keeping stale CSS. Separately, the adapter holds a small, short-lived copy of the previous CSS bytes outside the ownership and module graphs, so a browser already revalidating the old stylesheet URL can finish a transition. That copy can neither restore ownership nor recreate a retired node.

One Vanity walk over installed dependency and peer-dependency edges decides which packages reach `@mszr/vanity` and produces the optimizer and SSR declarations. `vitefu` supplies package resolution, optimizer eligibility, and host-pattern matching primitives; it does not decide package roles. Vanity caches the set per plugin instance under `node_modules/.vanity/`, keyed by the nearest lockfile, root `package.json`, and SDK version; without a lockfile it computes the set at each start and writes no cache. Application auto-imports retain the delegate's native filter with exclusions for `node_modules` and `.git`, so they transform application modules and linked workspace packages while skipping installed dependencies.

`vite.ts` owns only the Vite lifecycle: the plugin factory and hooks, auto-import plugin composition, Vite/Rollup resolution and id/path normalization, browser URL construction, and Vite-shaped diagnostics and build errors. Its hooks delegate style bundling, source transforms, evaluation, HMR, and runtime artifact generation to `compiler/`. A helper belongs in the host adapter only when its answer would change for a different bundler; otherwise it belongs with the Vanity operation it serves.

### External format boundaries

Every external artifact format has a producer and a strict reader placed at the same architectural boundary. The producer defines the current representation; the reader validates the complete known schema recursively and rejects missing required material, unknown fields, stale keys from removed formats, and superseded versions before downstream code sees the data.

| Format | Producer | Strict reader |
| --- | --- | --- |
| portable system v2 | `system/contract.ts` | `system/contractValidation.ts` |
| manifest v4 | `introspect/manifest.ts` | `introspect/manifestValidation.ts` |

Vanity is pre-1.0, so rejecting data outside the current known schema is not backward-compatibility handling; it is the absence of it. Closing a schema to what the reader actually understands keeps the boundary honest and turns a confusing downstream failure into a clear diagnostic at the door. When a new external format is introduced, add its producer/reader pair before wiring it into a consumer, rather than growing loose checks at call sites.
