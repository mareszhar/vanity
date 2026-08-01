# vanity — spec: Hail

Hail is Vanity’s opinionated layer: one configurable, independently deletable plugin that installs ergonomic constructors, design controls, token presets, and named system rules. Core remains an opinion-free design-system engine and TypeScript harness for CSS.

Every entry states the durable behavior and why it matters before naming the implementation.

## 1. Opinion boundary

**Contract — an opinion belongs in Hail when removing it leaves core fully capable.** This keeps CSS capability and project taste separate.

Core owns CSS color functions, relative-color syntax, typed channel operations, calculations, tokens, axes, conditions, rules, runtime mutation, and the accessibility-oriented `legibleOn()`.

Hail adds normalized design ranges, semantic scheme-aware elevation, a base-step sizing opinion, an aesthetic `contrastOf()` pivot, starter tokens, and selectable global rules.

Import Hail only from the plural preset entrypoint:

```ts
import { hail } from '@mszr/vanity/presets'
```

Hail is exported only from the plural `/presets` entrypoint.

## 2. Four selectable layers

**Contract — every opinion is independently removable.** A user pays only for the vocabulary and CSS they select.

| Layer | Contribution | Default |
| --- | --- | --- |
| constructors | `*x` colors, `size`, `bem`, `mx`, markers, `contrastOf` | installed |
| controls | range/base/pivot values at static, token, or mutable resolution | static |
| token presets | palette, roles, sizes, breakpoints, icons | none |
| rule presets | reset, motion, theming | none |

`hail()` installs the constructor layer with static controls. It emits no control custom properties, elevation coordinate, token preset, or global rule.

```ts
const ds = createSystem().addPlugin(hail()).consolidate()

ds.oklchx(0.62, 0.18, 282)
ds.size(2) // 16 with the default 8px base
```

## 3. Configuration

**Contract — options are grouped by concern and remain readable in signature help.** Misspelled preset names, unsupported range channels, and malformed tuples fail at the authored value.

```ts
const ds = createSystem()
  .addPlugin(
    hail({
      color: {
        ranges: {
          l: [0.08, 0.96],
          c: [0, 0.3],
          h: [300, 20],
          alpha: [0, 1],
          e: [0, 1],
        },
        elevation: true,
        contrastPivotL: 0.65,
        markers: { span: 'span', exact: 'exact' },
      },
      size: { base: 8, remTarget: 16 },
      controls: {
        default: 'token',
        overrides: { c: 'mutable', base: 'static' },
      },
      presets: {
        mode: 'opt-in',
        listed: ['palette', 'roles', 'reset', 'theming'],
      },
    }),
  )
  .consolidate({ prefix: 'app' })
```

`controls` also accepts the resolution shorthand:

```ts
hail({ controls: 'mutable' })
```

## 4. Normalized color families

**Contract — every core relative-color family has an `x` counterpart.** Users learn one value-mode grammar and carry it across color spaces.

Hail installs `rgbx`, `hslx`, `hwbx`, `labx`, `lchx`, `oklabx`, `oklchx`, and `colorx`. Every family is callable and exposes `.from()`.

Bare numeric values normalize only when their channel has a configured range. Without a range, the family behaves like its core counterpart.

```ts
ds.oklchx(0.7, 0.5, 35)

ds.oklchx.from(base, {
  l: 0.7,
  c: ds.span(0.1),
  h: ds.channel.add(12),
  alpha: ds.exact(0.8),
})
```

The four value modes are:

| Intent | Spelling | Meaning |
| --- | --- | --- |
| normalized absolute | bare number | position in the configured range |
| span-relative | `span(value)` | add a fraction of the configured span |
| native relative | `channel.*(value)` | use CSS channel units directly |
| literal absolute | `exact(value)` | bypass normalization |

Strings, token handles, ports, custom-property references, and expressions bypass bare-number normalization. `span()` and `exact()` accept `VanityCssInput`, so live values stay live.

`span()` is relative and is rejected in a positional absolute slot. Marker names may be changed through `color.markers`; renamed markers do not leave aliases.

## 5. Range law

**Contract — a range is an exact ordered pair and has channel-specific meaning.** This prevents ambiguous normalization.

Ranges are `[minimum, maximum]`. A third entry is a type error. Static values must be finite.

Meaningful range keys are:

- `l`, `c`, and `h` for LCH families;
- `h`, `s`, and `l` for HSL;
- `h`, `w`, and `b` for HWB;
- `l`, `a`, and `b` for Lab families;
- `alpha`;
- synthetic elevation `e`.

RGB `r`/`g` components cannot be configured as ranges. They are additive mixing components, not perceptual design axes. `b` remains available because it is meaningful in HWB and Lab.

Hue endpoints must be distinct values within 0–360. A descending pair such as `[300, 20]` is a wrapping range. Hail computes its span but leaves final modulo behavior to CSS.

