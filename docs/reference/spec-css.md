# vanity — spec: styling and output

The locked system exposes one CSS input language through style-data producers and style emitters. The distinction is behavioral: producers return reusable data; emitters register output for compiler materialization.

## 1. Styling families

### Style-data producers

| API | Result |
| --- | --- |
| `ds.fragment(input)` | reusable ordered styling data, no selector and no output effect |
| `ds.tdec(tree)` | token custom-property declarations as reusable style data |
| `ds.tdec.propagated(tree)` | token declarations plus changed build-folded and repeated live dependents as reusable style data |
| `port.dec(value)` | one component-owned custom-property declaration fragment |

### Style emitters

| API | Registered output |
| --- | --- |
| `ds.class(input)` | one generated class |
| `ds.recipe(config)` | finite class-selection function |
| `ds.anatomy(config)` | part-keyed class-selection functions |
| `ds.atoms(config)` | bounded utility-class map and resolver |
| `ds.rules(map)` | author-specified selector rules |
| `ds.keyframes(steps)` | keyframes plus animation-name handle |
| `ds.fontFace(descriptors)` | font-face rule(s) plus family handle |
| `ds.raw(css)` | raw CSS emitted in the declared layer |

These lists describe the effective locked public surface: a member that appears only in a lower-level implementation type is not an alternate public styling family.

All applicable APIs consume the same property/value, condition, nesting, selector, at-rule, alias, token-handle, fragment, and raw standards forms appropriate to their context.

### Variability and ownership

| Need | Use | Why |
| --- | --- | --- |
| finite component choices | recipe or anatomy | precompiled classes; no runtime CSS generation |
| finite declared utility choices | atom set | bounded property/value space; precompiled classes |
| open per-instance component value | port | component-owned custom-property boundary |
| live system-wide design decision | mutable token | system-owned runtime control with snapshots and reconciliation |

Learning ownership predicts lifetime: ports belong to component instances; mutable tokens belong to the system.

## 2. Classes

```TS
const card = ds.class({
  display: 'grid',
  gap: ds.t.space.md,
  '&:has(> img:first-child)': {
    paddingBlockStart: 0,
  },
  wide: {
    gridTemplateColumns: '1fr 2fr',
  },
})
```

Contract:

- returns a serializable class handle/string;
- properties are exact and conditions are branded distinctly;
- valid CSS values remain open;
- CSS-wide and grammar keywords remain accepted;
- nesting is unlimited within CSS validity;
- property-first condition maps remain available (`color: { base: ink, hover: brand }`) and lower identically to selector-first condition arms;
- selector interpolation uses imported style handles;
- every declaration is parser-validated;
- number behavior is explicit policy/data, not guessed;
- source/debug/provenance survives lowering.

For repetitive style modules, a project may expose selected bound helpers through its own style auto-import barrel. Keep `ds.class` as the canonical member name; `cls` is a local shorthand that makes the reserved property convenient as a bare binding without adding a second Vanity API:

```TS
import { ds } from './system'

export { ds }
export const { class: cls, t } = ds
```

