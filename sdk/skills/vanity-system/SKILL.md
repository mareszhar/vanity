---
name: vanity-system
description: Define or evolve a Vanity design system (@mszr/vanity) — the plain `system.ts` that declares tokens, scales, semantic roles, type bundles, named conditions/breakpoints, color derivation, themes and axes (light/dark, density, contrast, skins), and live runtime values. Use this whenever you add or rename a token or role, introduce a theme or mode, make something user-customizable (accent color, corner radius, font, density), build a settings/tweak panel that edits design values live, persist theme preferences, or fix contrast — in any repo with `vanity.config.ts` or `@mszr/vanity` — even if the request just says "add a brand color", "support dark mode", or "let users pick a theme".
---

# Designing the system

The system module is the single source of truth for every design decision. Components (see `vanity-styling`) only reference roles from it. When a decision lives here, one edit restyles the product, every theme stays complete, and runtime controls can move it live without touching components.

## 1. Where it lives

`vanity.config.ts` → `compiler.system` points at it. It is plain TypeScript (never a `*.css.ts`), and it exports the consolidated system, usually as `ds`:

```ts
import { createSystem, media } from '@mszr/vanity'

const open = createSystem()                    // the open system: grows by adding

const tokens = open.defineTokens({ /* … */ })  // see §2

export const ds = open
  .addTokens(tokens)
  .addConditions({ wide: media({ width: { '>=': '48rem' } }) })
  .consolidate({ prefix: 'app', root: ':root' }) // the locked system: what styles use
```

`prefix` names every emitted custom property (`--app-color-ink`) and the cascade layers; `root` is the selector that owns token declarations. The module may also export values taken from `ds` (`export const { t } = ds`), but nothing unrelated (`VANITY_APP_EXPORT_IN_SYSTEM_MODULE`). Larger systems split token modules into sibling files (`palette.tokens.ts`) and compose them here.

## 2. Tokens: primitives, roles, bundles

Organize in tiers and name each token for what it is *for*:

```ts
const px = (value: number) => open.length.rem(value / 16)   // author on the 4px rhythm, emit rem

const tokens = open.defineTokens({
  // primitives: the raw scale (components should not reach for these directly)
  step: { px4: px(4), px8: px(8), px12: px(12), px16: px(16), px24: px(24), px32: px(32) },
  stroke: {
    /** Dividers and quiet outlines. */
    hairline: open.length.px(1),
    /** Focus rings and emphasis. */
    thick: open.length.px(2),
  },
})
  .add(m => ({
    // semantic roles: what components use, pointing at primitives
    space: { xs: m.step.px8, sm: m.step.px12, md: m.step.px16, lg: m.step.px24 },
    radius: { sm: m.step.px4, md: m.step.px8 },
    // bundles: groups whose leaves are CSS property names; styles spread them with `$dec`
    text: {
      body: { fontSize: m.step.px16, lineHeight: m.step.px24 },
      label: { fontSize: px(13), lineHeight: m.step.px16, fontWeight: 600 },
    },
  }))
```

- **Use typed constructors for values**: `open.oklch(…)`, `open.color('#635bff')`, `open.length.rem(1)`, `open.length.px(1)`, `open.time.ms(150)`, `open.percent(50)`. A raw string (`'1rem'`, `'#fff'`) becomes an `unknown`-typed token: it still emits, but it loses type information that tools (DTCG export, `explain`, future checks) rely on. Strings are fine for values without a typed constructor (font stacks, easing curves, shadows).
- **Doc comments on tokens** (`/** … */`) show up in editor hovers and `explain()` output: they are how agents and designers learn what a role is for. Write one for every role whose name alone could be misread.
- **Bundles** (groups of CSS properties) carry composite decisions: type roles, and composite edges such as `edge: { hairline: { border: `${m.stroke.hairline} solid ${m.color.border}` } }` → `...t.edge.hairline.$dec`. Each leaf stays an individually addressable token.
- **Derivation**: `.add(m => ({ … }))` is a method of the token module (`open.defineTokens(…)`), not of the system: derive inside the module, then pass the module to `addTokens`. The callback sees everything added before it, at the same paths as `t` (`m.color.hue`). Split a dependency into two `.add` calls when a token needs a sibling defined in the same batch. Declare axes on the open system *before* defining tokens that vary on them, so `axes: { … }` knows their modes.
- `.add('name', value)` adds one top-level token; `.add('name', m => value)` derives it.
- `.add(m => ({ color: { accentSoft: … } }))` merges into the existing `color` group: groups merge by path, but every token name is defined exactly once. To turn an existing literal token into a derived one, delete it from the literal and define it in the `.add` that derives it.
- **Helpers** that build token values (a `tone()` or `px()` function) type their parameters with Vanity's input types: `VanityColorish` for colors, `VanityCssInput<'length'>` for lengths (both from `@mszr/vanity`).
- Add a **role** when components need one; resist component-specific tokens (`buttonPrimaryBg`) unless a value truly belongs to one component — those usually want a recipe variant instead.
- Roles most interfaces end up needing (add them when the first component asks): status families (`success`, `warning`, `danger`, `info`, each with `*Soft` and `on*`), `opacity.disabled`, `size.icon`, a control-height scale, motion durations including a slow/continuous one, and z-index layers (`layer.overlay`, `layer.modal`).

