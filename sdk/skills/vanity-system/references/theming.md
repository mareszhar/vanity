# Themes, modes, and axes

An **axis** is a named family of alternatives (`scheme: light | dark`, `density: compact | comfortable | spacious`, `skin: paper | glass | terminal`). Tokens give per-mode values; components never branch on the mode. Adding a mode means filling in values, not editing components.

## Declaring axes

```ts
import { colorSchemes, createSystem, data } from '@mszr/vanity'

const open = createSystem()
  .addAxis('scheme', colorSchemes())
  .addAxis('density', {
    modes: {
      compact: data('density', 'compact'),
      comfortable: '&',                          // the unconditional arm
      spacious: data('density', 'spacious'),
    },
    default: 'comfortable',
    modeOrder: ['compact', 'comfortable', 'spacious'],   // optional: cycle/tie-break order
    description: 'Interface rhythm: spacing and control size.',
  })
  .addAxis('contrast', {
    modes: { standard: '&', high: data('contrast', 'high') },
    default: 'standard',
  })
```

- `data('density', 'compact')` lowers to the attribute `data-density="compact"` on the system root and carries the metadata the runtime needs to switch it. Use these helpers (or `colorSchemes()`) for any mode you want to switch at runtime; a raw selector string works in CSS but can't be activated.
- Pair a mode with a media query when the platform should choose it too, e.g. `high: data('contrast', 'high').or(media('(prefers-contrast: more)'))`.
- When two axes set the same token and both are active, the axis declared **later** wins (each axis emits into its own cascade layer, in declaration order). `consolidate({ axisOrder: [...] })` sets that order explicitly; within one axis, `modeOrder` breaks ties between overlapping modes.

## Per-mode token values

Three equivalent spellings; choose by readability.

```ts
const tokens = open.defineTokens({
  // 1. axes map on one token
  space: {
    md: open.tdef({
      val: open.length.rem(1),
      axes: { density: { compact: open.length.rem(0.75), spacious: open.length.rem(1.25) } },
    }),
  },
  // 2. a method named after the axis
  radius: {
    md: open.tdef({ val: open.length.px(8) }).density({ compact: open.length.px(6) }),
  },
  // 3. bulk: one function per axis across a whole group
  color: {
    canvas: open.tdef.color(),
    ink: open.tdef.color(),
    $axes: {
      scheme: mode => ({
        canvas: mode === 'dark' ? open.oklch(0.16, 0.01, 265) : open.oklch(0.99, 0.005, 265),
        ink: mode === 'dark' ? open.oklch(0.95, 0.01, 265) : open.oklch(0.2, 0.01, 265),
      }),
    },
  },
})
```

`val` is the unconditional fallback; a mode value overrides it while that mode is active. Modes you don't author inherit `val`. Tokens derived from per-mode tokens (`.add(m => …)`) follow automatically.

## Light and dark: `lightDark()` vs a scheme axis

- `open.lightDark(light, dark)` token values follow the element's used `color-scheme`. Declare `colorScheme: 'light dark'` on the root (base rules) and the OS decides. Simplest when the app never forces a scheme.
- `addAxis('scheme', colorSchemes())` adds an explicit switch: OS preference by default, `rt.axes.scheme.$switchTo('dark')` pins it (and keeps `color-scheme` in sync so `lightDark()` values agree). Use it when the app offers a light/dark/system control. Author scheme-varying colors with `axes: { scheme: { dark: … } }` or `$axes`.
- The built-in `dark`/`light` condition keys follow the same scheme logic; use them in styles only for non-color differences.

## Themes that change character ("skins")

A skin changes more than colors: radii, borders, shadows, type, motion. Model it as an axis whose modes cover every role that defines the character, so each skin is complete by construction:

```ts
const open = createSystem().addAxis('skin', {
  modes: { calm: '&', crisp: data('skin', 'crisp'), playful: data('skin', 'playful') },
  default: 'calm',
})

const character = open.defineTokens({
  radius: {
    control: open.tdef({ val: open.length.px(8), axes: { skin: { crisp: open.length.px(2), playful: open.length.px(999) } } }),
  },
  stroke: {
    edge: open.tdef({ val: open.length.px(1), axes: { skin: { crisp: open.length.px(1.5), playful: open.length.px(2) } } }),
  },
  shadow: {
    raised: open.tdef({
      val: '0 1px 2px oklch(0 0 0 / 0.06), 0 4px 12px oklch(0 0 0 / 0.08)',
      axes: { skin: { crisp: 'none', playful: '0 4px 0 oklch(0 0 0 / 0.9)' } },
    }),
  },
  ease: {
    standard: open.tdef({ val: 'cubic-bezier(0.2, 0, 0, 1)', axes: { skin: { playful: 'linear(0, 0.4 7.5%, 1.09 33%, 0.98 68%, 1)' } } }),
  },
  font: {
    display: open.tdef({ val: '"Inter", system-ui, sans-serif', axes: { skin: { crisp: '"IBM Plex Mono", ui-monospace, monospace' } } }),
  },
})
```

Skins only work as well as components' discipline: a component that hardcodes `border-radius: 8px` won't change. Combine axes freely (skin × scheme × density); when one token varies on several axes, Vanity emits the needed combinations.

## Scoping a theme to part of the page

A rooted token module emits under its own selector, so a widget can carry its own mode independently of the page:

```ts
const widget = open.defineTokens({ color: { accent: open.oklch(0.6, 0.15, 30) } }).root('#checkout')
```

At runtime, `ds.runtime({ within: element })` targets the declared root found inside `element`, such as one of several repeated widgets; it doesn't make an arbitrary subtree a root (see `runtime.md`).
