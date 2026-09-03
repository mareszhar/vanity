# vanity — CSS parity ledger

CSS is the capability floor. Every CSS-named Vanity API has a machine-readable record in [`sdk/src/values/parity.ts`](../../sdk/src/values/parity.ts), published from `@mszr/vanity/capabilities`. The record is authoritative; this page defines its review contract.

## Required record

| Field | Meaning |
| --- | --- |
| `id`, `api`, `cssConcept` | Stable Vanity ID, public spelling, and platform concept. |
| `spec` | Pinned specification URL, revision/date, and maturity. |
| `typedGrammar`, `rawGrammar`, `inputs`, `outputType` | The structured form, standards escape, accepted inputs, and emitted CSS kind. |
| `invalid`, `semantics`, `lowering`, `fallback`, `escape` | Rejected combinations, semantic differences, output, support behavior, and lowest-cost escape. |
| `fixtures`, `coverage`, `decision` | Evidence, honest coverage state, and rationale. |

Coverage states are `complete`, `typed-subset+raw`, `raw-only`, and `planned`. A raw escape is capability, not typed parity; the record must say which it is.

## Current coverage map

| Area | Coverage | Contract |
| --- | --- | --- |
| Color constructors and relative colors | Typed common grammar + raw future grammar | `oklch`, `rgb`, `hsl`, `hwb`, `lab`, `lch`, `oklab`, `color`, `color-mix()`, `light-dark()`, and all typed `.from()` families preserve handle liveness. |
| Numeric functions | Typed common grammar + raw future grammar | `calc()`, `min()`, `max()`, and `clamp()` are handle-aware. `round()`, `mod()`, `rem()`, trig, and exponential math remain planned. |
| Values best expressed as platform strings | Raw-only by design | Gradients/images, transforms, filters, and paths/shapes use typed value carriers plus standards syntax instead of a lossy private DSL. |
| Conditions and selectors | Structured common grammar + raw | Media, container, supports, and `@scope` have AST support; selectors retain platform syntax. |
| At-rules | Typed where structure improves correctness + raw | Layers, `@property`, keyframes, and `@font-face` are structured; the lossless rule IR carries remaining at-rules through `raw`. |
| Custom properties and keywords | Complete applicable grammar | Compatible handles, `var()`, and CSS-wide keywords work across every declaration form. |
| `color-scheme` | Complete property semantics + explicit convenience | Scheme convenience preserves `light-dark()` locality and makes fallback locality visible. |

`legibleOn()` is an algorithmic Vanity API, not CSS `contrast-color()`. It has its own contract in [values](../reference/spec-values.md).

## Keyword rule

Every applicable declaration form accepts `initial`, `inherit`, `unset`, `revert`, and `revert-layer`. The generated matrix covers classes, nested arms, recipes, anatomy, fragments, rules, atoms, raw escapes, and token/port declarations. A helper parser cannot erase a keyword accepted by its property grammar.

## Evidence and maintenance

Use pinned official specifications and Web Platform Tests when their license and runner fit. Keep serialization, browser-computed behavior, optimizer survival, type behavior, and editor diagnostics as separate fixtures.

CI fails when an exported CSS-named capability lacks a record, evidence contradicts its coverage state, a required keyword form is missing, a pinned spec changes without review, or a documented raw escape becomes unreachable. Release does not ship a planned gap as a typed claim.
