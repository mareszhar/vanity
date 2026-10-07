# Values that change

Pick the mechanism by **who owns the value** and **how many values are possible**. Getting this right keeps CSS static, SSR flash-free, and the design system in charge.

| The value… | Mechanism | Example |
| --- | --- | --- |
| is one of a few designed choices for a component | recipe variant / toggle | `intent: 'danger'`, `size: 'sm'`, `pill: true` |
| reflects DOM/UI state | condition key + attribute in the template | `open`, `checked`, `selected`, `invalid`, `disabled`, `hover` |
| is continuous and per instance | **port** | progress fraction, a measured height, a drag offset, one tag's user-picked color |
| re-points design tokens for a subtree, fixed at build time | `ds.tdec.propagated({ … })` in a class | an inverted card, a danger zone |
| is a system-wide design decision changed live | **mutable token** via the runtime (see `vanity-system`) | accent hue, corner roundness, font family |
| is one of a few named system-wide alternatives | **axis** via the runtime (see `vanity-system`) | light/dark, density, contrast, theme skin |

## Ports

```ts
// Meter.css.ts
export const level = port(0)                                   // number port
export const tint = port(t.color.accent)                       // color port, defaults to a token
export const angle = port(ds.angle.deg(0))                     // angle port: units come from the default

export const bar = cls({
  inlineSize: ds.calc(level).multiply(ds.percent(100)),
  background: tint,
  rotate: angle,
})
```

```vue
<template lang="pug">
div(:class="s.bar" :style="barStyle")
</template>

<script setup lang="ts">
import * as s from './Meter.css.ts'

const props = defineProps<{ value: number, color?: string }>()
const barStyle = usePorts(() => [
  s.level.dec(props.value),
  props.color ? s.tint.dec(props.color) : undefined, // false/null/undefined entries are skipped
])
</script>
```

- The default fixes the port's CSS type; `dec()` accepts values of that type (numbers for a number port, colors or color tokens for a color port, …).
- The emitted CSS is complete without JavaScript: the class reads `var(--port, <default>)`.
- `port.dec(value)` is plain style data. You can spread it into another class at build time (`...level.dec(0.5)`) or bind it at runtime with `usePorts`.
- In non-Vue code, `ports(a.dec(x), b.dec(y))` merges fragments into one style object.

## Mutable tokens vs ports

Both write custom properties; they differ in ownership. A **mutable token** is the system's decision, set once at a root and inherited everywhere ("the brand hue is 140"). A **port** belongs to one component instance ("this bar is 62% full"). If a settings panel or a user preference changes it, it's a mutable token or axis. If a prop or a measurement changes it, it's a port.

## `tdec` — re-pointing tokens for a subtree

```ts
export const dangerZone = cls({
  ...ds.tdec.propagated({
    color: {
      accent: t.color.danger,       // every role derived from accent follows inside the zone…
      onAccent: t.color.onDanger,   // …except one you name, which is used as given
    },
  }),
  padding: t.space.md,
  border: `${t.stroke.hairline} solid ${t.color.danger}`,
})
```

Everything inside that styles itself with these roles now renders in the danger family, without touching any component.

A derived token (`accentSoft = oklch.from(accent, …)`) is computed where the system declares it, on the root, and descendants inherit the finished value, so declaring only `accent` lower in the tree doesn't change it. `ds.tdec.propagated({ … })` also declares every dependent the change reaches, whether folded at build time or live (`var()`-based), so they re-derive inside the subtree. Name a dependent yourself when the system already designs its counterpart (`accentSoft: t.color.dangerSoft`) and you want that instead of the derived value.

If a dependent varies across modes, cases, or axis intersections that one declaration can't reproduce (or is a mutable token), `propagated` stops with `VANITY_TOKENS_INVALID_OVERRIDE` and names it; add that token to the call with the value you want, or design the variation as an axis. Putting the fragment inside a condition doesn't bypass the check. Non-emitted intermediates participate in derivation but aren't published. A dependent registered with `inherits: false` also gets a diagnostic: enable inheritance or declare it directly on each consuming element. Element-local `light-dark()` can retain its scheme selection; a root-local scheme must not silently become subtree-local.

Plain `ds.tdec({ … })` declares exactly the tokens you list and nothing else. Use it only when the dependents should keep their root values.

## States from the DOM

```vue
<template lang="pug">
li(:class="s.option" :data-selected="selected || undefined" :aria-disabled="disabled")
</template>
```

```ts
export const option = cls({
  'color': t.color.ink,
  'selected': { background: t.color.accentSoft },           // named condition '&[data-selected]'
  '&[aria-disabled="true"]': { color: t.color.inkFaint }, // one-off state without a name
})
```

Bind `undefined` (not `false`) to remove a boolean data attribute, since `data-selected="false"` still matches `[data-selected]`.
