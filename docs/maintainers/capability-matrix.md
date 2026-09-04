# vanity — capability map

This map protects user-visible capabilities. It names the contract, its canonical specification, and the evidence that keeps it true. Domain specs own the exact behavior; this page answers where a reader can find it.

| Capability | Guarantee | Contract | Evidence |
| --- | --- | --- | --- |
| Immutable system growth | Open systems add capability; explicit augmentation and overwrite have separate ownership rules. | [System authoring](../reference/spec-system-authoring.md) | [`open.test.ts`](../../sdk/src/system/open.test.ts) · [`symmetric-authoring.test.ts`](../../sdk/src/system/symmetric-authoring.test.ts) |
| Locked system projection | Consolidation is pure; the compiler projects CSS, browser, SSR, and tooling artifacts. | [Open and locked systems](../reference/spec-system.md) · [architecture](./architecture.md) | [`projection.test.ts`](../../sdk/src/system/projection.test.ts) |
| Package and HMR safety | Four projection identities govern deduplication, invalidation, and last-good recovery. | [Open and locked systems](../reference/spec-system.md) | [`vite.test.ts`](../../sdk/src/vite.test.ts) · [`projection.test.ts`](../../sdk/src/system/projection.test.ts) |
| Typed CSS | CSS-named APIs preserve CSS semantics, token handles work as values, and raw standards escapes remain available. | [Typed CSS values](../reference/spec-values.md) · [styling and output](../reference/spec-css.md) | [`parity.test.ts`](../../sdk/src/values/parity.test.ts) · [`css.out.test.ts`](../../sdk/src/css/css.out.test.ts) · [CSS parity ledger](./parity-ledger.md) |
| Token composition | Token modules compose additively, preserve lazy references, and project contextual handles for one semantic identity. | [Tokens](../reference/spec-tokens.md) | [`tokens.module.test.ts`](../../sdk/src/tokens/tokens.module.test.ts) · [`tokens.axes.test.ts`](../../sdk/src/tokens/tokens.axes.test.ts) |
| Conditions, roots, and axes | Typed condition ASTs lower to platform CSS; axis precedence and locality are explicit. | [Conditions, roots, and axes](../reference/spec-conditions.md) | [`tokens.axes.out.test.ts`](../../sdk/src/tokens/tokens.axes.out.test.ts) · [`conditions.spec.ts`](../../sandbox/canary/tests/conditions.spec.ts) |
| Lossless styling | Ordered contributions preserve repeated declarations, conditions, fragments, and raw CSS. | [Styling and output](../reference/spec-css.md) | [`css.out.test.ts`](../../sdk/src/css/css.out.test.ts) · [`class-rules.test.ts`](../../sdk/src/css/class-rules.test.ts) |
| Component contracts | Recipes, anatomy, ports, and atoms expose typed component styling without rebuilding a style graph at runtime. | [Recipes](../reference/spec-recipes.md) · [ports](../reference/spec-ports.md) · [styling and output](../reference/spec-css.md) | [`recipes.out.test.ts`](../../sdk/src/recipes/recipes.out.test.ts) · [`port.out.test.ts`](../../sdk/src/ports/port.out.test.ts) · [`atoms.out.test.ts`](../../sdk/src/atoms/atoms.out.test.ts) |
| Extension ownership | Plugins add or require public system shape; they cannot silently overwrite host-owned shape. | [Plugins, constructors, and policy](../reference/spec-extensions.md) | [`open.test.ts`](../../sdk/src/system/open.test.ts) · [`propertyAliases.test.ts`](../../sdk/src/plugins/propertyAliases.test.ts) · [`hail.test.ts`](../../sdk/src/presets/hail/hail.test.ts) |
| Runtime control | Mutable tokens and activatable axes target declared browser-native slots and preserve semantic snapshots. | [Runtime](../reference/spec-runtime.md) | [`controller.test.ts`](../../sdk/src/runtime/controller.test.ts) · [`scheme-axis.spec.ts`](../../tests/scheme-axis.spec.ts) |
| Semantic tooling | Introspection, manifests, diagnostics, audit, DTCG, and CLI share one semantic record. | [Introspection and diagnostics](../reference/spec-introspection.md) | [`introspect.test.ts`](../../sdk/src/introspect/introspect.test.ts) · [`audit.test.ts`](../../sdk/src/introspect/audit.test.ts) · [`cli.test.ts`](../../sdk/src/cli.test.ts) |
| Framework integration | Vite, Vue, Nuxt, SSR, and HMR consume projected contracts while core remains framework-independent. | [Integration adapters](../reference/spec-integrations.md) · [Vue and Nuxt](../reference/spec-vue.md) | [`vite.test.ts`](../../sdk/src/vite.test.ts) · [`vue.test.ts`](../../sdk/src/vue.test.ts) · [`fresh-smoke.ts`](../../scripts/fresh-smoke.ts) |
| Opinionated authoring | Hail is an optional, deletable plugin; its design opinions never narrow core CSS capability. | [Hail](../reference/spec-hail.md) | [`hail.test.ts`](../../sdk/src/presets/hail/hail.test.ts) · [`demos.spec.ts`](../../tests/demos.spec.ts) |
| Consumer evidence | The testing kit exposes emitted CSS, folding, rendering, and editor-DX evidence to system and plugin authors. | [Consumer testing kit](../reference/testing-kit.md) | [`testing.test.ts`](../../sdk/src/testing.test.ts) · [`fresh-smoke.ts`](../../scripts/fresh-smoke.ts) |

## Scope boundaries

The [decision register](./decisions.md#deliberate-boundaries) owns capabilities Vanity deliberately excludes and their re-entry conditions. The [vision](../vision.md#6-the-capability-boundary) describes the product boundary.

## Change rule

When a capability changes, update its owning specification, this map when its location or boundary changes, the relevant decision, and the evidence in one change. A feature is not complete until its type, emitted CSS, browser, package, and documentation claims have matching proof.
