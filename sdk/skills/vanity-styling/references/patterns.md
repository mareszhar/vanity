# Patterns

Ready-made shapes for common interface details. Each uses role tokens; rename to your system's roles. If the project's authoring barrel already exports helpers like these, use those instead of redefining them.

## Reusable fragments (mixins)

A mixin is a plain function returning `fragment(…)` (or `ds.fragment(…)`). Put shared ones in one module and import them; they compose inside arrays and spreads.

```ts
// design/mixins.ts
import type { VanityColorish } from '@mszr/vanity'
import { ds } from './system.ts'

// Type parameters with Vanity's input types: a default of `ds.t.color.accent`
// alone would narrow the parameter to that one token and reject `t.color.danger`.
export function focusRing(color: VanityColorish = ds.t.color.accent) {
  return ds.fragment({
    focusVisible: {
      outline: `${ds.t.stroke.thick} solid ${color}`,
      outlineOffset: ds.t.stroke.thick,
    },
  })
}

export function visuallyHidden() {
  return ds.fragment({
    position: 'absolute',
    inlineSize: '1px',
    blockSize: '1px',
    margin: '-1px',
    padding: 0,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    border: 0,
  })
}

export function truncate(lines = 1) {
  return lines === 1
    ? ds.fragment({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minInlineSize: 0 })
    : ds.fragment({ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' })
}
```

Structural values like `1px` inside `visuallyHidden` are mechanics, not design decisions; raw values are right there.

## Layout primitives

```ts
// A vertical stack with consistent rhythm
export const stack = cls({ display: 'grid', alignContent: 'start', gap: t.space.md })

// A wrapping cluster of chips/buttons
export const cluster = cls({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: t.space.xs })

// A responsive card grid without breakpoints (t.size.cardMin: the narrowest a card may get)
export const grid = cls({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(min(${t.size.cardMin}, 100%), 1fr))`,
  gap: t.space.md,
})

// Sidebar + content that stacks on narrow viewports
export const shell = cls({
  display: 'grid',
  gap: t.space.lg,
  wide: { gridTemplateColumns: `${t.size.sidebar} minmax(0, 1fr)` },
})

// A readable text column
export const prose = cls({ ...t.text.body.$dec, maxInlineSize: t.size.measure, textWrap: 'pretty' })
```

Layout widths such as a sidebar or a card's minimum are design decisions: give them `size` roles in the system (add them if missing) instead of writing `16rem` in a component. `minmax(0, 1fr)` and `minInlineSize: 0` let content columns shrink instead of overflowing. `grid.repeat()` and `grid.minmax()` from `@mszr/vanity` build the same values when an argument is a token.

## Container-responsive components

```ts
export const panel = cls({ containerType: 'inline-size', containerName: 'panel' })

export const panelBody = cls({
  'display': 'grid',
  'gap': t.space.sm,
  '@container panel (inline-size >= 30rem)': { gridTemplateColumns: '1fr 1fr' },
})
```

If the system defines a named container condition (`container('panel', { inlineSize: { '>=': '30rem' } })`), use its name as the key instead.

## Interaction and motion

```ts
export const row = cls({
  transition: `background-color ${t.duration.quick} ${t.ease.standard}`,
  hover: { background: t.color.surfaceHover },
  active: { background: t.color.surfaceHover, scale: '0.99' },
  motionReduce: { transition: 'none' },
})

const rise = keyframes({
  from: { opacity: 0, translate: `0 ${t.space.xs}` },
  to: { opacity: 1, translate: '0 0' },
})

