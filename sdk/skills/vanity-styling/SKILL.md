---
name: vanity-styling
description: Style UI in a project that uses Vanity (@mszr/vanity) — writing or editing `*.css.ts` style modules and the Vue/Nuxt components that consume them. Use this whenever you create or restyle a component, page, layout, or state (hover, open, selected, responsive, dark), add variants, animate something, or bind a dynamic value to CSS in a repo with `vanity.config.ts`, `*.css.ts` files, or `@mszr/vanity` in package.json — even if the request never says "Vanity" and just says "make the card look like…", "add a danger button", or "tweak the spacing".
---

# Styling with Vanity

Vanity is a design-system engine for CSS written in TypeScript. A project defines one **design system** (tokens, conditions, themes) in a plain `system.ts`. Components style themselves in `*.css.ts` **style modules**, which run at build time and emit ordinary CSS. The component imports the generated class names.

Your job when styling is to express the design through the system's vocabulary, so the product stays consistent and stays re-themeable. A raw `13px` or `#e5e5e5` renders fine today, but it's a place no theme, density mode, or palette change can ever reach — and a declarations policy can report it. Tokens are the point.

## 1. Orient before writing (2 minutes, every time)

1. Open `vanity.config.ts`:
   - `compiler.system` → the system file. **Read it.** It is the complete vocabulary: token groups (`t.color.*`, `t.space.*`, `t.text.*`…), their doc comments, and the named conditions (`wide`, `open`, …).
   - `autoImports.shared` or `autoImports.style` → the **authoring barrel**. Every name it exports (`cls`, `t`, `recipe`, `port`, …) is available in `*.css.ts` without importing. It always exports `ds` too, so anything the barrel doesn't destructure is one dot away: `ds.calc`, `ds.percent`, `ds.alpha`, `ds.tdec`, `ds.inLayer`. If there is no barrel, `import { ds } from '<system file>'` and use `ds.class`, `ds.t`, `ds.recipe`.
