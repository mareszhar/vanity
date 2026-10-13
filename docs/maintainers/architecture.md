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
- declares the host's root order in every compiler-owned stylesheet, and each system's layer order in every stylesheet that carries its rules ([§5](#5-css-ownership));
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

A token value edit changes CSS identity without invalidating runtime shape. A description edit changes only documentation identity and must not rewrite CSS, send a CSS update, or churn CSS mtimes. Named-rule names remain structural documentation/compatibility data but do not become CSS bytes when the emitted rule is unchanged.

The generated application backing is selected by runtime-schema identity. Each authored member receives an export projection under its physical module ID, so a configured barrel and its leaf can share runtime state without sharing JavaScript exports. Actual system exports use the generated backing; ordinary exports remain host-module edges so objects, callables, and live bindings retain JavaScript module semantics. A change in the authored member set changes module ownership and requires invalidating the affected graph nodes.

Generated modules parse portable records from JSON text instead of embedding them as object literals, so an authored key such as `__proto__` stays own data through browser and SSR restoration. Token exports from style modules are restored the same way.

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

Every stylesheet opens with the layer order it needs, so no delivery order can rearrange Vanity's cascade. A stylesheet carrying a system's rules declares that system's complete nested order; every compiler-owned stylesheet declares the host's root order before it:

```css
@layer vendor, app;
@layer app;
@layer app.reset;
@layer app.tokens;
@layer app.recipes;
@layer app.utilities;
@layer app.overrides;
@layer app.tokens.base;
@layer app.tokens.axes;
@layer app.tokens.axes.scheme;
@layer app.tokens.cases;
```

Redeclaring a layer is a no-op, so whichever stylesheet the browser meets first establishes the whole order and every later one agrees with it. The repetition is deliberate and must not be optimized away: lightningcss merges repeated statements and esbuild keeps one per stylesheet module, and no stylesheet can assume it is not the one that arrives first.

Root ranking and the `compiler.layerOrder` option are specified in [system §9](../reference/spec-system.md#9-compiler-projection); the host adapter also places listed roots first in integrated HTML documents.

Inside the substrate, a system's order is a semantic contribution to the active capture rather than rendered text. The capture deduplicates it by file scope and complete order and emits native layer declarations before any other rule. Cached systems may keep independently bundled authoring copies; the capture, not the copy, owns the statement's lifetime. The [capture contribution spike](../../spikes/capture-layer-contributions/README.md) establishes that backend boundary.

One parser-owned identifier consumption validates layer and axis names, and names compare by decoded CSS identity: a spelling the parser would only partly consume as an identifier is rejected, not trusted. The [identifier consumption spike](../../spikes/identifier-consumption/README.md) establishes this boundary.

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

The [property grammar agreement spike](../../spikes/property-grammar-agreement/README.md) measures platform grammar, shorthand component positions, logical property families, numeric emission, and environment enumeration independently of the SDK. Its resolved Chromium corpus and explicit unresolved-family ledger distinguish grammar evidence from a parser accepting syntax; its environment timings cover the independent model rather than compiler graph resolution.

`css/grammar.ts` consumes `property-grammar.generated.json`, projected by `scripts/generate-css-grammar.ts` from the spike's named Webref data and explicit platform gaps. `checkDeclaration()` keeps native parsing and its centralized keyword/function exceptions, then supplements numeric ranges, unitless rules, and arithmetic dimensions. Unresolved grammar leaves the native verdict intact; internal exceptions propagate. Numeric authorship uses the selected substrate's `transformStyleModule()` unit rule without changing the emitted numeric input. Grammar data and CSSTree belong to authoring/compiler code and never enter the browser runtime entry.

`css/declaration.ts` classifies each authored declaration once, preserving identity before serialization, and stores its per-component origin, token paths, type, and `VanityEvidence` on the compiled unit and captured class record. Compatibility finalizes that record after the rule's custom-property declarations are known. Environmental substitution uses the existing token graph's emitted results and preserves their declaration point: inherited dependencies ignore subtree overrides, while locally repeated dependencies read them. Selector and media narrowing uses parsed conditions and declared mode facts, retaining unknown clauses as unknown. Declaration priority is outside the value grammar. Authored token dimensions and resolved arithmetic use the same math kernel. The generated property data retains component references and logical groups; `property-types.generated.ts` is its cursor projection. Both use the effective scoped lexer. The SDK projection omits unused parsed syntax trees and the spike's full discrepancy receipts. Function arguments do not become types accepted at their enclosing property position, and unresolved families cannot establish cursor exclusions or type evidence. `pnpm run css:grammar:generate` regenerates both projections; `css:grammar:check` verifies them as part of the root check gate.

The [element provenance spike](../../spikes/element-provenance/README.md) separates class-based style contributions, partial variant inference, explicit selection bindings and instance locators. Its page execution registry distinguishes current and stale style-module hashes across hydration, hot updates and reloads; a server transform alone cannot establish what a particular page executed. Sources without a page report remain unverified, and source equality does not establish rendered-state equality.

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

The inspection channel also carries declaration findings across bundled SDK copies. Rule finalization contributes compatibility and policy findings from the same component records; module evaluation, configured-system evaluation, and system CSS projection finalize the shared capture only after synchronous evaluation. Isolated authoring without a capture finalizes at the rule boundary. Authored diagnostic locations are normalized during collection before another factory changes the source context. Warning delivery uses the host's existing diagnostic sink or logger.

The SDK-independent [review decision experiment](../../spikes/review-decision-reach/README.md) establishes host-free mounting, optional Kit registration, ordered CSSOM declaration replay, conservative authored spans and vertical seen geometry. Its calibration reports evaluated and skipped relations beside false findings; it supplies browser substrate evidence rather than an integrated provenance graph.

The declarations policy folds net arithmetic terms on the classifier's existing parsed component AST. It does not walk style input or derive origin again. Escape values enter the same serializer and classifier, retain an unsafe origin, and record the declaring style/property through one inventory path, including atom escapes. The finite atom vocabulary remains outside the component declarations policy.

Token guidance is projected from token records into the canonical system map, explanations and agent context; its literal type is retained in native hovers without runtime metadata. Token property restrictions consume the origin classifier's finalized components and the generated platform shorthand/logical-group data. They share declaration-finding collection and baseline finalization, including when no declarations policy is enabled. Restrictions enter compatibility; guidance enters documentation identity.

The runtime acceptance path checks original input types, canonicalizes values to CSS text or finite numbers, applies the selected synchronous validator policy, and checks ranges on accepted output. Controllers retain canonical inputs for snapshots and accepted output for DOM projection. Reconciliation validates each recorded input once; root refresh and inspection reuse accepted output. Generated application backing supplies the separate browser-safe range comparator only when runtime token metadata contains a range. The base controller imports no comparator implementation. Standalone serialized runtime services receive the same capability; property grammar stays compiler-side.

Token checks consume the same axis/case contexts as declaration evidence. Ranged contrast checks walk the dependencies of both colors, generate a bounded grid, and call the runtime acceptance path before folding each reachable pairing. Compiled `legibleOn` picks stay fixed for their environment. Development-only validation produces separate profiles when their reachable states differ. Check records enter the documentation identity and survive portable-system capture into manifests, explanations and headless reports; sampled evidence names its grid and limits rather than claiming a proof.

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

Candidates are built completely—CSS, portable data, build exports, inspection records, namespace membership, runtime lookup, and serialized artifact—before accepted compiler state changes. A failed candidate leaves the last-good system and CSS virtual modules addressable, restores evaluation state, and remains watchable for a retry. CSS-identity changes switch style edges to the new virtual module and retire the old one only when no owner or transition still needs it. Same-identity docs changes update the manifest without a CSS notification.

Initial requests and hot updates share pending system evaluations. Readers follow the newest attempt, including when an older one fails, and a style bundle rechecks its captured systems before synchronous evaluation and publication. A replaced snapshot requires rebundling; genuine failures acquire no diagnostic grace period. Retained CSS is identified in the diagnostic rather than presented as a successful edit. The [async transform spike](../../spikes/async-transform-errors/README.md) establishes the native logging and overlay boundary. Eager HMR compilation creates the client graph entry even for a consumer requested only by SSR.

A hot update reports a captured compiler style failure only if the consumer remains failed when the update finishes. Vite notifications wait until the update succeeds. A failed batch may have accepted valid CSS before another consumer failed; its incremental notifications remain pending for successful recovery. Delivery coalesces module addresses and omits retired graph entries. When recovery or a contract change requires a reload, one reload replaces the incremental notifications. This prevents Vite's error overlay from triggering an early reload while replacement CSS is still being compiled. Pending delivery state is released with the host.

In development, the browser prunes a retired stylesheet only after its replacement is installed on that page. A server graph node does not establish that a page imported it, so the decision is made per client: development CSS modules report the revision they installed through Vite's native CSS path, evaluated style sources report the CSS they actually import, and the host sends a native prune to a client only when the two agree with current state. Stable style CSS and new system CSS both take part, and Vite's own import-analysis prunes of compiler CSS are held to the same boundary even when passes overlap or responses arrive late; every other native payload passes through. Pending state is dropped with its source, CSS, client, or host. Production output carries none of this transport. The [CSS installation spike](../../spikes/css-module-installation/README.md) establishes the native seam across supported Vite majors.

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

The plugin runs in more hosts than an application's dev server and build. It runs on Vite 6 through 8, in development servers, one-shot builds, and watch builds, and in client and SSR graphs. Nuxt runs a client host and a server host from one plugin instance, and WXT mounts the same plugin. Vitest reuses the application's Vite config by default, and tests create their own servers and builds. Adapter behavior is defined over all of these. The authoring-import guard, for example, serves application graphs only. Its plugin's `apply` leaves it out of a Vitest host, while a server that a test creates has no Vitest plugin and keeps the guard.

Hook filters must admit every member the current host can serve. Vite caches them at different points:

| Host | When filters are captured |
| --- | --- |
| Vite 6–8 development | Each hook's first call; cached by plugin object for the process. |
| Vite 8 one-shot build | Bound for each build. |
| Rollup build | Compiled for each build. |
| Rolldown watch build | Snapshotted when the watcher is created. |

Vanity leaves `load` and `resolveId` unfiltered in development and watch hosts. Each Vite 6–8 development hook keeps its filter absent until its first call establishes that every server sharing the plugin object has cached the absence. A watch host keeps both filters absent until it closes.

One-shot builds add their member files to an instance-wide union. A fresh filter object is assigned only when no development or watch host holds it absent; a build during a development hold adds its members but runs unfiltered. Handlers always check membership for the active target. Growing the union keeps an earlier build's captured filter valid while later builds discover more members.

The supported-major graph gate verifies these lifetime and projection rules; the [plugin ownership spike](../../spikes/plugin-module-ownership/README.md) records the host evidence.

A Vite HTML hook selects a build only when it needs to link a document layer-order asset. Without listed roots, or when Nuxt owns the document statement, it returns immediately. Where Vite omits the hook environment, Vanity matches the HTML file against active browser builds' resolved inputs and requires one owner. A completed build leaves the active group; a watch host stays live until `closeWatcher`. The [HTML build host spike](../../spikes/html-build-hosts/README.md) establishes the context and lifetime facts.

The [style import parity spike](../../spikes/style-import-parity/README.md) measures client resolver reuse, virtual loading, package requests and framework pipeline acquisition independently of the SDK. One plugin container avoids repeated initialization, but its answer during one plugin's `buildStart` can differ from its answer after a later plugin initializes. Resolver identity therefore does not establish answer stability across initialization. The spike records that timing limit separately from development/build/watch parity after initialization; its local evaluator does not establish the SDK's CSS, diagnostic or HMR contracts.

The Vite adapter supplies `resolve(specifier, importer)` and `load(id)` from the existing client plugin container. Build contexts serialize compiler resolution requests so overlapping custom-options receipts cannot lose the authoring marker. `compiler/modules/` adapts named package requests for Node and enriches evaluation failures through the same normalized metafile inputs ownership traverses. The SDK's CSSTree import stays a native Node dependency at the existing implementation boundary: its ESM data loader reads `import.meta.url`, which cannot survive the CommonJS evaluation bundle. Authored imports retain the host resolution contract. The adapter canonicalizes physical self-query stamps and client optimizer cache answers to original sources before the compiler sees them. It creates no resolver server or second plugin pipeline. Nuxt production SSR uses its own environment after its client build closes; development server requests reuse the live client container.

Configuration discovers system sources and members without evaluating them. Every evaluated consumer awaits the same generation-aware attempt after plugin initialization; a failure is cached until a relevant edit retries it. Accepted systems, namespaces and CSS publish atomically, so consumers cannot observe partial evaluation or lose accepted artifacts during a replacement attempt.

Preparation reports attempted baseline inputs before reading them, so creating or repairing a configured file can recover the same server. Failed attempts retain prior dependency edges together with attempted inputs and compiler error locations; only an accepted generation replaces the graph. One compiler baseline reader serves preparation, style evaluation and headless check, and capture finalization owns acceptance. Check acquires one configured client pipeline and drives the existing bundler and evaluator; optional host packages stay native imports so their package-owned loading contracts remain intact.

Vite exposes no single public operation that removes one accepted module from every environment graph while retaining modules other systems still own, so the adapter invalidates through Vite first and then updates the graph indexes retirement requires; those structures are checked before use and the seam fails with a focused error rather than silently keeping stale CSS. Separately, the adapter holds a small, short-lived copy of the previous CSS bytes outside the ownership and module graphs, so a browser already revalidating the old stylesheet URL can finish a transition. That copy can neither restore ownership nor recreate a retired node.

Deleting a style source uses the same ownership and graph retirement. Capture generations discard in-flight results for deleted sources, and inspection records are keyed by physical paths while their public source identities stay root-relative. Importers of a deleted source enter Vite's existing failed-importer set; restoration through a create or update event invalidates those nodes, including SSR hosts that do not dispatch create-event HMR, and leaves the client's native retry transition intact. No separate importer graph is retained. Watch builds also retire absent retained sources before publishing the manifest, because removing the last consumer can unwatch a source before its unlink event arrives.

One Vanity walk over installed dependency and peer-dependency edges decides which packages reach `@mszr/vanity` and produces the optimizer and SSR declarations. `vitefu` supplies package resolution, optimizer eligibility, and host-pattern matching primitives; it does not decide package roles. Vanity caches the set per plugin instance under `node_modules/.vanity/`, keyed by the nearest lockfile, root `package.json`, and SDK version; without a lockfile it computes the set at each start and writes no cache. Application auto-imports retain the delegate's native filter with exclusions for `node_modules` and `.git`, so they transform application modules and linked workspace packages while skipping installed dependencies.

`vite.ts` owns only the Vite lifecycle: the plugin factory and hooks, auto-import plugin composition, Vite/Rollup resolution and id/path normalization, browser URL construction, and Vite-shaped diagnostics and build errors. Its hooks delegate style bundling, source transforms, evaluation, HMR, and runtime artifact generation to `compiler/`. A helper belongs in the host adapter only when its answer would change for a different bundler; otherwise it belongs with the Vanity operation it serves.

CSS queries use a complete style-module stylesheet view at a stable CSS address. The core transform and load counterpart share evaluation, findings, baseline, dependency and ownership inputs. The Vite adapter supplies the address and response classification; Vite's existing CSS hooks process, inline and extract the bytes. `raw` remains the native source-file load. Queried views use distinct ids in the host's module graph; source and dependency updates include every loaded view in the existing compiler HMR fan-out. Raw vanilla-extract CSS views use the substrate's existing stylesheet loader, preserving its class naming without adding raw rules to Vanity's manifest. The bundled substrate transform registers its emitted stylesheet imports in the same source-owner map and page installation handshake as Vanity rules, so deletion retires every stylesheet Vanity serves. Before the bundled substrate transform runs, its existing server invalidates the source and recorded inputs through Vite’s public graph and watcher APIs; watch correctness does not depend on a second filesystem event arriving in time. CSS-query-only loads run that same transform before reading its stylesheet. A separately registered vanilla-extract plugin owns its own compiled files.

### External format boundaries

Every external artifact format has a producer and a strict reader placed at the same architectural boundary. The producer defines the current representation; the reader validates the complete known schema recursively and rejects missing required material, unknown fields, stale keys from removed formats, and superseded versions before downstream code sees the data.

| Format | Producer | Strict reader |
| --- | --- | --- |
| portable system v2 | `system/contract.ts` | `system/contractValidation.ts` |
| manifest v4 | `introspect/manifest.ts` | `introspect/manifestValidation.ts` |
| runtime snapshot v2 | `runtime/controller.ts` | the same controller's snapshot reconciliation |

Vanity is pre-1.0, so rejecting data outside the current known schema is not backward-compatibility handling; it is the absence of it. Closing a schema to what the reader actually understands keeps the boundary honest and turns a confusing downstream failure into a clear diagnostic at the door. When a new external format is introduced, add its producer/reader pair before wiring it into a consumer, rather than growing loose checks at call sites.
