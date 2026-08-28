# vanity — spec: vue + nuxt

The framework overlays are where Vue-specific delight belongs. The core stays framework-free ([vision.md §5](../vision.md#5-core-principles)); `/vue` and `/nuxt` are thin sugar over the core's three currencies: CSS, class strings, and style-object fragments.

## Implementation status

| # | Contract | Status |
| --- | --- | --- |
| 1 | `usePorts` | ☑ |
| 2 | `useAnatomy` and `propsOf` | ☑ |
| 3 | The SFC mapping | ☑ |
| 4 | The Nuxt module | ☑ |
| 5 | SSR and HMR | ☑ |
| 6 | Colocation stance | ☑ |

---

## 1. `usePorts`

**Why.** Vue's `v-bind()` in CSS has the right mental model — static rule, reactive value — with the wrong properties: stringly, SFC-only, invisible to refactoring. `usePorts` is the same idea over typed port setters.

**Usage.**

```vue
<script setup lang="ts">
import { usePorts } from '@mszr/vanity/vue'
import { fill, fraction, track } from './Progress.css'

const props = defineProps<{ value: number, max?: number }>()

const fillStyle = usePorts(() => [
  fraction.dec(props.value / (props.max ?? 100)),
])
</script>

<template>
  <div :class="track" role="progressbar" :aria-valuenow="value">
    <div :class="fill" :style="fillStyle" />
  </div>
</template>
```

**Contract details.**

- Reactive, typed, SSR-safe: a `computed()` merging port fragments — deliberately trivial, which is the mark of a boundary drawn in the right place.
- Accepts a thunk returning fragments (reactive) or plain fragments (static); the thunk's array **is** the merge — no `ports()` wrapper inside ([spec-ports.md §2](./spec-ports.md#2-declarations-and-fragments)). The return binds to `:style` and serializes on the server ([spec-ports.md §6](./spec-ports.md#6-vue-ssr-and-hmr)).
- Standard Schema validation completes inside `port.dec()` before the computed receives a fragment. Restored validated ports bind app/SSR validators once with `port.bind({ validators, dev })`; `usePorts` does not hide a global validator registry or invent a second serialization path.
- Everything `v-bind()` offers — cascade-powered, no style recalc storms — with none of its limits: works across files, outside SFCs, rename-safe.

---

## 2. `useAnatomy` and `propsOf`

**Why.** An anatomy call returns a record of part classes, and Vue's reactivity has a trap waiting there: `const d = dialog(props)` in `<script setup>` computes once and silently stops tracking. The correct `computed(() => dialog(props))` works but is the kind of pattern every first-timer discovers via a confused bug. This is the one place the "a typed function needs no wrapper" rule bends — because here the wrapper carries reactivity, not ceremony.

**Usage.**

```vue
<template lang="pug">
div(:class="d.backdrop")
div(:class="d.positioner" role="dialog")
  div(:class="d.content")
    h2(:class="d.title")
      slot(name="title")
    slot
</template>

<script setup lang="ts">
import { propsOf, useAnatomy } from '@mszr/vanity/vue'
import * as s from './Dialog.css'

const props = defineProps(propsOf(s.dialog))
const d = useAnatomy(s.dialog, props)
</script>
```

**Contract details.**

- Accepts the reactive props object directly (props are reactive), a getter (`useAnatomy(dialog, () => ({ size: props.size }))`), or nothing — the defaults resolve; returns a reactive, typed record of part classes — `d.content` in the template, no `.value`, no repeated calls.
- The call-site law applies unchanged: a wider props object flows through; unknown keys are ignored ([spec-recipes.md §4](./spec-recipes.md#4-the-call-site-props-in-classes-out)).
- `propsOf.group({ button, card })` preserves multi-component projection through object-key namespaces (`button-intent`, `card-size`). The prefix comes from the key; already-projected option maps may be nested the same way.
- Single-class recipes stay wrapper-free: `:class="button(props)"` inline is already reactive, and no `useRecipe` exists (principle 10 — a wrapper must carry something, and there it would carry nothing).
- **`propsOf` is the component-props bridge.** It turns a recipe or anatomy into Vue runtime props: `defineProps({ ...propsOf(button), disabled: Boolean })`. Variants stay in one source of truth, and toggles receive Vue's native boolean casting. Runtime options are necessary because the SFC compiler cannot resolve the inferred result of a `recipe()` call inside `defineProps<T>()`. Plain TypeScript can still use `VanityProps<typeof button>` ([spec-recipes.md §4](./spec-recipes.md#4-the-call-site-props-in-classes-out)).
- **`propsOf` belongs to `/vue`, not `de` or `ds`.** It creates Vue `PropType` declarations, consumes handles from any Vanity system, and needs no engine or system policy. Binding it to a system would add framework types and duplicate one stateless adapter per system without improving inference.

---

## 3. The SFC mapping

**Why.** Vue's scoped-style machinery is a set of workarounds for CSS-the-global-language. A compiled, module-scoped model doesn't reimplement the workarounds — it removes the problems they work around. The mapping is documentation-as-contract; migrating users must find each habit's home:

| SFC feature | Compensates for | In vanity |
| --- | --- | --- |
| `scoped` + `[data-v-x]` | the global namespace | dissolved — every class is hashed; scoping is automatic and cheaper (no attribute selectors) |
| `:deep(.child)` | piercing the scope wall to theme children | **ports** for values ([spec-ports.md §4](./spec-ports.md#4-published-component-styling-contracts)); typed class interpolation for structure ([spec-css.md §7](./spec-css.md#7-conditions-and-selectors)) |
| `:slotted()` | parent markup in child scope | non-issue — you style what you hold a class reference to; slotted markup already carries the parent's classes |
| `:global()` | escaping the scope wall | `ds.rules()` / the `overrides` layer |
| `v-bind(expr)` in CSS | reactive values in static styles | **ports** + `usePorts` |
| typed `defineProps` for style props | restating variant unions by hand | **`propsOf`** — the recipe's variant space _is_ the props declaration |

**Contract details.** This table ships in the package docs verbatim; the demo app exercises every row. Recipes bind through plain functions — import the recipe and call it, no wrapper needed; `useAnatomy` ([§2](#2-useanatomy-and-propsof)) is the sole composable beyond `usePorts`, and it exists for reactivity, not style.

---

## 4. The Nuxt module

**Why.** Nuxt is where the zero-runtime payoff is largest — styles are `<link>`-able static CSS, so SSR, streaming, and prerendering need no style pipeline at all — and where setup ceremony would otherwise concentrate.

**Usage.**

```TS
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@mszr/vanity/nuxt'],
  vanity: {
    compiler: {
      system: '~/design/system.ts',
      styleAutoImports: '~/design/authoring.ts',
    },
    app: {
      runtimeAutoImports: ['core', 'vue'],
    },
  },
})
```

The `compiler` and `app` blocks describe two different execution lanes. Their shared contract and adapter differences are defined in [spec-integrations.md §8](./spec-integrations.md#8-integration-adapters). In Nuxt, `app.runtimeAutoImports` enters Nuxt's native import registry and is therefore available in Nuxt application code and Vue templates; `core` is Vanity's framework-agnostic runtime group and `vue` adds the Vue adapter.

**Contract details.**

- Installs the `/vite` compiler lane (manifest emission included) and registers opted-in application runtime imports with Nuxt's native import registry; the shared lane contract and generated-type rules live in [spec-integrations.md §8](./spec-integrations.md#8-integration-adapters).
- Nuxt's native registry owns the application declaration surface, so Nuxt projects need neither a separate `imports.presets` entry nor a Vanity-specific Nuxt preset value.
- **Importing the system module from app code is legal.** Token handles, override classes, runtime factories, and SSR projection helpers cross as serializable contracts; bound authoring functions cross as build-plane stubs that throw the lane redirect if called — never a poisoned module, never a silent no-op.
- Nuxt DevTools tab: the token browser (values per scheme, liveness, usage counts), recipe/anatomy inspector, ports, conditions, and the escape inventory, with click-through to the `.css.ts` source. It embeds the manifest view the `/vite` plugin serves at `/__vanity/` in dev — one implementation serves plain Vite and Nuxt alike ([spec-introspection.md §5](./spec-introspection.md#5-manifest-v3)).
- A single component can use Vanity with the module and one `.css.ts` file; no global buy-in is required.

---

## 5. SSR and HMR

**Why.** Instant feedback is a first-class requirement: edit a style, see the pixel, keep component state.

**Contract details.**

- **HMR:** editing a `.css.ts` hot-swaps the emitted CSS without a full reload or component state loss. Stable virtual CSS ids swap the style tag in place, style modules self-accept, an edit to a bundled dependency hot-updates every style module built on it, and only an export-shape change costs a full reload. The Nuxt demos lock this contract end to end; a regression is a release blocker.
- **SSR:** static styles ship as stylesheets; port values as inline style; no FOUC, no hydration style mismatch, no per-request collection.
- **Mutable-token/mode flash:** persist application settings or `runtime.snapshot()` in a cookie/server payload, pass each root entry from `ds.runtimeProps()` to its matching server-rendered root, and construct `ds.runtime({ within, initial: snapshot })` on mount. The first SSR paint already contains the mode attributes and opaque slot values; hydration validates the same semantic addresses without rewriting them. The module's small `vanity-scheme` HTML-cookie adapter remains available for the common document-root light/dark case, while custom roots and multi-axis systems use the declared-root runtime rather than a global theme registry.

---

## 6. Colocation stance

**Why.** The one honest ergonomic regression versus SFCs: styles move from `<style>` in the same file to a sibling `Button.css.ts`. Stated plainly rather than papered over.

**Contract details.**

- The sibling `*.css.ts` module is the stable, portable authoring form — required by the evaluation model ([patterns.md §1](../maintainers/patterns.md#1-evaluate-typescript-compile-css)).
- The sting is smallest exactly where colocation matters most: design-system styles (tokens, recipes, anatomies) _want_ their own files, and small one-off styling stays short through `ds.atoms()` ([spec-recipes.md](./spec-recipes.md)) and `overrides`-layer `class()` calls.
- Inline TypeScript style blocks are not part of the current contract. A future proposal would need to preserve the same evaluation model and justify its editor-tooling cost.
