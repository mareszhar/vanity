# Can platform grammar establish declaration evidence?

This experiment asks whether platform grammar can validate CSS declaration values, identify shorthand components, and supply shorthand and logical property families without guessing from examples. These facts determine whether a compiler can promise token compatibility and state exactly how it checked a declaration. It imports no Vanity code.

**Observed result:** the prototype agrees with pinned Chromium on 31,968 resolved cells of the 95,973-cell corpus. The other 64,005 cells are explicitly unresolved, including 175 families with browser/grammar disagreements and four families with native parser aborts. Internal errors are counted separately; both raw and fallback checks have zero errors. The four range/unitless boundaries and the valid/invalid dimension checks for `calc`, `min`, `max`, and `clamp` are resolved and agree. This is finite corpus agreement, not proof over arbitrary CSS or browsers.

## Run

From the workspace root:

```sh
pnpm install --frozen-lockfile
pnpm --filter spike-property-grammar-agreement check
pnpm --filter spike-property-grammar-agreement test
```

The test uses the Chromium revision installed for the workspace's pinned Playwright package. It writes receipts under this spike's disposable `.vanity/`, including observations before gate assertions. It fails if an internal error occurs, any resolved cell disagrees, or the observed disagreement ledger changes. Missing dependencies or a missing browser fail the run. To regenerate named grammar data deliberately, run `pnpm --filter spike-property-grammar-agreement generate`; `check` compares it with its producer. To regenerate browser observations, `platform-gaps.json`, and `family-ledger.json`, run `pnpm --filter spike-property-grammar-agreement generate:gaps`, inspect each changed family, then run `test` in a fresh process. The authored property type fixture makes the complete csstype authoring domain visible to the generator.

## Setup

The pinned inputs are Webref CSS 8.7.5, CSSTree 3.2.1, lightningcss 1.33.0, vanilla-extract CSS 1.21.2, csstype 3.2.3 and the workspace's Playwright 1.63.0. The observed Chromium version is 153.0.8010.12, on Node 24.21.0, pnpm 12.8.1, macOS arm64. Package versions come from the catalog and shared lockfile.

[`grammar.generated.json`](./grammar.generated.json) retains syntax ASTs and their ranges, type/function definitions, shorthand expansions, logical property groups, selectors, and the property domain. Webref has 821 properties (751 non-prefixed), 159 shorthand maps, and 128 logical-group fields. The compared MDN data 2.35.0 has 670 properties (558 non-prefixed) and no explicit logical-group or shorthand-map fields; its `flex-grow` syntax has no non-negative bound. MDN's `initial` arrays can encode shorthand relationships, but cannot replace logical groups. Webref provides both and more range-bearing syntax, so the experiment uses it. The generator owns every generated fact; the spike does not maintain a separate property whitelist.

[`corpus.json`](./corpus.json) crosses all 1,371 distinct CSS names from csstype and known-css-properties with 66 authored strings and four JavaScript numbers. This includes every authoring longhand and shorthand, vendor names and names supplied only by the authoring catalogs, scalar types, keywords, external substitutions, arithmetic, and multi-value forms. Three additional text-combine-upright digits rows establish its bounded-integer browser difference. Numbers pass through vanilla-extract's real serializer; strings remain authored CSS. The model layers grammar matching and bounds over lightningcss, preserving unresolved results separately from acceptance. Arithmetic checks the dimensions of `calc`, `min`, `max`, and `clamp`; other math forms whose dimensions it cannot establish remain unresolved. Numeric arithmetic range handling follows the distinction between parse-time bounds and computed-value clamping.

## Observations

| Question | Observation |
| --- | --- |
| Full corpus | 95,973 cells; 5,239 accepted, 26,729 rejected, 64,005 unresolved, zero errored; zero resolved disagreements |
| Explicit disagreement fallback | 175 families / 1,069 raw disagreement cells: 123 properties unsupported by the browser, 52 supported properties with syntax differences |
| Arithmetic dimensions | Each of `calc`, `min`, `max`, and `clamp` establishes a length for its valid fixture and rejects its length/time mismatch; scalar bounds remain checked when unused draft function branches are incomplete |
| Native parser failures | `text-size-adjust`, both prefixed forms, and `font-stretch` abort on `calc(1 / 2)`; each family remains unresolved |
| String bounds | `padding: 1`, `padding: -1px`, `width: -5px`, and `flex-grow: -1` rejected by both the model and Chromium |
| Numeric authorship | Numeric padding/width `1` emit `1px`; numeric flex-grow `1` emits `1`; numeric padding `0` emits unitless `0` |
| Border grammar | `1px solid red` identifies width / style / color; `1px solid 8px` fails, and a one-hole probe identifies the final slot as `border-color` |
| Unknown second interpolation | A first hole cannot be attributed while a second external `var()` prevents whole-value matching; it stays unresolved |
| Property family | `border-color` expands to physical longhands and, through their logical group, includes `border-inline-start-color` |
| Environments | Two schemes × two density modes × two skins = eight states; compound authored cases apply; a dark/crisp surrounding condition narrows to two |
| Subtree substitution | A direct local override is enumerated in each state; Chromium computes root/literal/repeated dependent widths as 24px / 24px / 40px |
| Product cost | 5,000 declarations × 162 environments = 810,000 observations, 23 memoized grammar values; about 27–30 ms in the prototype |

