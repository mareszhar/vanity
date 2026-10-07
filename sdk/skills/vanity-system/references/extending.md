# Extending the system

Default to plain TypeScript functions. Register something on the system only when it gains discovery (it appears on `ds`), identity (a plugin), or system-wide policy.

| Need | Use |
| --- | --- |
| a reusable style chunk | a function returning `ds.fragment(…)` — no registration |
| JSON-safe configuration to read back (`breakpoints`, limits) | `open.addConsts({ … })` → `ds.consts.*` |
| helper functions shared by every style module | `open.addUtils({ mx: { truncate } })` → `ds.mx.truncate()` |
| a family of value constructors (`ds.tone.vivid(…)`) | `defineConstructor` / `open.addConstructors(…)` |
| a reusable bundle of tokens, axes, conditions, utils for several systems | `definePlugin({ id, version, setup })` → `addPlugin(plugin)` |
| short property names (`px` → `paddingInline`) | `addPlugin(propertyAliases({ px: 'paddingInline' }))` |
| default units, color-mix space, restrictions | `createSystem({ constructors, color, tokens, layerOrder })` policy |

## Plugins

```ts
import { createSystem, definePlugin } from '@mszr/vanity'

export const elevation = definePlugin({
  id: 'acme.elevation',
  version: 1,
  setup: ds => ds
    .expectTokens({ color: { shadow: { type: 'color' } } })     // state what you need from the host
    .addUtils({ elevate: { card: () => ({ boxShadow: '0 1px 2px black' }) } }),
})

const open = createSystem()
  .addTokens(ds => ({ color: { shadow: ds.oklch(0.2, 0.02, 265, 0.25) } }))   // satisfies the plugin's expectation
  .addPlugin(elevation)
```

`setup` must return the chain (types are inferred from it). Plugins can `add*` and `expect*`, never overwrite host decisions.

## Changing what already exists

`add*` never redefines a name (a duplicate is an error naming both owners). To change existing data on the open system deliberately: `augmentTokens` fills reserved/unset slots, `overwriteTokens` replaces values. Prefer editing the original definition when you own it.

## Policies

```ts
createSystem({
  constructors: {
    length: { unitless: 'rem' },                             // ds.length(1) → 1rem
    oklch: { restrict: { level: 'discourage', use: 'tone', reason: 'Use the product color family.' } },
  },
  color: { mixSpace: 'oklab', adjustSpace: 'oklch' },        // defaults for colorMix() and bare lighten()/darken()
  layerOrder: ['reset', 'tokens', 'recipes', 'utilities', 'overrides'],
})
```

A `restrict` policy marks a constructor as discouraged (warning) or forbidden (build error) with a suggested replacement — useful to keep a team on curated families.

## Hail (optional preset)

`import { hail } from '@mszr/vanity/presets'` then `createSystem().addPlugin(hail({ … }))`. Hail is opinionated but selectable: its layers are independent, so adopt only what fits the system.

- **Constructors** (installed by default, emit nothing): normalized color families (`ds.oklchx`), base-step sizing (`ds.size(2)`), layout mixins (`ds.mx.truncate()`), and `contrastOf()` (an aesthetic black/white pivot, not an accessibility check).
- **Controls**: each range or base value can be static, a token, or mutable (`controls`).
- **Semantic elevation** (`color.elevation: true`): surfaces that lighten in dark schemes and darken in light ones from one coordinate.
- **Token and rule presets** (none by default): `palette`, `roles`, `sizes`, `breakpoints`, `icons`, `reset`, `motion`, `theming`, chosen with `presets: { mode: 'opt-in', listed: [...] }`.

Nothing Hail adds is required for an ordinary system; reach for one layer when it removes work you'd otherwise hand-write.
