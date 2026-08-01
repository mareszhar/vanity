# vanity — authoring vocabulary

Vanity's public types answer two different questions: what a helper accepts, and what surface it needs to call. Prefer the smallest honest boundary. A helper should not import an accumulated system type merely to accept one token or call one constructor.

## Input types

| Need | Type |
| --- | --- |
| Any CSS input, including the raw lane | `VanityCssInput` |
| A CSS input compatible with one data type | `VanityCssInput<'length'>` |
| Any compatible token | `VanityToken` |
| A token compatible with one data type | `VanityToken<'color'>` |
| A color accepted by color operations | `VanityColorish` |
| Infer an input's CSS data type | `VanityDataTypeOf<Value>` |

`VanityCssInput<Type>` keeps typed values and tokens within `Type`, while strings and numbers remain the explicit raw-CSS lane. `VanityToken<Type>` is the discoverable author-facing alias; `VanityTokenInput` remains the plane-neutral low-level carrier used by compiler and integration boundaries.

```ts
import type { VanityCssInput, VanityToken } from '@mszr/vanity'

export function inset(value: VanityCssInput<'length'>) {
  return { inset: value }
}

export function tokenVar(value: VanityToken<'color'>) {
  return value.$var()
}
```

## Surface types

| Need | Type |
| --- | --- |
| Built-in constructors only | `VanityConstructors` |
| Built-ins and token definitions on any open system | `VanityOpenSystemBase` |
| Styling methods on any consolidated system | `VanitySystem` |
| A reusable inert declaration/rule value | `VanityFragment` |

`VanityOpenSystemBase` and `VanitySystem` are deliberately empty-shape baselines. Every concrete open or locked system has more members and is assignable by width subtyping. System-specific tokens are intentionally absent from these baselines; a plugin must declare those through `expect*`. Layer-specific members such as `inLayer()` are likewise absent from `VanitySystem`, because an arbitrary system cannot promise a particular layer vocabulary. Accept the concrete system type when a helper needs one.

```ts
import type {
  VanityConstructors,
  VanityFragment,
  VanityOpenSystemBase,
  VanitySystem,
} from '@mszr/vanity'

export function violet(v: VanityConstructors) {
  return v.oklch(0.62, 0.2, 285)
}

export function setupValue(ds: VanityOpenSystemBase) {
  return ds.calc(1).add(2)
}

export function focusFragment(ds: VanitySystem): VanityFragment {
  return ds.fragment({ outline: '2px solid currentColor' })
}
```

Portable constructor imports are lighter still when no system is otherwise needed. Use a bound `ds` only for accumulated shape or system-specific constructors, not as a service locator.