The integration adapter can expose that barrel to evaluated `*.css.ts` modules through `autoImports.style` ([spec-integrations.md §8](./spec-integrations.md#8-integration-adapters)). Consuming application modules use the generated style exports as a namespace when that keeps the component boundary clear:

```TS
import * as s from './Card.css'

const className = s.card
```

## 3. Fragments and mixins

A mixin is a normal TypeScript function. `ds.fragment()` is the typed data it may return:

```TS
function useFlex(gap?: string) {
  return ds.fragment({
    display: 'flex',
    gap,
  })
}
```

The fragment factory carries the same configured property vocabulary as `ds.class`, including property aliases and aliases-only policy. Installing an alias plugin never removes fragments, ordered arrays, omission, or selector-map rules from the style language.

Flat fragments may spread into objects when ordinary last-write-wins is intended. Fragments with conditions/nesting use the canonical array form:

```TS
const row = ds.class([
  {
    display: 'flex',
  },
  useFlex(),
  {
    gap: ds.t.space.md,
  },
])
```

Arrays flatten into ordered lossless IR. They do not deep-merge maps or discard repeated declarations.

## 4. Omission

`ds.omit` is a property-valued sentinel that removes a declaration:

```TS
const item = ds.class({
  gap: includeGap ? ds.t.space.md : ds.omit,
})
```

`undefined` is omitted too, for ordinary optional-flow ergonomics. `ds.omit` documents an intentional branch. CSS `unset` always emits the real keyword.

## 5. Token declarations

`ds.tdec()` creates a typed fragment of custom-property declarations:

```TS
const dense = ds.class({
  ...ds.tdec({
    color: {
      brand: ds.oklch(0.55, 0.2, 20),
    },
  }),
  padding: ds.t.space.sm,
})
```

It:

- accepts exact token-tree paths and compatible values;
- declares exactly the named public properties and nothing else;
- does not rewrite consumer styles;
- rejects a non-inheriting registered token with an explanation;
- records subtree override provenance;
- remains usable on an open system by utils because it can produce data over logical handles.

A consumer style that reads a named token through `var()` follows the new value inside the subtree. A token derived from it does not: the browser substitutes `var()` on the element that declares the custom property, so a dependent declared at the token root is inherited with the value substituted there. `ds.tdec.propagated()` declares the same substitution plus every dependent it changes — re-resolved build-folded values and repeated live expressions — so the subtree re-derives them; [tokens §11](./spec-tokens.md#11-handles-and-projections) owns its selection and mode diagnostics. Use `tdec` when the fragment should change only the named properties.

Definition replacement is `overwriteTokens`; subtree cascade is `tdec` or `tdec.propagated`; runtime mutation is `$set`.

## 6. Rules and ordinary TypeScript

There is no iteration DSL. Computed style structures use real TypeScript:

```TS
const scale = {
  sm: 4,
  md: 8,
  lg: 16,
}

ds.rules(fromEntries(
  Object.entries(scale).map(([name, px]) => [
    `.p-${name}`,
    {
      padding: `${px}px`,
    },
  ]),
))
```

Vanity ships small literal-key-preserving helpers (`fromEntries`, `mapRecord`, `range`) because native library typings often widen keys and erase cursor diagnostics.

Every emitter accepts computed/spread inputs without a static-extractor subset.

## 7. Conditions and selectors

Named conditions are bare keys and may nest. Raw selectors and at-rules remain available.

Cross-file structural relationships use imported handles in selector interpolation. Consumer theming of values uses ports.

Anatomy part-scoped keys remain `'<part>:<condition>'`, typed over declared parts and named conditions. They receive distinct hover branding.

## 8. Layers

Every rule belongs to a per-system nested layer. System prefix is the default top-level layer root.

The primary file-level binding is pure:

```TS
import {
  ds as system,
} from './system'

const ds = system.inLayer('components')

export const button = ds.class({
  display: 'inline-flex',
})
```

Per-emitter `.layer(name)` may override it. No ambient `assignToLayer()` mutation exists. Recipe/anatomy do not carry bespoke `layer:` options.

Authored styles default to the first layer after system-owned layers. Unlayered consumer CSS retains ordinary precedence over layered output.

Every stylesheet carrying a system's rules opens with that system's complete layer order. Every compiler-owned stylesheet also opens with the host's root order. Stylesheet delivery order therefore cannot change Vanity's cascade.

Token emission uses the phase layers `tokens.base`, `tokens.axes.<axis>`, and `tokens.cases` beneath the system token layer. Local token declarations belong to the caller's styling emitter, and `overrides` is an ordinary top-level cascade layer.

## 9. At-rules and raw

`keyframes` and `fontFace` retain typed handles and context-specific grammar. Condition keys inside keyframe steps remain errors.

`@scope` is a typed condition/root form.

The rule IR also represents:

- `@property`;
- `@counter-style`;
- `@page` and margin rules;
- view-transition rules;
- grouping/conditional at-rules;
- repeated declarations and fallbacks;
- labeled raw nodes.

Not every at-rule needs a dedicated helper. `ds.raw()` is the complete CSS escape and records layer, source, and audit label/context.

## 10. Validation

Every emitted declaration, selector, query, descriptor, and raw block receives appropriate CSS parsing. TypeScript handles names/data-type compatibility; parsers handle grammar.

The declaration validator supplements native parsing with generated property ranges and unitless rules. Nonzero unitless length strings (`padding: '1'`), negative padding/width/flex growth, integer lower bounds, and established dimensioned bounds fail. JavaScript numbers use the selected substrate's property unit rule in classes, recipes, anatomy, rules, fragments, keyframes and atoms, including atom escapes: `padding: 1` emits `1px`, while negative numeric padding fails. Font-face numeric descriptors use that same rule (`fontWeight: 1` stays unitless). Custom-property declarations and token and port defaults preserve numbers for substitution; they do not acquire a length unit. Numeric math in `calc`, `min`, `max`, and `clamp` checks compatible dimensions. Declaration priority is parsed separately from the value grammar; `!important` does not bypass numeric validation or erase token provenance.

CSS-wide keywords, native keyword grammar, and vendor fallback arrays retain their native verdicts. External `var()`/`env()`, unknown functions, incomplete grammar, and explicit platform-gap families receive no new verdict. A family marked unresolved preserves both existing acceptance and existing rejection. Internal validator exceptions fail; they are never an unresolved result. The [property grammar spike](../../spikes/property-grammar-agreement/README.md) names the measured platform limits.

The pinned Chromium corpus contains 95,973 boundary-value cells: 31,968 resolved agreements and 64,005 unresolved cells, with no errors or resolved disagreements. Coverage is higher for the properties the repository's adopters use. Crossing those properties with the same corpus gives:

| Property set | Properties used | Resolved cells | Unresolved cells |
| --- | --- | --- | --- |
| Sandbox demos and canary | 109 | 6,210 (81.4%) | 1,420 |
| Agent skill fixture | 13 | 751 (82.5%) | 159 |
| Benchmark fixtures | 4 | 251 (89.6%) | 29 |

These are grammar coverage figures over boundary inputs, including resolved rejections, not a claim that every emitted declaration was checked. Whole declarations containing `var()` remain unresolved until owned references can be established. The compiler records that evidence separately for each component. Agreement is measured in pinned Chromium; arbitrary syntax and other browsers are outside that corpus's guarantee.

Declarations retain a component record: the property position, authored origin, token paths, data type, and evidence. Direct handles and `$dec` leaves retain token identity. System custom-property references in strings identify their tokens; a `reference: 'val'` interpolation is a literal, even when its text equals a token's default. Typed calculations and string calculations over tokens are derived values; ports and external custom properties have their own origins.

A declared type incompatible with its property position produces `VANITY_CSS_TOKEN_KIND`, including inside a shorthand. Unbounded named grammar positions carry `type` evidence. Positions with bounds check the relevant authored axis and case products in light and dark schemes and carry `environments` evidence. A surrounding mode condition narrows that product, respecting conjunctions, alternatives, and negation. Subtree custom-property declarations supply the values actually emitted: an inherited dependent substitutes at its declaration point and stays fixed; a dependent repeated by `tdec.propagated()` reads the subtree's values. A reservation without an authored default, an external variable, and a platform-gap family remain `unresolved`. Unexpected exceptions fail the compiler.

With the opt-in `declarations` policy, each governed component must come from a token, a derivation, a port, or a labeled `unsafe.value(value, reason)`. An explicit-unit constructor used directly is literal under this policy. A value that loses identity through val interpolation is also literal; equal token values are suggestions, never recovered identities. External substitutions cannot establish system provenance. Components of other types remain outside the policy, and `mechanics` exempts only the exact listed literals. CSS grammar validation still runs on exempt and unsafe values.

`derivations: 'allow'` accepts token-derived values; `audit` accepts them and retains their terms for reporting. `restrict` checks each token term's net factor after nested calculations fold: integer or reciprocal scaling of one token, either sign, and sums of unscaled tokens are allowed. `min`, `max` and `clamp` require every argument to satisfy that rule. A net factor of 13/16 fails with `VANITY_DECLARATION_DERIVED`; integer multiplication followed by its inverse is allowed. This bounds arbitrary adjustment; it does not promise membership in a scale. An unestablished transformation is not claimed to satisfy the restriction.

`unsafe.value('13px', 'optical alignment with the icon')` labels one declaration's exception. It requires a non-empty reason when declared, uses the same numeric unit rule, and does not bypass CSS validity. Its escape record names the source, declaring style and property. Raw CSS remains an explicit separate escape. The scale-stray audit reports only properties outside the declarations policy, avoiding duplicate convention findings.

Compatibility and policy findings are collected on the evaluation capture and finalized after the module evaluates. A token-kind mismatch or a `forbid` finding fails the module; `discourage` findings warn and compile. Later declarations are reached even after a finding. Other authoring errors still stop evaluation, and no unresolved result is presented as checked.

The same generated grammar produces the cursor's property data-type table. Known color, length, and number token mismatches fail there; literal zero remains valid in length positions. Calculation values keep CSS integer rounding. Incomplete and platform-gap families retain permissive cursor inputs, since their grammar cannot establish exclusion.

Diagnostics:

- use stable codes and structured locality;
- point to the authored property/value;
- distinguish an unknown property from a known property with invalid grammar;
- preserve future CSS through the raw standards form;
- wrap compiler/substrate errors;
- recover through HMR after a fix without restart.

A system created in `*.css.ts` receives the dedicated plain-`system.ts` fix, not the substrate's invalid-export error.

Under an aliases-only property policy, `ds.class.standard({...})` preserves exact standard-property object authoring and `ds.raw(...)` preserves full raw CSS. An alias policy may change the preferred completion vocabulary but cannot make a platform property unreachable.

Authoring repairs name the mistaken position: a condition object cannot be an object-literal style key; register it in `createSystem({ conditions })` and use its name. `legibleOn` defines a token: define `onX: legibleOn(…)` in the graph and reference `t.….onX` in styles. Registered selectors without `&` follow the same descendant nesting as raw selector keys, and negating an anchored conjunction contributes no complement-of-anchor arm.

## 11. Delivery

Style delivery is import-driven:

- the compiler performs no repo-wide style scan;
- a style module's CSS follows its JS import and code-splits with lazy routes;
- system CSS is separate and deduplicated;
- unused components are not shipped;
- eager style barrels are documented and audited as splitting hazards;
- precompiled component packages preserve the same model.

## 12. Output evidence

Tests lock:

- exact class/rule/fragment lowering;
- arrays preserving conditional siblings and repeated declarations;
- aliases plus standards/raw escape;
- condition/selector branding and diagnostics;
- root/scope/layer order independent of imports;
- complete system and host-root layer statements in every applicable stylesheet;
- lazy chunk CSS and system CSS deduplication;
- every at-rule family's placement semantics;
- parser diagnostics and author frames;
- raw audit/provenance;
- optimized browser behavior.
