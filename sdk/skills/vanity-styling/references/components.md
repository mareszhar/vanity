# Components: recipes, anatomy, published ports, atoms

## Recipe — one element, finite choices

```ts
const pad = port(t.space.md) // optional: a themeable input, published below
const enabledHover = '&:hover:not(:disabled, [aria-disabled="true"])' // or a named system condition

export const button = recipe({
  ports: { pad },
  base: {
    ...t.text.label.$dec,
    display: 'inline-flex',
    alignItems: 'center',
    gap: t.space.xs,
    minBlockSize: t.size.control,
    paddingInline: pad,
    border: `${t.stroke.hairline} solid transparent`,
    borderRadius: t.radius.md,
    cursor: 'pointer',
    transition: `background-color ${t.duration.quick} ${t.ease.standard}`,
    focusVisible: { outline: `${t.stroke.thick} solid ${t.color.accent}`, outlineOffset: t.stroke.thick },
    disabled: { opacity: 0.5, cursor: 'not-allowed' },
  },
  variants: {
    intent: {
      primary: { background: t.color.accent, color: t.color.onAccent },
      secondary: { background: t.color.surface, color: t.color.ink, borderColor: t.color.border, [enabledHover]: { borderColor: t.color.borderStrong } },
      quiet: { background: 'transparent', color: t.color.inkMuted, [enabledHover]: { background: t.color.surfaceHover, color: t.color.ink } },
    },
    size: {
      sm: { ...t.text.caption.$dec, minBlockSize: t.size.controlSm, ...pad.dec(t.space.xs) },
      md: {},
    },
  },
  toggles: {
    block: { inlineSize: '100%', justifyContent: 'center' },
  },
  compound: [
    { when: { intent: 'quiet', size: 'sm' }, style: { paddingInline: t.space['2xs'] } },
    { when: { block: true, size: 'sm' }, style: { minBlockSize: t.size.control } },   // toggles take booleans
  ],
  defaults: { intent: 'secondary', size: 'md' },
})
```

- `variants` are mutually exclusive choices; `toggles` are independent booleans; `compound` styles a combination; `defaults` apply when a prop is absent.
- Every arm accepts the full styling input: conditions, selectors (including interpolated handles of other classes), arrays, fragments, `tdec`, ports.
- Output order is base → variants → toggles → compound, all in one layer, so at equal specificity a toggle overrides a variant and a compound overrides both. Put state overrides that must win in the later group. Condition keys keep their selector's specificity: `disabled` compiles to `:disabled`, which outranks a plain toggle class, so a `loading` toggle that cancels the disabled look restates it under the same condition: `loading: { disabled: { opacity: 1 } }`.
- An empty arm (`md: {}`) is how you say "the base already is this choice".
- `button(props)` returns the class string. It accepts a wider object (extra props are ignored), but an inline literal with a typo (`button({ intnet: 'quiet' })`) is a type error.
- Prefer variants named by intent (`primary`, `danger`, `quiet`) over appearance (`blue`, `bordered`); the system's job is to decide what "danger" looks like.

### In a Vue component

```vue
<template lang="pug">
button(:class="s.button(props)" :type="type" :disabled="disabled")
  slot
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import * as s from './UiButton.css.ts'

const props = defineProps({
  ...propsOf(s.button),
  disabled: Boolean,
  type: { type: String as PropType<'button' | 'submit' | 'reset'>, default: 'button' },
})
</script>
```

`propsOf(recipe)` turns the variants into runtime Vue props (literal unions; toggles become `Boolean`), so the props can never drift from the styles. Vue's `defineProps<T>()` type-only form can't see a recipe's inferred type — use the object form with the spread. `propsOf`, `useAnatomy`, and `usePorts` are auto-imported when `autoImports.app` includes `'vue'`; otherwise import them from `@mszr/vanity/vue`.

Two recipes on one component: `defineProps(propsOf.group({ button, icon }))` produces namespaced props (`button-intent`, `icon-size`). A recipe that styles an inner element works the same way: spread its `propsOf` and call it with `props`; unrelated props are ignored.

