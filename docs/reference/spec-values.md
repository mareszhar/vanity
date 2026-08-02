# vanity — spec: typed CSS values

One value language feeds token definitions, declarations, conditions, ports, runtime setters, keyframes, plugins, interchange, and testing.

## 1. Representation

A value records independent facts:

- CSS data type;
- normalized expression IR;
- dependencies;
- whether system context is required;
- support requirements and fallback/enhancement;
- optional exact fold;
- extension identity and portability;
- provenance.

There is no universal context-free `.css` property or implicit string coercion. `ds.serialize()` supplies system context. A top-level serializer may accept only self-contained values.

The existing `VanitySelfValue` / `VanitySystemValue` brand strategy remains. Do not propagate a resolution generic through every expression.

Logical and resolved handles are first-class expression inputs. Lowering preserves input identity, dependencies, liveness, requirements, source metadata, and unresolved policy. JavaScript coercion is never a value-lowering strategy.

## 2. Data types

The initial practical taxonomy remains open and must include at least:

- unknown/declaration value;
- integer and number;
- percentage and number-percentage;
- length and length-percentage;
- angle, time, frequency, resolution, and flex;
- color and image;
- position, easing, and transform function/list;
- custom-ident, dashed-ident, string, and URL;
- plugin-defined opaque and composite types.

Data type is not unit, token representation, emission, axis behavior, or mutability.

## 3. Input law

Every value position accepts:

- ergonomic primitives defined by that helper;
- compatible Vanity values;
- compatible open/locked token handles;
- valid raw CSS strings where the underlying CSS grammar accepts them;
- CSS-wide keywords in declaration/property lanes;
- grammar-specific keywords such as `none`;
- explicit typed raw syntax when first-class parsing is incomplete.

The direct-handle rule applies recursively to channels, calculations, relative-color inputs, fallbacks, lists, and plugin operations.

## 4. Constructors

Built-in constructors are dual:

```TS
import { length, oklch } from '@mszr/vanity'

const portableGap = length(2)
const portableColor = oklch(0.6, 0.15, 264)

const ds = createSystem({
  constructors: { length: { unitless: 'rem' } },
})

ds.serialize(portableGap) // 2rem
ds.length(2)              // the bound spelling, also 2rem
```

The top-level form is portable and policy-agnostic at construction. The bound form has the same runtime value brand but is projected through the system's policy for completion, hover, and restriction diagnostics. Bare adaptive values resolve when they enter/consolidate in a host; explicit units such as `length.px(8)` are immune.

System-bound constructors form an open namespace:

```TS
ds.length.px(8)
ds.length.rem(1)
ds.angle.deg(45)
ds.time.ms(150)
ds.percent(50)
ds.oklch(0.6, 0.15, ds.t.color.hue)
```

Configured bare constructors affect only their branded lane:

```TS
createSystem({
  constructors: {
    length: {
      unitless: 'px',
    },
  },
})
```

They never reinterpret every raw number in CSS.

Users add constructor families with detached definitions; ordinary wrapper functions need no registration:

```TS
const tone = defineConstructor('tone', {
  call: base => oklch.from(base, {}),
  vivid: base => oklch.from(base, { c: channel.multiply(1.2) }),
})

const ds = createSystem().addConstructors(tone)
ds.tone('red')
ds.tone.vivid('red')
```

Every additional member is call-like, typed, discoverable, introspectable, and lowered before the portable artifact boundary. User-defined families remain system-bound because their names do not exist until registration.

## 5. Policy resolution

Conformance and restriction are deliberately different:

| Policy | Resolution | Shape effect |
| --- | --- | --- |
| conformance | lazily interprets an abstract value, such as bare length unit | none |
| restriction | records `forbid` or `discourage`, replacement, reason, and reach | none |

Bound restricted constructors always carry an authoring diagnostic. Portable values cannot know the future host, so the system scans their constructor provenance at consolidation. `prospective` is the default and covers contributions registered after the restriction; `retroactive` covers the complete graph. A discouraged value compiles with a warning; a forbidden value fails.

The policy book has the known top-level groups `constructors`, `support`, `layers`, `reference`, `validation`, and `plugins`. `createSystem(config)` is exactly the initial policy book; `addPolicies` and `overwritePolicies` use the same grammar.

## 6. Same-named CSS parity

An export named after a CSS function matches the platform grammar and semantics for the declared spec snapshot. This applies to color functions, `light-dark()`, math, transforms, gradients, media/container range syntax, `@scope`, and every future same-named surface.

`lightDark(light, dark)` replaces `scheme()`:

- argument order matches CSS;
- color/color returns `<color>`;
- image/image-or-`none` returns `<image>`;
- mixed data types fail at the cursor;
- selection follows the consuming element's used `color-scheme`;
- explicit scheme convenience synchronizes `color-scheme` at the relevant roots;
- unsupported typed forms retain a standards/raw path and support-target diagnostic.

`legibleOn()` remains distinct because it is an APCA-based algorithmic helper, not CSS `contrast-color()`. Its option is `{ contrast }`, documented as minimum APCA Lc contrast.

Vanity's existing `alpha(color, amount)` is an alpha-replacement convenience, not CSS Color 5 `alpha()`. The standards function remains a separately tracked planned capability while its at-risk grammar evolves.

## 7. Calculations

Math operations follow CSS Values semantics:

- compatible additive types for addition/subtraction;
- typed multiplication/division where supported;
- compatible result types for `min`, `max`, and `clamp`;
- correct precedence and minimal necessary grouping;
- exact token/value inputs;
- unknown input yields an honest unknown result;
- `negate(token)` or equivalent one-call spelling for a compatible token;
- context diagnostics when a valid value is illegal in a query/descriptor.

No CSS-native name may front a narrower undocumented arithmetic language.

