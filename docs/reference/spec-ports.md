# vanity — spec: ports

A port is a component/style-owned, typed, defaulted CSS custom property. It is the framework-neutral boundary for per-instance runtime values. Mutable tokens own design-system decisions for one system root; ports own inputs published by one style or component.

The runtime-boundary and ownership laws live in [patterns.md §9](../maintainers/patterns.md#9-ports-and-mutable-tokens-solve-different-lifetimes). This document owns port declaration, serialization, validation, publication, and SSR behavior.

## Implementation status

| Contract | Status |
| --- | --- |
| Common value/data-type serialization | ☑ |
| Declaration, interpolation, metadata, and publication | ☑ |
| Static/runtime setters and fragment merging | ☑ |
| Synchronous Standard Schema validation | ☑ |
| Build/app restoration, explicit validator binding, Vue reactivity, SSR | ☑ |

## 1. Declaration and interpolation

```ts
// Progress.css.ts
import { ds } from '~/design/system'

export const fraction = ds.port(0)
export const tint = ds.port(ds.t.color.brand)
export const rotation = ds.port(ds.angle.deg(0))

export const fill = ds.class({
  inlineSize: ds.calc(fraction).multiply(ds.percent(100)),
  background: tint,
  rotate: rotation,
})
```

The ordinary signature is `port(default, options?)`. The advanced form keeps related policy together:

```ts
export const fraction = ds.port({
  val: 0,
  label: 'fraction', // normally inferred from the export
  validate: {
    id: 'progress-fraction-v1',
    schema: FractionSchema,
    runtime: 'dev',
    onInvalid: 'throw',
  },
})
```

Contract:

- the default determines the CSS data type and serialized fallback;
- raw strings remain ergonomic (`port('2em')` is valid), while branded values carry exact meaning and units;
- ports receive values with their explicit units: write `ds.port(ds.angle.deg(0))`, then set another angle value or CSS angle string;
- interpolation yields `var(--…, <serialized default>)`, so the authored CSS is complete without a runtime write;
- the system's common serializer handles strings, finite numbers, values, expressions, token references, and other ports;
- `.type` exposes the canonical CSS data type; `.kind` is coarse metadata for adapters that do not consume the full type;
- the export/filename transform supplies the debug label; `label` is a rare manual override;
- `.describe()` and `.deprecated()` mutate the shared declaration metadata that crosses the build/app boundary.

## 2. Declarations and fragments

```ts
fraction.dec(0.62)
rotation.dec(ds.angle.deg(45))
tint.dec(ds.t.color.accent)

ports(fraction.dec(progress), enabled && tint.dec('rebeccapurple'))
```

`dec()` returns one plain declaration fragment. It never writes an element, creates a selector, injects a rule, or mutates a stylesheet. The CSS noun is deliberate: build-time declarations are data, while live token mutation uses the runtime `$set` verb. There is no `port.set` alias.

The same result is useful in authored rules, Vue `:style`, SSR, and any other framework.

Values are narrow by CSS data type but preserve direct CSS input:

- a number port accepts numbers, same-type vanity values, and token/port references;
- typed non-number ports accept same-type vanity values, CSS strings, and references;
- a static `dec()` spread inside `class()` emits a custom-property declaration at build time;
- `ports()` merges fragments and skips falsy entries; `usePorts(() => [...])` already performs this merge, so wrapping its array is redundant.

## 3. Synchronous Standard Schema validation

Validation is optional and uses the Standard Schema v1 interface, so vanity depends on no validator library.

```ts
const factor = ds.port({
  val: 0,
  validate: {
    id: 'factor-v1',
    schema: FactorSchema,
    runtime: 'always', // false | 'dev' | 'always'
    onInvalid: 'omit', // 'throw' | 'fallback' | 'omit'
  },
})
```

Defaults are `runtime: 'dev'` and `onInvalid: 'throw'`.

Invalid input never becomes a declaration:

- `throw` throws before a fragment is returned;
- `omit` returns an empty fragment;
- `fallback` serializes the explicitly authored fallback instead;
- `false` retains schema-powered typing/metadata without runtime validation;
- an async schema result is rejected before output because `dec()` is deliberately synchronous.

Schema implementations do not get serialized into style-module exports. The stable validation ID crosses the build/app boundary. A restored port binds the app/SSR implementation explicitly, without global state:

```ts
import { fraction } from './Progress.css'

const runtimeFraction = fraction.bind({
  validators: { 'progress-fraction-v1': FractionSchema },
  dev: import.meta.dev,
})

runtimeFraction.dec(0.6)
```

`bindPort(port, options)` from `@mszr/vanity/runtime` is the equivalent functional spelling. A validation mode that should run but has no bound schema fails explicitly; it never silently accepts an unvalidated write.

## 4. Published component styling contracts

```ts
const gap = ds.port(ds.t.space.sm)
const radius = ds.port(ds.t.radius.md)

export const button = ds.recipe({
  ports: { gap, radius },
  base: { display: 'inline-flex', gap, borderRadius: radius },
})

export const toolbar = ds.class({
  display: 'flex',
  ...button.ports.gap.dec(ds.t.space.lg),
})
```

`ports:` publishes handles; it does not declare them. Recipe/anatomy application-module restoration preserves their defaults, types, metadata, validation contracts, and `dec()` declaration method. A consumer themes descendants through the cascade without depending on internal DOM structure.

## 5. Ports versus mutable tokens

Use a mutable token for a user-customized palette, density/radius setting, persisted application design preference, or design-system editor. It binds to a system root, addresses authored base/mode/case slots, and participates in system snapshots.

Use a port for progress, coordinates, per-component measurements, a library component's public styling input, or other per-instance values. It is owned/discovered through the exporting style or recipe and produces style fragments.

Both ultimately serialize custom-property declarations. They intentionally do not share an ownership API: a port is not a disguised mutable token, and a mutable token is not an anonymous component input.

## 6. Vue, SSR, and HMR

- `usePorts(() => [port.dec(value)])` is a typed computed style binding; validation completes before Vue receives the fragment.
- SSR serializes the same object into the rendered `style` attribute; hydration sees identical data.
- the function serializer restores handles and recipes without executing build-time styling work in the browser.
- validation implementations are request/local-binding data, not mutable process globals, so SSR requests cannot contaminate one another.
- HMR may replace authored defaults/metadata while the app retains its own reactive source of current port values; no stylesheet patching is involved.
