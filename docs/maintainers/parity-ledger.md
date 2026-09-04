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

The machine ledger owns individual records and coverage states; this table indexes its record families by the APIs they cover.

| Record family | Ledger records | Covers | Owning contract |
| --- | --- | --- | --- |
| Color constructors and relative colors | `CSS-V001`–`CSS-V010`, `CSS-V016` | `oklch`, `rgb`, `hsl`, `hwb`, `lab`, `lch`, `oklab`, `color`, `colorMix`, `lightDark`, and relative-color `.from()` | [typed CSS values §6 and §8](../reference/spec-values.md#6-same-named-css-parity) |
| Numeric functions | `CSS-V011`–`CSS-V014` | `calc()`, `min()`, `max()`, `clamp()` | [typed CSS values §7 and §9](../reference/spec-values.md#7-calculations) |
| Property grammar and keywords | `CSS-V015` | `boxShadow` property-form keywords | [typed CSS values §3](../reference/spec-values.md#3-input-law) |
| Grid functions | `CSS-V017` | `grid.minmax()`, `grid.repeat()` | [typed CSS values §7](../reference/spec-values.md#7-calculations) |
| Extended and raw CSS surfaces | `CSS-G001`–`CSS-G012` | alpha, device-cmyk, round/mod/rem and trig/exponential math, images, transforms, filters, shapes/paths, `attr()`, `env()`, anchor positioning, and font-face/keyframes/raw | [typed CSS values §6–12](../reference/spec-values.md#6-same-named-css-parity) · [styling and output §9](../reference/spec-css.md#9-at-rules-and-raw) |

Conditions, at-rules, and `color-scheme` are owned by their reference specifications rather than this value-parity ledger. `legibleOn()` is an algorithmic Vanity API, not CSS `contrast-color()`; its contract lives in [typed CSS values](../reference/spec-values.md).

## Keyword rule

The required keyword set and declaration-input rule are owned by [typed CSS values §3](../reference/spec-values.md#3-input-law). This ledger records whether each applicable capability preserves that rule across its typed, raw, and emitted forms.

## Evidence and maintenance

Use pinned official specifications and Web Platform Tests when their license and runner fit. Keep serialization, browser-computed behavior, optimizer survival, type behavior, and editor diagnostics as separate fixtures.

CI fails when an exported CSS-named capability lacks a record, evidence contradicts its coverage state, a required keyword form is missing, a pinned spec changes without review, or a documented raw escape becomes unreachable. Release does not ship a planned gap as a typed claim.