## 8. Colors

Preserve:

- supported color spaces and literal parsing;
- number, percentage, angle, `none`, calculation, token, and custom-property channels where CSS allows;
- relative-color construction and channel operations;
- interpolation spaces and hue policy;
- alpha replacement;
- gamut-sensitive and platform-dependent preservation;
- build/live equivalence where possible;
- support-aware contrast fallback.

Every standard relative family is available and follows one grammar:

```TS
ds.rgb.from(base, { r, g, b, alpha })
ds.hsl.from(base, { h, s, l, alpha })
ds.hwb.from(base, { h, w, b, alpha })
ds.lab.from(base, { l, a, b, alpha })
ds.lch.from(base, { l, c, h, alpha })
ds.oklab.from(base, { l, a, b, alpha })
ds.oklch.from(base, { l, c, h, alpha })
ds.color.from(base, { space, channels, alpha })
```

Omitted components inherit from the origin. Replacements accept compatible literals, references, token handles, mutable handles, calculations, and relative channel operations. `alpha` is always explicit in the relative record; `a` remains a Lab/OKLab/custom-color axis where applicable.

`channel` is an immutable relative component seed:

```TS
const towardPole = channel.subtract(pivot).multiply(-1000)
ds.oklch.from(background, { l: towardPole })
```

The chain stays typed and carries live dependencies through native `<color-function>(from …)` output. Exact folding is allowed only when proven.

For a live color target, `legibleOn()`:

1. `legibleOn()` over a live target folds a representative from authored defaults;
2. the fallback pick uses that representative;
3. the default-derived pick remains stable when runtime values drift;
4. a future native enhancement may be added when `contrast-color()` is interoperable for token-backed targets;
5. diagnostics and TSDoc state that degradation honestly.

Acceptance covers a mutable whole-color target, a color with mutable channel, and elevation over a live target.

This contract applies across direct token-channel authoring. A target without an authored representative produces a structured failure.

```TS
const colors = open.defineTokens({
  color: open.defineTokens()
    .add('surface', {
      val: open.oklch(0.14, 0.01, 285),
      mutable: true,
    })
    .add('onSurface', m => open.legibleOn(m.surface)),
})
```

## 9. Folding and support

Folding may return a value only when equivalence is proven. Refusal is normal and explainable.

Folding is recursive and partial. A mixed expression folds every constant subtree while retaining the smallest correct symbolic shell around live dependencies:

```TS
ds.calc(minC).add(ds.calc(maxC).subtract(minC).multiply(0.7))
// calc(var(--min-c) + (var(--max-c) - var(--min-c)) * 0.7)
```

Literal-only `calc()` wrappers and arithmetic disappear. Folding must never stringify a live handle, duplicate a calculation shell, invent an emitted custom property, or change CSS evaluation order.

Preserve expressions when they depend on:

- custom properties or mutable tokens;
- unknown/raw syntax;
- plugin semantics without folding;
- browser evaluation;
- color/gamut behavior;
- unsupported arithmetic;
- preserve-native policy.

The support target is explicit and versioned. A feature outside target receives:

- a proven fallback plus enhancement; or
- a diagnostic offering a deliberate build-folded representation, a target change, or an acknowledged raw/experimental path.

Hidden JavaScript recomputation is forbidden.

## 10. External custom properties

External custom-property handles retain the token-handle vocabulary:

```TS
const gap = ds.customProperty('--library-gap', {
  type: 'length',
})

gap.$name
gap.$var(ds.length.rem(1))
```

The constructor validates name syntax and fallback compatibility, but cannot claim to validate externally owned declarations.

The low-level runtime setter accepts a raw custom-property name, `{ $name }`, `{ name }`, or a compatible token/property handle directly.

## 11. Typed raw values

Typed raw values:

- preserve the asserted type for contextual compatibility;
- parse broad balance/syntax safety;
- never claim structure-dependent transforms;
- never fold;
- appear in provenance and audits;
- preserve authored serialization unless normalization is proven.

Raw strings remain the universal direct-CSS lane. A typed raw wrapper is for carrying type information, not for making valid CSS legal.

## 12. Extensions

The low-level value/operation protocol remains public and records:

- input/result data types;
- normalized core or opaque IR;
- system-context serialization;
- dependencies;
- optional folding;
- support/fallback metadata;
- extension identity;
- DTCG codecs;
- runtime-schema and diagnostic metadata where applicable.

Built-ins use the same protocol. Opaque closures stay in the in-process contract and lower before the portable boundary.

## 13. Evidence

Every helper receives:

- type acceptance/rejection for primitives, values, handles, raw strings, and keywords;
- completion/hover/TSDoc fixtures;
- exact output and nested-expression fixtures;
- fold/preserve explanations;
- support-target fallback or diagnostic;
- browser computed behavior where stable;
- optimizer survival;
- parity-ledger coverage linked to the relevant CSS spec snapshot.

`boxShadow: 'none'` and the systematic keyword matrix are one contract. A one-off parser exception is insufficient.

The declaration validator has a central property-grammar keyword lane, with `box-shadow`/`text-shadow` `none` and the initial CSS-wide matrix covered across class, recipe, atom, and alias paths.

Compatible token handles retain their CSS data type through constructor, operation, fallback, declaration, and runtime setter lanes. The cross-cutting value-law suite covers color channels, math/clamp/negation, grid fragments, typed custom-property fallbacks, image tokens, and snapshot setters. `lightDark(light, dark)` is the only scheme-pair value constructor and implements color/color plus image-or-`none` overloads; mixed forms fail at the cursor. `legibleOn` exposes only `{ contrast }`. `sdk/src/values/parity.ts` is the authoritative machine ledger. Every release emitter preserves these guarantees; broader generated property coverage remains continuous parity work.