## 6. Static, token, and mutable controls

**Contract — the same algebra moves along one explicit liveness spectrum.** Users do not maintain separate static and reactive implementations.

| Resolution | Token policy | CSS cost | Runtime writable |
| --- | --- | --- | --- |
| `static` | value-only | none | no |
| `token` | emitted reference | one custom property | no |
| `mutable` | emitted, registered, mutable reference | custom property + `@property` | yes |

`controls.default` applies broadly. `controls.overrides` accepts `base`, `remTarget`, `contrastPivotL`, and each range/elevation channel. A channel override controls both endpoints of that range.

Constant branches fold before CSS serialization. A mixed static/live expression retains only live references and the smallest correct `calc()`.

## 7. Semantic elevation

**Contract — elevation is an optional semantic coordinate, not a core color primitive.** Only elevation-enabled systems and colors pay for it.

`color.elevation: true` adds:

- `oklchx.inE(e, c, h, alpha?)`;
- the `e` member in `oklchx.from()`;
- a light/dark scheme axis when the host has none;
- one emitted scheme-direction token.

```ts
ds.oklchx.inE(0.2, 0.5, 35)
ds.oklchx.from(base, { e: 0.2, c: ds.span(0.1) })
```

When the host already owns a compatible `scheme` axis, Hail uses it. Otherwise Hail installs the canonical root-local color-scheme axis. Lightness and elevation are mutually exclusive in one `.from()` call.

Elevation maps low-to-high semantic position in opposite lightness directions: higher surfaces darken in light schemes and lighten in dark schemes. This requires a live scheme coordinate even when all other controls are static. Ordinary normalized colors remain flat.

The core accessibility helper remains separate:

```ts
ds.legibleOn(background) // accessibility-oriented APCA/native selection
ds.contrastOf(background) // Hail aesthetic threshold
```

`contrastOf()` expresses Hail’s black/white pivot as a composable relative OKLCH channel operation. It is not an accessibility guarantee.

## 8. Size and mixins

**Contract — size meaning is explicit.** Unitless output is the default; dimensional output asks for a unit.

```ts
ds.size(2) // 16
ds.size(2, 'px') // 16px
ds.size(2, 'rem') // 1rem
ds.size(2, 'bem') // 1rem
ds.bem(2) // shorthand
```

With the defaults, `base` is 8 CSS pixels and `remTarget` is 16. Static inputs fold. Token or mutable base controls preserve the equivalent live calculation.

`mx` is a recursively assembled utility namespace whose functions return typed `VanityFragment` values:

```ts
ds.mx.square(size)
ds.mx.circle(size)
ds.mx.truncate()
ds.mx.truncate(3)
```

## 9. Token presets

**Contract — a token preset contributes ordinary inspectable tokens.** There is no hidden mixin-token kind.

| Name | Contribution |
| --- | --- |
| `palette` | `color.palette.{accent,tinted,matte}` |
| `roles` | semantic colors plus `$dec`-ready typography |
| `sizes` | `size['1p'…'40p']` base-step lengths |
| `breakpoints` | compact through wide breakpoint values |
| `icons` | size, stroke-width, and optical-size customization hooks |

`roles` requires `palette`. Typography is a normal group whose children are CSS property names:

```ts
ds.class({
  ...ds.t.text.body.$dec,
  color: ds.t.color.text,
})
```

Each child remains independently addressable and themeable.

## 10. Rule presets

**Contract — global CSS is named, selectable, inspectable, and overridable.** No global side effect is inseparable from the plugin.

| Selection name | Rule group | Purpose |
| --- | --- | --- |
| `reset` | `hailReset` | box model and document defaults |
| `motion` | `hailMotion` | smooth defaults with reduced-motion floor |
| `theming` | `hailTheming` | scheme advertisement and explicit pins |

`theming` requires `roles`. The groups participate in normal plugin ownership, semantic-map, manifest, explanation, audit, agent-context, and CLI projection.

## 11. Selection

**Contract — selection is exact and deterministic.**

```ts
const optIn = {
  presets: { mode: 'opt-in', listed: ['palette', 'roles'] },
} as const
const optOut = { presets: { mode: 'opt-out', listed: ['motion'] } } as const
```

`opt-in` installs only listed names. `opt-out` installs every preset except listed names. Omitting `presets` installs none. Unknown names and missing dependencies fail with targeted diagnostics during authoring or plugin setup.

## 12. Packaging and evidence

Hail is authored from public detached token, constructor, utility, and rule modules. Plugin setup uses only additive public methods. It has no privileged compiler or engine hook.

Release evidence includes runtime, output, exact type, and Selenita suites; every color family and authoring mode; control-resolution output; scheme-live elevation; preset selection; ownership/introspection; packed `/presets` consumption; and the Hail-backed flagship.
