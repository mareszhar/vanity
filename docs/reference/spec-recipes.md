# vanity — spec: recipes

Variants and anatomy compress component state into a legible, typed contract. Their diagnostics follow [patterns.md §14](../maintainers/patterns.md#14-diagnostics-are-stable-contracts).

## Implementation status

| # | Contract | Status |
| --- | --- | --- |
| 1 | `recipe()` — variants, toggles, compound, defaults | ☑ |
| 2 | Published ports: the `ports:` key | ☑ |
| 3 | `anatomy()` — parts styled as one unit | ☑ |
| 4 | The call site: props in, classes out | ☑ |
| 5 | Headless states | ☑ |
| 6 | Diagnostics quality | ☑ |

---

## 1. `recipe()` — variants, toggles, compound, defaults

**Why.** The variants model is the part of this problem the last decade actually solved (Stitches proved it; everyone inherited it). vanity keeps the settled shape deliberately — a proposal earns trust by not re-inventing solved things — and adds only two refinements: toggles as their own key, and full condition support inside every arm.

**Usage.**

```TS
// Button.css.ts
import { ds } from '~/design/system'

export const button = ds.recipe({
  base: {
    ...ds.t.text.body,
    display: 'inline-flex',
    alignItems: 'center',
    gap: ds.t.space.xs,
    borderRadius: ds.t.radius.sm,
  },
  variants: {
    intent: {
      brand: { background: ds.t.color.brand, color: ds.t.color.onBrand, hover: { background: ds.t.color.brandHover } },
      ghost: { background: 'transparent', color: ds.t.color.ink, hover: { background: ds.t.color.brandSoft } },
      danger: { background: ds.t.color.danger, color: ds.t.color.onDanger },
    },
    size: {
      sm: { paddingInline: ds.t.space.sm, minBlockSize: 32 },
      md: { paddingInline: ds.t.space.md, minBlockSize: 40 },
    },
  },
  toggles: {
    pill: { borderRadius: ds.t.radius.pill },
  },
  compound: [
    { when: { intent: 'ghost', size: 'sm' }, style: { paddingInline: ds.t.space.xs } },
  ],
  defaults: { intent: 'brand', size: 'md' },
})
```

```TS
button({ intent: 'danger', size: 'sm', pill: true }) // → class string
button.variants // → the typed variant map, for prop forwarding and docs
```

**Contract details.**

- Every arm — `base`, each variant value, each toggle, each compound `style` — is a full vanity styling input: ordered arrays, fragments, `tdec`, conditions, selectors, ports, and composite tokens are all legal.
- **Finite choice only:** a recipe call resolves among precompiled classes; the variability diagnostic points non-finite values to ports ([patterns.md §9](../maintainers/patterns.md#9-ports-and-mutable-tokens-solve-different-lifetimes)).
- `compound` entries type `when` against declared variants/toggles — an impossible combination errors at the offending key.
- `defaults` compile into `base` where sound (no extra class for the default case): a default value folds only when every sibling value declares everything it declares, arm for arm — otherwise the fold would leak the default's styling into the other choices, so the default keeps its own class.
- A recipe lives in one cascade layer, chosen with `ds.recipe.layer(name)` or `ds.inLayer(name).recipe`. A `layer:` option or rule key is a diagnostic; layer placement is emitter configuration everywhere.
- Calling with no arguments yields the defaults; the full call-site law — strict literals, permissive widened props — is [§4](#4-the-call-site-props-in-classes-out).

**Implementation.** Per-arm `class()`-equivalent lowering into the shared ordered rule IR plus a lookup table (the runtime is a class-string join over the precomputed table, restored across the build/app boundary by `restoreRecipe`). Emission order — base, variants, toggles, compound — makes compound entries win by ordinary CSS order within the layer. Debug names follow the declaration via the `/vite` transform (`button_intent_brand__h4x`). Prior art read, not depended on: `@vanilla-extract/recipes`, CVA, Stitches.

### 1.1 Token-group variants

`fromTokenGroup()` earns one narrow mechanical use: a same-key variant table derived from a resolved token group.

```ts
const variants = {
  tone: fromTokenGroup(ds.t.tone, color => ({ background: color })),
}
```

The output keys are exactly the group's keys and rename with them. The helper accepts resolved token groups only and requires a mapping callback; arbitrary arrays/objects use ordinary TypeScript. It does not grow into a parallel collection API.

---

## 2. Published ports: the `ports:` key

**Why.** A component's variant space and its runtime style API belong to one contract. Without a home on the recipe, every component invents a sidecar export (`buttonPorts`) that the consumer must separately discover and import — coordination ceremony the recipe can erase.

**Usage.**

```TS
// Button.css.ts — declare locally, publish on the recipe
const paddingX = ds.port(ds.t.space.md)

export const button = ds.recipe({
  ports: { paddingX },
  base: { paddingInline: paddingX, display: 'inline-flex' },
  variants: {
    size: {
      sm: { ...paddingX.dec(ds.t.space.sm) }, // declaration data, compiles into the class
      md: {},
    },
  },
  defaults: { size: 'md' },
})
```

```TS
// Toolbar.css.ts — the consumer reaches the style API through the recipe
import { button } from '../Button/Button.css'

export const toolbar = ds.class({
  display: 'flex',
  ...button.ports.paddingX.dec(ds.t.space.lg), // themes every nested button, zero runtime
})
```

**Contract details.**

- `ports:` is publication, not declaration: values are ordinary port handles ([spec-ports.md §1](./spec-ports.md#1-declaration-and-interpolation)) created in module scope, so arms reference them directly and the grammar never forks into callback forms.
- Published ports surface as `button.ports.*` — one import gives a consumer the classes _and_ the style API — and are recorded in the manifest as the component's runtime surface ([spec-introspection.md §5](./spec-introspection.md#5-manifest-v3)).
- Anatomy publishes identically (`dialog.ports.*`).
- An unpublished port still works everywhere; publication is how a component _advertises_ its themeable surface (principle 10 — publishing is opt-in, not a tax).

---

## 3. `anatomy()` — parts styled as one unit

**Why.** Serious components are multi-part — dialog, select, tabs, data table. Without a first-class unit, every component invents its own naming, context, and override conventions. An anatomy styles named **parts** together, with variants that apply across parts. (The canonical term is _part_; see [language.md §2](../language.md#2-vocabulary).)

**Usage.**

```TS
// Dialog.css.ts
export const dialog = ds.anatomy({
  parts: ['backdrop', 'positioner', 'content', 'title', 'close'],
  base: {
    backdrop: {
      position: 'fixed',
      inset: 0,
      background: ds.alpha(ds.t.color.ink, 0.42),
      open: { motionOk: { animation: `${fade} 160ms ease-out` } },
    },
    positioner: { position: 'fixed', inset: 0, display: 'grid', placeItems: 'center' },
    content: {
      width: 'min(100%, 36rem)',
      borderRadius: ds.t.radius.md,
      background: ds.t.color.surfaceRaised,
    },
    title: { ...ds.t.text.title },
  },
  variants: {
    size: {
      sm: { content: { width: 'min(100%, 28rem)' } },
      lg: { content: { width: 'min(100%, 52rem)' } },
    },
  },
  defaults: { size: 'sm' },
})
```

```TS
const d = dialog({ size: 'lg' })
d.content // → class string per part; d is a typed record keyed by part
```

**Contract details.**

- Same options grammar as `recipe` with one added dimension: each arm is keyed by part. Learn `recipe`, know `anatomy` (principle 5).
- Part names are typed everywhere: a variant arm referencing an undeclared part errors at that key.
- **Part-scoped conditions.** A part often responds to _another part's_ state — the input flattens its corners when the root is open. Inside an anatomy arm, a `'<part>:<condition>'` key expresses that relationship, typed over the declared parts × the system's conditions, compiling to the ancestor-state selector:

  ```TS
  input: {
    borderRadius: t.radius.md,
    'root:open': { borderEndStartRadius: 0, borderEndEndRadius: 0 },
  }
  ```

  No raw `'[data-state="open"] &'` string needed for relationships the anatomy already knows about; the raw form remains available for states outside the anatomy ([patterns.md §13](../maintainers/patterns.md#13-escape-hatches-degrade-gracefully)). A condition with no element selector (`'root:md'` — a bare media query) holds no part state, so scoping it is a diagnostic naming the reason.

- Dev builds add `data-part` attributes' styling hooks via stable debug class names (`Dialog_content__h4x`) — provenance for devtools ([spec-introspection.md §1](./spec-introspection.md#1-one-semantic-record)).
- Cross-part selectors use typed part references, the same rule as cross-file class references ([spec-css.md §7](./spec-css.md#7-conditions-and-selectors)): `dialog.parts.content` is the part's stable class, carried on the handle.

---

## 4. The call site: props in, classes out

**Why.** `button(props)` is the most-executed line in the SDK, and nearly every real component mixes variant props with its own (`disabled`, `href`, `loading`). If the everyday call required ceremony to strip non-variant keys, the boilerplate principle would be violated at the doorway of every component. So the call site is engineered around how TypeScript actually checks: strict on literals, permissive on widened objects.

**Usage.**

```vue
<script setup lang="ts">
import { propsOf } from '@mszr/vanity/vue'
import { button } from './Button.css'

const props = defineProps({ ...propsOf(button), disabled: Boolean })
</script>

<template>
  <button :class="button(props)" :disabled="disabled">
    <slot />
  </button>
</template>
```

**Contract details.**

- **A wider props object just works.** `button(props)` accepts any object assignable to the variant props; unknown keys are ignored at runtime (resolution reads only declared variants and toggles). No `pick`, no wrapper, no per-component stripping — ever.
- **Literals stay strict.** `button({ intnet: 'brand' })` is a red squiggle: TypeScript's excess-property checks fire on object literals, so inline typos die at the cursor while spread props flow through. The two behaviors are the same type, used as designed.
- **Values are always checked.** A declared variant key with an undeclared value (`intent: 'brnd'`) is a type error wherever the object is typed; arriving through an untyped edge it warns once in dev — naming the valid set — and resolves as the default, so a wrong prop never half-styles a component silently.
- `VanityProps<typeof button>` hovers as the plain optional object (`{ intent?: 'brand' | 'ghost' | 'danger'; size?: 'sm' | 'md'; pill?: boolean }`) — readable public types, no internals wall. It indexes the handle's `props` carrier (`readonly props: TProps`, runtime value the empty selection) rather than a conditional type, so the definition every tool reads is one Vue's SFC compiler could follow too.
- **In SFCs, `propsOf` declares the props.** Vue's SFC compiler resolves types syntactically and cannot infer a `recipe()` call's instantiation, so the typed macro can't reach the variant space — but the runtime handle carries it, and `defineProps({ ...propsOf(button), disabled: Boolean })` projects it into a Vue props declaration with literal-union types and native boolean casting for toggles ([spec-vue.md §2](./spec-vue.md#2-useanatomy-and-propsof)).
- **Object keys are namespace identity.** `propsOf.group({ button, card })` flattens exact `button-intent`/`card-size` keys; `{ compact: propsOf(button) }` prefixes from `compact`, never from a guessed variable/export name. The object shape prevents prefix/reference drift and composes already-projected option maps.
- **Anatomy in Vue: `useAnatomy`.** An anatomy call returns a record, and the tempting `const d = dialog(props)` in `<script setup>` silently loses reactivity. The `/vue` overlay ships the blessed one-liner — a typed `computed` that keeps part classes reactive and template-clean ([spec-vue.md §2](./spec-vue.md#2-useanatomy-and-propsof)):

  ```vue
  <script setup lang="ts">
  const d = useAnatomy(dialog, props)
  </script>
  <template>
    <div :class="d.backdrop" />
    <div :class="d.content"><slot /></div>
  </template>
  ```

  Single-class recipes need no wrapper — `:class="button(props)"` inline is already reactive and stays the documented form.

---

## 5. Headless states

**Why.** Headless libraries (Reka UI, Ark) expose state as `data-*` attributes; styling them must be the happy path.

**Usage.**

```TS
export const accordionItem = ds.class({
  open: { borderColor: t.color.brand },      // open: '&[data-state="open"]' in the system
  '&[data-highlighted]': { background: t.color.brandSoft },
})
```

**Contract details.** State conditions are ordinary system conditions (`data('state', 'open')` helper or raw selector). Applications register the headless states they use; Hail does not guess a component library’s contract. No adapter layer exists or is needed. **Who sets `data-state`:** a headless library (Reka UI, Ark) sets it for you — that's its contract; when you own the DOM, bind it yourself (`:data-state="open ? 'open' : 'closed'"`). The quickstart and demo model both.

---

## 6. Diagnostics quality

**Why.** Variant authoring is where beginners live; the error experience is the contract ([patterns.md §14](../maintainers/patterns.md#14-diagnostics-are-stable-contracts)).

**Contract details.**

- Recipe/anatomy options take **one signature with union-typed arms**, never sibling overloads — a malformed options object reports a single diagnostic at the offending property, never a "no overload matches" wall.
- A misspelled variant value at a call site names the valid set; a misspelled part names the declared parts.
- The editor-DX evidence dimension locks these messages per the workspace testing law ([workspace.md §5](../maintainers/workspace.md#5-test-organization)).