[`platform-gaps.json`](./platform-gaps.json) records each disagreement cell, its authored form, actual CSS, the model and browser outcomes, and the property's specification reference. [`family-ledger.json`](./family-ledger.json) gives each family's supported status and cell count. The runner re-establishes those observations before applying the family fallback; a changed ledger fails. Examples include draft gutter keywords, draft column sizing values, and SVG unitless browser forms. Missing grammar references are detected before matching and remain unresolved. Named function branches absent from the value cannot participate, so their incomplete internals do not hide established scalar bounds. Nothing is silently treated as a successful check to erase a disagreement.

The native scan ran every corpus form for all 687 reachable properties with Webref grammar in isolated subprocesses, recording the last input before an abort. A separate subprocess probe established the Moz form, which has no Webref grammar and is therefore otherwise unresolved before native parsing. [`substrate-worker.mjs`](./substrate-worker.mjs) preserves that isolation mechanism; native abort evidence is separate from JavaScript exceptions. The release probe receipts retain the complete scan. The permanent corpus runner avoids invoking the known aborting families.

[`evidence-records.json`](./evidence-records.json) defines proposed records for `type`, `environments`, `sampled`, and `unresolved`. These are format fixtures, not a claim that the SDK already produces them. The component examples retain origins and token paths separately. The sampling fixture names its parameters and profile rather than claiming a proof from a passing grid.

## Identity and attribution limits

A direct handle or a bundle leaf can retain identity, and a serialized owned `var()` can be mapped to its token. Interpolation of a val-reference arrives as the same plain string as a literal; equality does not recover identity. The release's SDK probes established those boundaries directly. The independent evidence fixture records that lost identity as literal and does not invent a bundle origin.

Whole-value grammar and its nearest named component position establish attribution. A recursive union of referenced types does not: color functions contain lengths and numbers, which would falsely make those whole values color-compatible. The width-attribution probe exposed this and now selects the nearest unique named position before descending into function argument types. If no unique component is established, a later classifier must retain that uncertainty. Other holes must be substituted using the same environment before probing a position; external holes remain unresolved.

## What this establishes and does not

This establishes reproducible grammar data, the observed resolved corpus, explicit family gaps, component-position recovery for the shown forms, and a finite environment product with condition narrowing. It supports preserving grammar trees rather than a property-to-type union, and it shows a conservative family fallback can avoid false success. The resolved families include padding, width, flex-grow, border, color, background, opacity, margin, font-size, and z-index. The broad unresolved set is a material limitation, especially the 52 supported browser families with differences.

It does not establish arbitrary CSS agreement, full component attribution for every possible syntax, another browser's behavior, runtime sampling correctness, actual compiler graph enumeration cost, or browser computed values after variable substitution. The environment fixture measures enumeration and memoized checks over repeated values; integration must measure real graph resolution. Subtree custom-property semantics are browser-observed here; the SDK's propagated token implementation has separate release evidence. Grammar proof for an entire declared type and validation of particular environment values are distinct; a type admitting negatives in a non-negative property needs environment evidence. External variables, unknown grammar, and unsupported function dimensions never become type proofs.

## Footguns

The native percentage panic terminates the process and cannot be caught as a JavaScript exception. Webref syntax is intentionally ahead of browser implementation and may contain incomplete references. CSSTree accepts math functions without determining their dimensions and skips bounds written with dimensioned units; the model adds dimensional checking and explicit comparisons, with unresolved results when conversion is not established. The walker skips descendants by returning `walk.skip`. Structured parser syntax errors describe invalid input; unexpected model exceptions are `errored` and fail the gate, never becoming an unresolved verdict. AST serialization can normalize quoted URLs differently from the source; the whole-value check preserves the source. The grammar's scoped definitions need the consuming property, and a type union loses nested function positions. These are measured boundaries, not reasons to change the pinned parser or browser.

Sources: [Webref data and guarantees](https://github.com/w3c/webref/blob/main/packages/css/README.md), [CSSTree lexer and trace API](https://github.com/csstree/csstree), [CSS numeric type checking and range behavior](https://drafts.csswg.org/css-values-4/#calc-type-checking), and [logical border-color group](https://www.w3.org/TR/css-logical-1/#border-color).