## 3. Token traits with `tdef`

A bare value is a token. Wrap it in `open.tdef({ … })` only when you add a trait:

```ts
open.tdef({ val: open.length.px(12), mutable: true, description: 'Corner seed; the radius scale derives from it.' })
open.tdef({ val: 265, mutable: true, register: true })            // registered: typed and animatable
open.tdef({ val: open.length.rem(1), axes: { density: { compact: open.length.rem(0.75) } } })
open.tdef.color()                                                // a typed reservation, filled per mode later
```

| Trait | Meaning |
| --- | --- |
| `mutable: true` | the runtime may `$set` it live (accent hue, radius seed, font) |
| `register: true` | emits `@property` so the browser types/animates it (pairs well with `mutable`) |
| `axes: { axis: { mode: value } }` | per-mode values on a declared axis (§5) |
| `description` | documentation for hovers and `explain` |

Gotchas the types don't fully explain:

- `open.tdef({ val: x })` with **only** `val` is rejected as ceremony (the error reads "'val' does not exist") — write the bare value.
- In the builder's named form, pass the raw config, not a `tdef`: `.add('hue', { val: 265, mutable: true })`. `.add('hue', open.tdef({ … }))` type-checks but fails at consolidation with "remove the unnecessary tdef() wrapper".

## 4. Conditions

Named conditions become keys every style can use. Name them by meaning, so one edit moves every use:

```ts
import { container, media, selector, supports } from '@mszr/vanity'

open.addConditions({
  wide: media({ width: { '>=': '48rem' } }),
  roomy: media({ width: { '>=': '72rem' } }),
  panelWide: container('panel', { inlineSize: { '>=': '30rem' } }),
  open: '&[data-state="open"]',               // headless UI states (Reka, Ark set data-state)
  checked: '&[data-state="checked"]',
  selected: '&[data-selected]',
  invalid: '&[aria-invalid="true"]',
  pressed: selector('&:active').or('&[aria-pressed="true"]'),
  canHover: media('(hover: hover)'),
  hasBackdrop: supports('(backdrop-filter: blur(1px))'),
})
```

Built in, no registration needed: `hover`, `hoverFocus`, `active`, `focusVisible`, `disabled`, `motionOk`, `motionReduce`, `dark`, `light`, `ltr`, `rtl`. Conditions compose: `.and()`, `.or()`, `.not()`. Plain strings are real CSS selectors/queries; `&` is the styled element.

**Element states need `&`.** A selector without `&` matches descendants: `'[data-selected]'` as a condition styles children that carry the attribute, not the element. The `data()` and `aria()` helpers produce exactly that bare form, so use them for axis modes (§5), and write element states as `'&[…]'` strings. Condition names must not collide with CSS property names (`d`, `inset`, `content`…); consolidation rejects them.

## 5. Themes and modes

Pick the lightest mechanism that expresses the design:

| Need | Mechanism |
| --- | --- |
| colors that differ in light vs dark, following the OS/`color-scheme` | `open.lightDark(light, dark)` token values |
| an explicit light/dark switch the app controls (plus OS default) | `addAxis('scheme', colorSchemes())` |
| any other family of alternatives (density, contrast, motion, brand skin, seasonal theme) | `addAxis(name, { modes, default })` |
| a value the user tunes continuously (hue, radius, font size) | a `mutable` token + runtime |

