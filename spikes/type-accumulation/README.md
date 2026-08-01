# Spike: type-level shape accumulation

A **library-agnostic** proof that TypeScript can express an _accumulating builder_ whose shape grows across an immutable chain, is visible to later callbacks, can be required structurally with **readable** errors, and locks into a narrowed surface — all without a runtime. Nothing here imports or depends on any product; the names are neutral so the patterns stand on their own.

It exists to de-risk a design that hinges on these exact capabilities. If a future library re-derives them, this spike is the reference — and its guard rails (below) are the difference between "works" and "explodes at scale".

## Run it

Self-contained and independent of the monorepo workspace (hence `--ignore-workspace`):

```sh
cd spikes/type-accumulation
pnpm install --ignore-workspace   # own node_modules, shared pnpm store (disk-cheap)
pnpm run check                    # tsc: the patterns typecheck
pnpm run test                     # selenita: completions + diagnostics behave as claimed
pnpm run depth                    # the naive-vs-lean depth comparison
```

## The patterns

| id | claim | where |
| --- | --- | --- |
| Claim | Evidence |
| --- | --- |
| An immutable chain accumulates shape quickly and exposes it to later callbacks. | `src/builder.ts` |
| A field accepts a plain value or a callback over contextual accumulated shape. | `src/patterns.ts`, `src/builder.ts` |
| Structural requirements and duplicate additions fail with a readable, local message. | `src/patterns.ts`, `tests/realistic.test.ts` |
| `consolidate()` removes mutation methods from the locked surface. | `src/builder.ts` |
| Branched fields and ordered contributions remain inspectable at scale. | `tests/realistic.test.ts` |

The branched (R1) shape does **not** compound the depth problem: an 80-link chain of branched-field groups stays flat (~8.6k instantiations, no TS2589) — nesting within a field is bounded and doesn't accumulate across the chain.

## Product guard

The product model carries the same guard in `sdk/src/system/openSystem.scale.test-d.ts`: 80 immutable open-system links, two independently consolidated forks, first/last accumulated reads, and no TS2589. `sdk/src/system/openSystem.test.ts` additionally materializes 32 locked forks from one base and proves their names and constants stay isolated.

## The two rules that make it work

**1. Accumulate by plain intersection; defer `Simplify` to read-sites.** The intuitive way to keep hovers clean is `Simplify<Omit<S, k> & { … }>` at every step. It explodes into `TS2589` ("excessively deep") at ~40 links. Accumulate as a plain `S & Record<N, …>` on one type param and only `Simplify` where a human reads the type (callback params, the locked surface):

```
kind   N    TS2589?  instantiations
naive  20   no       4421
naive  40   YES      16945          ← breaks
lean   20   no       976
lean   40   no       2736
lean   80   no       8656
lean   150  no       26716          ← still fine, ~0.12s
```

**1b. Guard by INTERSECTION when the parameter carries callbacks.** A wrapping conditional (`[Dup] extends [never] ? Mapped : Msg`) type-checks but defeats contextual typing for callback-valued fields. Intersect instead: `Mapped & Brand`, where `Brand` is `unknown` when clean. The mapped type stays primary, callbacks keep their types, and a collision still errors on the exact argument. Cost: a slightly noisier "property is missing" line alongside the named message.

**2. Surface requirement failures by collapsing the parameter type to the message.** When a requirement is unmet, make the argument's expected type _be_ the message string. The compiler then prints:

> Argument of type `Contribution<…>` is not assignable to parameter of type `"group 'color' is missing field(s): ink"`.

The missing piece is named, on one line — not generic type soup.

## Footguns encountered (each is a one-line regression waiting to happen)

- **`never extends string` is `true`** — a _met_ requirement makes the "missing" type `never`, which then wrongly takes the error branch. Tuple-wrap it: `[Missing] extends [never] ? Pass : Missing`.
- **`unknown | X === unknown`** — a `FieldInput<unknown>` constraint collapses and the callback param loses its contextual type. Use the reverse-mapped param `{ [K in keyof G]: FieldInput<G[K]> }` with `G` inferred as the _resolved_ values.
- **`*/` inside a JSDoc comment** silently closes the comment and corrupts the file.