2. Skim one or two existing `*.css.ts` files to match local conventions (file placement, naming, shared helpers such as a `focusRing()` fragment).
3. If the repo has a styling conventions doc (often referenced from `AGENTS.md` or the harness's project instructions), follow it; it outranks this skill on project taste.

Style modules live next to the component they style (`UiCard/UiCard.css.ts`) or wherever the project's convention says. Never put one under Nuxt's `pages/` directory: Nuxt turns `.ts` files there into routes. Page-level styles go in a component or a styles folder.

Changing the system itself (new tokens, themes, axes, live/runtime values) is the `vanity-system` skill. Wiring Vanity into a project is `vanity-setup`.

## 2. The shape of a style module

```ts
// components/UiCard/UiCard.css.ts — names come from the authoring barrel
export const card = cls({
  display: 'grid',
  gap: t.space.sm,
  padding: t.space.md,
  background: t.color.surface,
  border: `${t.stroke.hairline} solid ${t.color.border}`,
  borderRadius: t.radius.lg,
  hover: { borderColor: t.color.borderStrong },
  wide: { padding: t.space.lg },
})
```

```vue
<template lang="pug">
article(:class="s.card")
  slot
</template>

<script setup lang="ts">
import * as s from './UiCard.css.ts'
</script>
```

- Import the module normally for its class and recipe exports. `?inline` returns its compiled CSS as a default string; `?url` returns a stylesheet URL; `?raw` returns authored source. Both `./Card.css` and `./Card.css.ts` imports support Nuxt production SSR styles.
- A style module runs **at build time in Node**. Each export becomes a class string or a typed handle the component imports. Keep app logic, DOM access, and fetches out of it.
- Property names are CSS's camelCase names. Values are CSS strings/numbers or **token handles** (`t.color.ink` emits `var(--app-color-ink)`); handles interpolate inside strings too.
- JavaScript numbers use the same property unit rule in classes, recipes, anatomy, rules, fragments, keyframes and atoms: numeric `padding: 1` emits `1px`, while the string `'1'` is invalid padding. Custom-property and token/port numeric defaults stay numbers, so use a length constructor when a default means a length.
- Keys that are not properties are **conditions** (`hover`, `wide`, `open`), **selectors** (any key containing `&`, or starting with `.`, `:`, `[`, `>`, `+`, `~`), or **at-rules** (`'@media …'`, `'@supports …'`, `'@container …'`, `'@starting-style'`). They nest freely (`open: { motionOk: { … } }`), and they work the same inside every recipe/anatomy arm.
- `&` is the element being styled — the class this call (or this recipe arm, or this anatomy part) generates, so `'& + &'` means "this element right after another one like it". A selector key **without** `&` targets descendants: `'[aria-selected="true"]'` styles children, `'&[aria-selected="true"]'` styles the element itself. Pseudo-elements work the same way: `'&::before'`, `'&::-webkit-slider-thumb'`.
- A registered bare `data()`/`aria()` condition targets descendants too. `data('selected').self` or `aria('expanded', 'true').self` explicitly targets the styled element. Follow `VANITY_CONDITION_DESCENDANT` by choosing `.self` or confirming that descendants are intended.
- Token paths follow the system's groups: `t.color.accent`, `t.text.body`. Names that aren't valid identifiers need brackets: `t.space['2xs']`.
- Combine classes in templates with arrays: `:class="[s.row, isActive && s.rowActive]"` — but if you are toggling look-alike modifier classes, you want a recipe (§4).

## 3. Translating CSS habits

| In CSS you'd write | In Vanity |
| --- | --- |
| `.card { … }` | `export const card = cls({ … })` |
| `#fff`, `16px`, `150ms`, `cubic-bezier(…)`, `999px` | the role token: `t.color.surface`, `t.space.md`, `t.duration.quick`, `t.ease.standard`, `t.radius.round` |
| `var(--app-color-ink)` | `t.color.ink` — never hand-build custom-property names |
| `border: 1px solid #ddd` | `` `${t.stroke.hairline} solid ${t.color.border}` `` (or a bundle such as `...t.edge.hairline.$dec` if the system has one) |
| `font-size` + `line-height` + `font-weight` | `...t.text.body.$dec` (a type-role bundle; override one property after the spread if needed) |
| `.card:hover`, `:focus-visible`, `:active`, `:disabled` | built-in condition keys: `hover`, `focusVisible`, `active`, `disabled` (also `hoverFocus`, `dark`, `light`, `motionOk`, `motionReduce`, `ltr`, `rtl`) |
| `@media (min-width: 48rem)` | the system's named condition key (`wide: { … }`); write `'@media (…)': { … }` only for a one-off query the system doesn't name |
| `@container card (inline-size >= 30rem)` | a named container condition (add one with `container()` in the system, see `vanity-system` §4); the name must match the `containerName` an **ancestor** sets — it isn't type-checked — and the threshold measures that ancestor's content box. The ancestor sets `containerType: 'inline-size'` and `containerName` (a container query can't restyle the container element itself, so wrap the component's content when the component should respond to its own width) |
| `[data-state="open"]`, `[aria-selected="true"]` on the element | the system's named state conditions (`open`, `checked`, `selected`, `invalid`); otherwise register `aria('selected', 'true').self` in the system, or use a raw selector key `'&[aria-selected="true"]'`. Drive state from ARIA attributes when the semantics exist (`aria-selected`, `aria-expanded`, `aria-pressed`, `aria-current`, `aria-invalid`) so styling and accessibility can't disagree |
| `:hover` that shouldn't fire on disabled controls | `'&:hover:not(:disabled, [aria-disabled="true"])': { … }` (or the system's named condition for it, if one exists) |
| `.card > img`, `.item + .item`, `.card:has(img)` | selector keys `'& > img'`, `'& + &'`, `'&:has(> img)'` |
| `.toolbar .button` (another module's class) | import its handle and interpolate: `` [`& .${button}`]: { … } `` |
| `.btn--primary`, `.btn--sm` | a **recipe** with variants (§4) |
| `style="--progress: 0.4"` / `v-bind()` in `<style>` | a **port** + `usePorts` (§5) |
| `:root { --accent: red }` inside one subtree | `...ds.tdec.propagated({ color: { accent: t.color.danger } })` — re-points accent and re-derives its emitted dependents; resolve any mode/runtime/inheritance diagnostic (`references/dynamic-values.md`) |
| `@keyframes fade { … }` | `const fade = keyframes({ from: {…}, to: {…} })`, then `` animation: `${fade} ${t.duration.base} ${t.ease.standard}` `` |
| `@font-face` | `fontFace({ src, fontWeight, fontDisplay }, 'Family')` returns the family name to use |
| global `html, body, *` rules | `rules({ 'html': {…}, '*, *::before, *::after': {…} })` in the base style module |
| `!important` to win a fight | between Vanity styles, place the rule in a later layer: `ds.inLayer('overrides').class({ … })`. Against unlayered third-party CSS no layer wins; move that CSS into a lower layer instead (see `references/troubleshooting.md`) |
| `margin-left`, `width`, `top` | logical properties: `marginInlineStart`, `inlineSize`, `insetBlockStart` |
| `calc(var(--space-md) * 2)`, `calc(-1 * var(--stroke))`, `clamp(…)` | typed math over tokens: `ds.calc(t.space.md).multiply(2)`, `ds.calc(t.stroke.thick).negate()`, `.add(x)`, `.subtract(x)`, `.divide(n)`, `ds.min(a, b)`, `ds.max(a, b)`, `ds.clamp(min, preferred, max)` |
| `opacity: 0.5` for disabled, other repeated state values | the system's role if it has one (`t.opacity.disabled`); if the same raw value appears in several components, propose the role (`vanity-system`) |
| CSS Vanity doesn't model yet | a raw selector/at-rule key first; `raw('…css…')` as the last resort |

Flat objects merge with spread. To combine pieces that carry conditions or nested rules, pass an **array** — it keeps every contribution in order instead of letting a later `hover: {}` overwrite an earlier one:

```ts
export const row = cls([
  { display: 'flex', alignItems: 'center', gap: t.space.sm },
  focusRing(),            // a fragment with its own focusVisible arm
  { wide: { gap: t.space.md } },
])
```

Anchor pseudo keys to the styled element: write `'&::before'` and `'&:hover'`. Bare `'::before'` and `':hover'` match descendants and warn with `VANITY_SELECTOR_UNANCHORED`; silence `unanchoredSelectors` only when descendants are intended.

A property can also branch per condition: `color: { base: t.color.inkMuted, hover: t.color.ink }`.

## 4. Pick the right tool

| You need… | Use | Why |
| --- | --- | --- |
| one element's look | `cls({ … })` | one class, one export |
| a component with finite choices (intent, size, tone) or boolean modifiers | `recipe({ base, variants, toggles, compound, defaults })` | precompiled classes, typed props; `propsOf(recipe)` makes them Vue props |
| a multi-part component (dialog, tabs, select, switch) whose parts react to each other | `anatomy({ parts, base, variants })` + `useAnatomy` | one class per part, `'root:open'` part conditions |
| a value that changes per instance at runtime (progress, a measured size, a user-picked color for one item) | `port(default)` + `usePorts` | typed custom property owned by the component; no hand-built `--vars` |
| a reusable chunk of declarations | a function returning `fragment({ … })` | typed, condition-aware, composable in arrays |
| re-theme a subtree (danger zone, inverted card) | `ds.tdec.propagated({ … })` spread into a class | re-points named roles and re-derives eligible emitted dependents; plain `ds.tdec` changes only the listed roles (`references/dynamic-values.md`) |
| a system-wide live value or theme switch (accent hue, density, scheme) | mutable token / axis → `vanity-system` skill | the system owns it; runtime writes one slot |
| a page/document rule | `rules({ … })` in a base module | emitted once, layered |

Read `references/components.md` for recipes, anatomy, `propsOf`, published ports, and atoms. Read `references/dynamic-values.md` when a value depends on state, props, or user input.

## 5. Dynamic values in one glance

```ts
// Progress.css.ts
export const fraction = port(0)                       // typed by its default: a number
export const fill = cls({
  inlineSize: ds.calc(fraction).multiply(ds.percent(100)),
  background: t.color.accent,
  transition: `inline-size ${t.duration.base} ${t.ease.standard}`,
})
```

```vue
<template lang="pug">
div(:class="s.fill" :style="fillStyle")
</template>

<script setup lang="ts">
import * as s from './Progress.css.ts'

const props = defineProps<{ value: number }>()
const fillStyle = usePorts(() => [s.fraction.dec(props.value)])
</script>
```

States driven by the DOM (`data-state`, `aria-*`, `:checked`) are conditions, not dynamic values: set the attribute in the template (`:data-state="open ? 'open' : 'closed'"`) and style the `open` key.

## 6. Follow the declared conventions

The compiler catches unknown properties, unknown condition keys, misspelled token paths (while typing), known token data-type mismatches, and invalid keyword values like `display: 'flexx'` (at build). `VANITY_CSS_TOKEN_KIND` names the token, property, and shorthand component it cannot fill: choose a role with the correct data type rather than changing its value or casting away the error. A number token whose default is zero still has number type; it is not a length token. A `reference: 'val'` interpolation loses token identity, so pass its handle directly or use a var-reference token when identity matters. Unresolved grammar and external custom properties do not establish compatibility. A declarations policy can require token provenance and report raw, derived, and direct primitive-tier decisions. Read its requirements before choosing values. Review these remaining design decisions before you finish:

- **Raw design values** where a token exists: hex/rgb/oklch colors, `px`/`rem` lengths, `ms` durations, easing curves, shadows, z-index numbers, radii. Search your diff: `rg "#[0-9a-f]{3,8}\b|\b\d+(\.\d+)?(px|rem|ms)\b" --glob '*.css.ts'`.
- **Off-scale values**: if the scale has 12 and 16, don't write 13. Pick the nearest role; if the design genuinely needs a new step, add it to the system (`vanity-system`) and say so in your summary.
- **Selector typos**: `'&:hovr'` is valid syntax and silently never matches. Prefer named condition keys, which are type-checked.
- **Hand-written custom properties**: `` `var(--app-${name})` `` breaks on rename and bypasses the runtime. Use `t.*`, a port, or the runtime controller.

When no token fits, don't invent a value silently. If the design needs a new decision (a success color, a disabled opacity, a spinner duration), add the role to the system — that's the default, because the next component will need it too. Use the closest existing token only when it genuinely means the same thing. Either way, name the gap in your summary: a designer can only fix drift they can see.

Media and container query thresholds can't read custom properties (a CSS limitation), so breakpoints live in the system as named conditions, defined once; that's why you use their names instead of writing `@media` yourself.

Raw values are right for **mechanics** that aren't design decisions: `0`, `100%`, `1fr`, `auto`, `'none'`, `'transparent'`, rotation angles in a spinner, the 1px box of a visually-hidden element, `linear` for a continuous rotation, the stops of a hue-spectrum track on a color slider. Leave a short comment when the reason isn't obvious.

When `VANITY_DECLARATION_RAW` names a component, use the suggested role only if its meaning fits. For a deliberate one-off adjustment, label the exception with the existing `unsafe` import:

```ts
import { unsafe } from '@mszr/vanity'

export const alignedIcon = cls({
  marginInlineStart: unsafe.value('13px', 'optical alignment with the icon'),
})
```

`VANITY_DECLARATION_DERIVED` under `derivations: 'restrict'` means the net calculation leaves the declared convention: multiplying by 13 then dividing by 16 still fails. Integer scaling, reciprocal scaling, and unscaled token sums are admitted; they are not promises that the result lies on a scale. `VANITY_DECLARATION_PRIMITIVE` asks for a semantic role. A labeled escape still receives CSS validation and must state a non-empty reason. Follow the project's `mechanics` exemptions exactly; `transparent` and `currentColor` are not universal exemptions.

`VANITY_TOKEN_RESTRICTED` means the selected role's property contract does not permit this component. Read its `usage` intent and `restrict` reason before choosing a replacement. Border-color families include physical and logical borders and the color component of `border`; a hairline role is not thereby a text color. `discourage` warns; `forbid` rejects; deliberate exceptions use the same labeled `unsafe.value` escape.

For mutable roles, `$set` validates before writing and checks the declared `range` on the accepted output. Do not replace a rejected unit with an approximate conversion that needs layout. Runtime validators receive CSS text or finite numbers; snapshots store those inputs and replay validation once. Use `snapshotFrom` and `runtimeProps` for server state, then hydrate the same snapshot.

## 7. Craft defaults

These make interfaces feel finished; apply them unless the design says otherwise. `references/patterns.md` has ready-made versions.

- Every interactive element gets a visible `focusVisible` state (outline with a stroke + accent token and an offset); never remove outlines without a replacement. Rows inside a list can use an inset ring (`outlineOffset: ds.calc(t.stroke.thick).negate()`) so it doesn't overlap neighbors.
- Hover feedback only on things that respond: guard it on disabled/loading controls.
- Wrap decorative motion in `motionOk: { … }` (or zero it under `motionReduce`) and time it with duration/ease tokens.
- Use `gap` for spacing between siblings, not margins on children. In grid/flex children that hold text, set `minInlineSize: 0` so they can shrink.
- Prefer container conditions for components that live in panels of varying width; viewport conditions for page layout.
- Keep hit targets ≥ 24px (44px for primary touch targets); use the system's control-size tokens.
- Long text: `textWrap: 'pretty'` for paragraphs, `'balance'` for headings; truncate deliberately (see patterns).
- Helpers: if the project lacks a helper you need (focus ring, truncate, visually hidden), inline it the first time; when a second component needs it, move it into a shared mixins module (and the authoring barrel) instead of copying it.

## 8. Verify

1. Typecheck (`nuxi typecheck` in Nuxt projects) — catches token typos, unknown keys/conditions, recipe prop typos.
   Check source style modules for compiler findings in Vite, WXT or Vitest projects; use the framework build in Nuxt. Read coverage and unevaluated entries before claiming a complete result. A baseline accepts existing policy findings, and a new violation still fails; repair invalid CSS and token-kind mismatches directly.
2. Build or run the dev server and read the output — Vanity reports `VANITY_*` diagnostics with the file, the property path, and a fix. A build stops at the first failing style module; fix and re-run until clean.
3. Re-read the diff against §6.
4. If something renders wrong (a rule doesn't apply, a theme doesn't switch, a value is stale), read `references/troubleshooting.md`.

## 9. Common mistakes

- Toggling modifier classes by hand (`[s.btn, primary && s.btnPrimary, small && s.btnSmall]`) → a recipe with variants, consumed with `s.button(props)`.
- `const d = dialog(props)` in `<script setup>` for an anatomy → computes once and stops updating; use `useAnatomy(s.dialog, props)`.
- `:style="{ '--x': value }"` → a port with `usePorts`.
- Creating or consolidating a system inside a `*.css.ts` file (`VANITY_SYSTEM_IN_STYLE_MODULE`); the system lives in its plain `.ts` module.
- Importing `@mszr/vanity` from app/component code (`VANITY_AUTHORING_IN_APP_MODULE`); app code uses the `ds`/style handles it is given.
- Using a condition object as a key (`` [`${aria('selected')}`]: … ``) → register it in the system and use its name, or write the selector string `'&[aria-selected="true"]'`.
- Using `ds.legibleOn(…)` inside a style → contrast-picked colors are token definitions (system skill); styles reference the resulting role (`t.color.onAccent`).
- Re-declaring a breakpoint or state selector the system already names → use the name, so one edit in the system moves every use.