export const popover = cls({
  zIndex: t.layer.overlay,
  background: t.color.surface,
  boxShadow: t.shadow.overlay,
  borderRadius: t.radius.md,
  open: { motionOk: { animation: `${rise} ${t.duration.base} ${t.ease.emphasized}` } },
})
```

Animate `opacity`, `translate`, `scale`, and `rotate`; avoid animating layout properties (`width`, `top`, `margin`) except for deliberate size transitions such as a progress fill.

Pick the entrance mechanism by how the element appears:

- Mounted when it opens (`v-if`, `Teleport`): put the animation on its base class (`motionOk: { animation: … }`) or use `'@starting-style'`; it runs on insertion.
- Always mounted, toggled by state (`data-state="open"`): animate under the state condition (`open: { motionOk: { animation: … } }`), as in the popover above.

Enter animations for elements that appear without a keyframe (CSS `@starting-style`):

```ts
export const toast = cls({
  motionOk: {
    'transition': `opacity ${t.duration.base} ${t.ease.standard}, translate ${t.duration.base} ${t.ease.standard}`,
    '@starting-style': { opacity: 0, translate: `0 ${t.space.sm}` },
  },
})
```

Without the guard, the element would still slide in for people who asked for reduced motion.

## Overlays: dialogs, sheets, popovers

- Structure as an anatomy (`backdrop`, `panel`, `title`, `body`, `actions`) so a tone or size variant reaches every part.
- The backdrop uses the system's scrim role (`t.color.scrim`); stacking uses its layer roles (`zIndex: t.layer.modal`), never ad-hoc numbers.
- Mount it with `Teleport` + `v-if` and animate entry on the parts' base classes under `motionOk`.
- For an exit animation, wrap it in Vue's `<Transition>` and hand it Vanity classes: `Transition(:enter-from-class="s.hidden" :leave-to-class="s.hidden" :enter-active-class="s.fading" :leave-active-class="s.fading")`, where `hidden` and `fading` are ordinary `cls()` exports.
- Behavior isn't styling, but it's part of the craft: focus the first safe action on open, trap Tab inside, close on Escape and on a backdrop press that both starts and ends on the backdrop, and restore focus on close.

## Loading and busy states

Keep the control's size, hide the label visually, and overlay a spinner. Hide the label with `opacity: 0`, not `visibility: hidden` or `display: none`: those remove it from the accessibility tree and leave an unnamed button. The spinner is decoration, so hide it from assistive technology (`aria-hidden="true"`) and let `aria-busy="true"` on the control announce the state.

```ts
const spin = keyframes({ from: { rotate: '0turn' }, to: { rotate: '1turn' } })

export const label = cls({ gridArea: '1 / 1' })

export const spinner = cls({
  display: 'none',
  gridArea: '1 / 1',
  inlineSize: t.size.icon,
  blockSize: t.size.icon,
  border: `${t.stroke.thick} solid currentColor`,
  borderInlineEndColor: 'transparent',
  borderRadius: t.radius.round,
  motionOk: { animation: `${spin} ${t.duration.spin} linear infinite` },
})

export const button = recipe({
  base: { position: 'relative', display: 'inline-grid', placeItems: 'center' /* … */ },
  toggles: {
    loading: {
      cursor: 'progress',
      [`& .${label}`]: { opacity: 0 },
      [`& .${spinner}`]: { display: 'block' },
    },
  },
})
```

In the template, bind the state and its accessibility attributes together:

```pug
button(:class="s.button(props)" :aria-busy="loading || undefined" :disabled="disabled || loading")
  span(:class="s.label")
    slot
  span(:class="s.spinner" aria-hidden="true")
```

An icon-only button keeps an explicit `aria-label`, since it has no visible label to fall back on.

Classes referenced inside another style must be declared above it (module code runs top to bottom). Under reduced motion the ring stays visible but still; that remains a clear busy signal. If the system has no icon size or spin duration, add those roles rather than multiplying an unrelated token.

## Status colors

Status is a family of roles in the system (`success`, `warning`, `danger`, `info`, each with `*Soft` backgrounds and `on*` text). Map a component's status onto them with a variant or a state condition, never with raw colors:

```ts
export const item = recipe({
  base: { borderInlineStart: `${t.stroke.thick} solid ${t.color.accent}` },
  variants: {
    status: {
      uploading: {},
      done: { borderInlineStartColor: t.color.success },
      failed: { borderInlineStartColor: t.color.danger },
    },
  },
  defaults: { status: 'uploading' },
})
```

## Scheme-specific tweaks

Colors that differ between light and dark belong in tokens (`lightDark()` or a scheme axis in the system), so components never branch on the scheme. Use the `dark` / `light` condition keys only for non-color differences, such as dropping a shadow in dark mode:

```ts
export const sheet = cls({ boxShadow: t.shadow.raised, dark: { boxShadow: 'none' } })
```

## Focus, targets, and accessibility

- Visible focus on every interactive element (`focusRing()`).
- Minimum hit area: `minBlockSize: t.size.control` (or `minInlineSize`/`minBlockSize` of at least 24px for icon buttons).
- Text on colored fills uses the system's paired `on*` role (`t.color.onAccent`), never a guess; the system skill covers how those pairs are checked.
- Don't hide content from assistive tech with `display: none` when it should only be visually hidden; use `visuallyHidden()`.

## Global and document styles

```ts
// design/base.css.ts — imported once by the app shell
rules({
  ':root': { colorScheme: 'light dark' },
  '*, *::before, *::after': { boxSizing: 'border-box' },
  'body': { ...t.text.body.$dec, margin: 0, color: t.color.ink, background: t.color.canvas, fontFamily: t.font.sans },
  ':focus:not(:focus-visible)': { outline: 'none' },
})
```

Keep document rules in one base module. Component styles never target tags globally.
