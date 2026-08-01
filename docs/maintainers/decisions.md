# vanity — decisions

This register records choices that cross more than one specification. Domain specifications own behavior and examples; this page states the boundary each choice protects.

## Product and language

| Decision | Why it matters |
| --- | --- |
| Vanity is a design-system engine and TypeScript harness for CSS. | CSS remains the semantic authority; Vanity adds structure, inference, and diagnostics. |
| CSS-owned concepts use CSS names and semantics. Vanity coins names only for concepts CSS does not own. | Readers and tools do not translate between competing dialects. |
| `$` fences Vanity members only on user-shaped namespaces. | Tokens, axes, and modes keep ordinary names without risking member collisions. |
| Compatible token handles are values wherever their CSS data type is accepted. | Authors never build `var()` adapters by hand. |
| CSS-wide keywords work in every applicable declaration lane. | A helper cannot narrow the platform grammar by accident. |

## System and types

| Decision | Why it matters |
| --- | --- |
| `createSystem()` returns an immutable open system; `consolidate()` returns an immutable locked system. | One system grows additively, then gains resolved styling and runtime capabilities. |
| `add`, `augment`, `overwrite`, and `expect` have distinct contracts. | Names, ownership, and error repair remain explicit. |
| Token handles preserve one semantic identity across open, locked, and runtime forms. | Values, runtime addresses, manifests, and explanations stay connected. |
| Accumulated types use intersections and simplify at read boundaries. | Large systems retain readable hovers and practical type-checking cost. |
| A package boundary is a read boundary. | Published declarations expose a legible locked surface without builder machinery. |

## Projection and ownership

| Decision | Why it matters |
| --- | --- |
| `consolidate()` is pure and emission-free. | Plain TypeScript, SSR, and tools import system modules without compiler state or I/O. |
| The compiler owns CSS and portable projection. | Build closures remain in the build plane; browser and SSR modules contain data-only projections. |
| Compatibility, CSS, runtime, and documentation identities are separate. | Each consumer invalidates only for the change that affects it. |
| System CSS and style-module CSS are separate virtual modules. | System CSS deduplicates while component CSS preserves lazy splitting. |
| CSS namespace ownership is stricter than runtime compatibility. | Compatible facades never mask colliding emitted CSS. |
| Artifacts are atomic, last-good, byte-stable, and write-on-change. | Errors do not publish partial state or create watcher noise. |

## Styling and runtime

| Decision | Why it matters |
| --- | --- |
| Styling inputs are ordered contributions, not deep-merged objects. | Repeated declarations, fallbacks, fragments, and conditions remain lossless. |
| Emitters name their output: `class`, `fragment`, `rules`, `raw`, `tdec`, `recipe`, `anatomy`, and `atoms`. | The API tells readers what it produces. |
| Raw CSS remains an explicit standards lane. | Typed support never creates a capability cliff. |
| Conditions are typed AST values; axes declare ordered alternatives. | Selector, at-rule, precedence, locality, and runtime activation stay inspectable. |
| Mutable tokens and ports solve different lifetimes. | System decisions use runtime token slots; component inputs use component-owned custom properties. |
| Runtime transactions validate before the first write; snapshots use semantic addresses. | Dynamic state stays truthful across SSR, HMR, and schema evolution. |

## Extensions and tooling

| Decision | Why it matters |
| --- | --- |
| Plugins add or require public system shape through the same immutable chain as applications. | Built-ins and extensions share one ownership model. |
| Hail is the optional opinionated layer. | Core remains CSS-capable without prescribing design taste. |
| Introspection, manifest, diagnostics, audit, DTCG, and CLI derive from one semantic record. | Humans and agents receive one consistent explanation surface. |
| Hover text, completion, TSDoc, and diagnostics are tested API behavior. | The cursor is part of the product, not a secondary presentation. |
| Evidence spans types, emitted CSS, browsers, packages, tooling, and performance. | A green result proves the relevant user-visible behavior. |

## Deliberate boundaries

| Boundary | Re-entry condition |
| --- | --- |
| No runtime CSS-in-JS engine or component library. | Neither fits Vanity’s CSS-first product boundary. |
| No generic middleware/hooks. | Add one only when two real emission-transform consumers cannot use existing extension seams. |
| No whole-system composition API. | Add one only when plugins and module handoff cannot express a real multi-package compatibility problem. |
| No built-in SVG/Iconify product API. | Add one only for an external-content consumer with a clear ownership boundary. |