```ts
import { colorSchemes, data } from '@mszr/vanity'

const open = createSystem()
  .addAxis('scheme', colorSchemes())
  .addAxis('density', {
    modes: { compact: data('density', 'compact'), comfortable: '&' },  // '&' = the default arm
    default: 'comfortable',
  })

const tokens = open.defineTokens({
  space: {
    md: open.tdef({ val: open.length.rem(1), axes: { density: { compact: open.length.rem(0.75) } } }),
  },
  color: {
    canvas: open.tdef({ val: open.oklch(0.99, 0.005, 265), axes: { scheme: { dark: open.oklch(0.16, 0.01, 265) } } }),
  },
})
```

Write activatable modes with helpers (`data('density', 'compact')`, `colorSchemes()`): a raw selector string mode can't be switched by the runtime. An axis takes effect only where tokens vary on it.

`lightDark()` tokens keep working when you add `colorSchemes()`: pinning the scheme sets `color-scheme` on the root, which is exactly what `lightDark()` follows. No need to rewrite them as per-mode values. The axis also declares `color-scheme: light dark` itself, so a base `:root { colorScheme: 'light dark' }` rule becomes redundant (harmless; remove it for clarity).

Token handles are valid anywhere a value is, including per-mode values: `open.tdef({ val: m.color.border, axes: { skin: { crisp: m.color.borderStrong } } })`. To add modes to an existing literal token, replace the literal with a `tdef` in place. Read `references/theming.md` for multi-axis themes, bulk per-mode values, skins, and scheme details.

## 6. Color

```ts
const palette = open.defineTokens()
  .add('hue', { val: 265, mutable: true, register: true, description: 'The brand hue, in degrees.' })
  .add('accent', m => open.oklch(0.58, 0.16, m.hue))
  .add(m => ({
    onAccent: open.legibleOn(m.accent),                       // black or white, whichever reads
    accentHover: open.oklch.darken(m.accent, 0.06),
    accentSoft: open.oklch.from(m.accent, { l: 0.95, c: 0.04 }),
    accentWash: open.alpha(m.accent, 0.12),
  }))
  .add(m => ({
    accentMuted: open.colorMix([m.accent, [m.accentSoft, 60]]).in('oklab'),
  }))
```

Author in OKLCH so lightness steps are perceptually even. Derive related colors from a seed instead of hand-picking each, and keep the seed's channels separate (a mutable `hue`) when users or a theme should re-tint everything. `references/color.md` covers derivation, contrast, and palettes.

`legibleOn(background)` picks black or white once, at build time, from the background's authored value, per scheme (a `lightDark()` background yields `light-dark(white, black)` as needed). For a **static** background it also **checks contrast**: the build fails when even the best pick is under APCA Lc 60, naming the scheme (and axis mode) and the measured contrast. Static covers literals, aliases of static tokens, and `alpha`/`lighten`/`darken`/`from`/`colorMix` over them. Two kinds of background currently skip the check without a warning: one that depends on a **mutable** token, and one whose **channels are tokens** (`oklch(0.6, 0.15, m.hue)`, even with an immutable hue). Both keep the authored-default pick; for a mutable seed that foreground stays fixed while the runtime moves the background. Verify those pairs as `references/color.md` shows, against the foreground the system actually uses. Fix the background's lightness; pass `{ contrast: n }` only as a deliberate, documented exception. Changing an existing role's color is a design decision: make the smallest change that passes and call it out in your summary. When a brief says "keep the current look", keep a hand-tuned `on*` pair that already reads well and doesn't depend on a live seed; switch to `legibleOn` when the background becomes derived or live.

## 7. Live values and the runtime

```ts
// app code (a composable), never a *.css.ts
const rt = ds.runtime()
rt.t.color.hue.$set(140)            // only mutable tokens have $set/$unset
rt.axes.density.$switchTo('compact') // only activatable modes are accepted
rt.t.color.hue.$unset()              // back to the authored value
```

The runtime writes private custom-property slots and data attributes on the root; it never regenerates CSS. Keep one controller per root and share it: a second `ds.runtime()` for the same root supersedes the first. Read `references/runtime.md` for settings panels, persistence, SSR without flash, and scoping to a subtree.

## 8. After changing the system

1. Typecheck — every component referencing a renamed/removed token fails at its use site; fix each one (rename tokens with your editor's rename on the definition key when possible; Vanity supports rename across modules).
2. Build — consolidation validates the whole system (duplicate names, invalid axis names, cycles).
3. Check that every theme/mode still reads well: open the app in each mode or inspect `ds.explain(ds.t.color.x)` for its per-mode declarations.
4. Summarize added/renamed roles in your reply so the designer knows the vocabulary moved.

Extending the system with plugins, custom constructors, consts, utilities, property aliases, or the Hail preset: `references/extending.md`.