A loading or busy state is usually a toggle (`loading: { … }`) that hides the label with `visibility: 'hidden'` (keeping the button's width) and reveals an absolutely centered spinner; see `patterns.md`.

Variant tables keyed by a token group: `variants: { tone: fromTokenGroup(t.status, color => ({ background: color })) }` (import `fromTokenGroup` from `@mszr/vanity`) — the variant names follow the token names.

## Anatomy — several parts styled as one unit

```ts
export const disclosure = anatomy({
  parts: ['root', 'trigger', 'icon', 'panel'],
  base: {
    root: { display: 'grid', gap: t.space.xs },
    trigger: {
      'display': 'flex',
      'justifyContent': 'space-between',
      'color': t.color.ink,
      'root:open': { color: t.color.accent },
    },
    icon: {
      'transition': `rotate ${t.duration.base} ${t.ease.standard}`,
      'root:open': { rotate: '180deg' },
    },
    panel: { 'display': 'none', 'root:open': { display: 'block' } },
  },
  variants: {
    size: {
      sm: { panel: { padding: t.space.xs } },
      md: { panel: { padding: t.space.md } },
    },
  },
  defaults: { size: 'md' },
})
```

```vue
<template lang="pug">
div(:class="d.root" :data-state="open ? 'open' : 'closed'")
  button(:class="d.trigger" @click="open = !open")
    slot(name="title")
    span(:class="d.icon") ▾
  div(:class="d.panel")
    slot
</template>

<script setup lang="ts">
import * as s from './UiDisclosure.css.ts'

const props = defineProps(propsOf(s.disclosure))
const d = useAnatomy(s.disclosure, props)
const open = ref(false)
</script>
```

- `'root:open'` means "when the `root` part matches the `open` condition" — it compiles to an ancestor-state selector, so one `data-state` on the root drives every part. Any declared part and any element-state condition work (`'trigger:hover'`, `'root:checked'`).
- A part's own states use ordinary keys inside that part (`trigger: { hover: {…}, focusVisible: {…}, '&[aria-selected="true"]': {…} }`).
- `useAnatomy(anatomy, props)` returns a reactive record of part classes (`d.panel`). Calling `s.disclosure(props)` directly in `<script setup>` evaluates once and goes stale.
- `propsOf(anatomy)` works like it does for recipes (spread it and add your own props; unrelated props are ignored), variant arms are keyed by part and override that part's base like recipe arms, and `ports: { … }` publishes a port on an anatomy exactly as on a recipe.
- Headless libraries (Reka UI, Ark) already set `data-state`/`data-*` attributes; style those through the system's named conditions.

## Published ports — a component's public styling inputs

A port declared in a style module and listed under `ports:` becomes part of the component's contract. A parent can retune it through the cascade without knowing the component's internals:

```ts
// Toolbar.css.ts
import { button } from '../UiButton/UiButton.css.ts'

export const toolbar = cls({
  display: 'flex',
  gap: t.space.xs,
  ...button.ports.pad.dec(t.space.sm), // every button inside gets tighter padding
})
```

## Atoms — a bounded utility vocabulary (rarely the right tool)

```ts
export const box = ds.atoms({
  properties: { display: ['flex', 'grid', 'none'], gap: t.space, padding: t.space },
  shorthands: { p: 'padding' },
  toggles: { column: { flexDirection: 'column' } },
  conditions: ['wide'],
})
// template: :class="s.box({ display: 'flex', gap: 'sm', column: true, p: { base: 'xs', wide: 'md' } })"
```

Atoms pre-generate one class per declared value × condition and only accept declared token keys. Reach for them only for layout primitives used with many combinations; a named class or recipe reads better almost everywhere else.

## Choosing between them

- Same element, different looks → recipe.
- Different elements that change together → anatomy.
- Two components that look similar → share a fragment function or a recipe; don't copy declarations.
- A component variant that only one page uses → keep it local to that page's style module until a second use appears.
