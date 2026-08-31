# vanity — capability map

This map protects user-visible capabilities. It names the contract, its canonical specification, and the evidence that keeps it true. Domain specs own the exact behavior; this page answers where a reader can find it.

| Capability | Contract | Evidence |
| --- | --- | --- |
| Immutable system growth | Open systems add capability; explicit augmentation and overwrite have separate ownership rules. | [System authoring](../reference/spec-system-authoring.md), [`sdk/src/system`](../../sdk/src/system) |
| Locked system projection | Consolidation is pure; the compiler projects CSS, browser, SSR, and tooling artifacts. | [Architecture](./architecture.md), [engine spec](../reference/spec-engine.md) |
| Package and HMR safety | Four projection identities govern deduplication, invalidation, and last-good recovery. | [Engine spec](../reference/spec-engine.md), `sdk/src/vite.test.ts` |
| Typed CSS without a capability cliff | CSS-named APIs preserve CSS semantics, token handles work as values, and raw standards escapes remain available. | [Value spec](../reference/spec-values.md), [CSS parity ledger](./parity-ledger.md) |
| Token composition | Token modules compose additively, preserve lazy references, and project contextual handles for one semantic identity. | [Token spec](../reference/spec-tokens.md), token type/output/DX suites |
| Conditions, roots, and axes | Typed condition ASTs lower to platform CSS; axis precedence and locality are explicit. | [Condition spec](../reference/spec-conditions.md), browser fixtures |
| Lossless styling | Ordered contributions preserve repeated declarations, conditions, fragments, and raw CSS. | [CSS spec](../reference/spec-css.md), rule-IR tests |
| Component contracts | Recipes, anatomy, ports, and atoms expose typed component styling without a runtime styling engine. | [Recipes](../reference/spec-recipes.md), [ports](../reference/spec-ports.md) |
| Extension ownership | Plugins add or require public system shape; they cannot silently overwrite host-owned shape. | [Extension spec](../reference/spec-extensions.md), plugin suites |
| Runtime control | Mutable tokens and activatable axes target declared browser-native slots and preserve semantic snapshots. | [Runtime spec](../reference/spec-runtime.md), runtime/browser suites |
| Semantic tooling | Introspection, manifests, diagnostics, audit, DTCG, and CLI share one semantic record. | [Introspection spec](../reference/spec-introspection.md), introspection suites |
| Framework integration | Vite, Vue, Nuxt, SSR, and HMR consume projected contracts while core remains framework-independent. | [Integration spec](../reference/spec-integrations.md), [Vue/Nuxt spec](../reference/spec-vue.md) |
| Opinionated authoring | Hail is an optional, deletable plugin; its design opinions never narrow core CSS capability. | [Hail spec](../reference/spec-hail.md), Hail suites and demo |
| Consumer evidence | The testing kit exposes emitted CSS, folding, rendering, and editor-DX evidence to system and plugin authors. | [Testing kit](../reference/testing-kit.md), packed fresh-app smoke |

## Deliberately absent capabilities

| Capability | Boundary | Re-entry trigger |
| --- | --- | --- |
| Runtime CSS-in-JS | The browser cascade owns live styling work. | Never; it contradicts the product boundary. |
| Component library | Vanity provides component styling contracts, not components. | Never; a component library is a separate product. |
| Whole-system composition | Plugins and token-module handoff cover composable shape without a second system merger. | A real multi-package compatibility problem that those seams cannot express. |
| Generic middleware or hooks | Existing emitter and plugin seams remain the extension contract. | A second real emission-transform consumer that cannot use those seams. |
| SVG/Iconify product API | Ports and ordinary CSS compose with external content systems. | A real external-content consumer with a documented ownership boundary. |

## Change rule

When a capability changes, update its owning specification, this map when its location or boundary changes, the relevant decision, and the evidence in one change. A feature is not complete until its type, emitted CSS, browser, package, and documentation claims have matching proof.
