# vanity — spec: conditions, roots, and axes

Conditions are the atom. Axis modes, named styling conditions, roots, and runtime activation all build on the same typed condition AST.

## 1. Condition constructors

Top-level constructors describe context:

```TS
data('state', 'open')
media({
  minWidth: '60rem',
})
supports('(display: grid)')
container('card', {
  inlineSize: {
    '>=': '30rem',
  },
})
selector('&:hover')
scope('.card').to('.card-media')
```

Helpers are literal:

- `data('state', 'open')` emits the bare attribute selector; it does not invent `&`;
- strings remain real CSS and are never tokenized as a Vanity dialect;
- `selector()` is needed only to begin fluent composition;
- every condition is usable directly, registrable by name, and usable as an axis mode.

## 2. Algebra

Conditions support:

- `.and(other)` — intersection;
- `.or(other)` — union;
- `.not()` — negation.

The fluent layer builds AST, never string concatenation.

Lowering rules:

- same-kind selector unions may comma-join;
- cross-kind conjunction nests at-rules/selectors;
- cross-kind union expands to multiple arms;
- negation applies correct native representation or De Morgan lowering;
- expansion is bounded and deduplicated;
- combinatorial explosion receives a designed diagnostic with the composition path.

Selectors preserve CSS nesting semantics, including relative selectors and `&`. CSS has no native complement for an `@scope` prelude, so negating a scope receives a designed diagnostic that asks the author to negate an inner selector. Vanity does not pretend that `:not()` can express “outside this scope.”

## 3. Range queries

Structured media and container range queries use CSS operators:

```TS
media({
  width: {
    '>=': '600px',
    '<': '1200px',
  },
})

container('card', {
  inlineSize: {
    '>': '30rem',
  },
})
```

Rules:

- at most one lower bound;
- at most one upper bound;
- `=` stands alone;
- only range-capable features accept the shape;
- `minWidth`/`maxWidth` remain inclusive sugar;
- raw strings remain the escape;
- cursor types catch contradictions where possible; build parsing catches the rest.

## 4. Anchors

Typed standalone atoms:

| Atom | Meaning |
| --- | --- |
| `systemRoot` | root where the system's tokens emit |
| `moduleRoot` | nearest declaring module root; error if absent |
| `thisMode` | this axis mode's own activation selector at its root |

They are templates like `&`, resolved at the use site. They compose with the entire condition algebra and carry runtime activation metadata.

`&` retains exact platform meaning relative to the current emission anchor.

## 5. Named conditions

```TS
open.addConditions({
  wide: media({
    minWidth: '60rem',
  }),
  hocus: selector('&:hover').or('&:focus-visible'),
})
```

Named conditions:

- become bare keys in every styling input;
- remain composable into axis modes;
- preserve AST, arm, provenance, maturity, and description;
- reject collisions additively;
- receive visible branded hover text such as `(condition) hover: &:hover`.

Headless conditions name the DOM state they require. Each TSDoc hover shows the compiled selector, and the owning application or plugin verifies it against the DOM it emits.

## 6. Roots

System root is required at consolidation, with `:root` available explicitly/defaulted by policy.

Token modules may declare roots:

```TS
ds.defineTokens({
  color: {
    brand: 'red',
  },
}).root('#widget')
```

Rules:

- groups inherit the nearest rooted ancestor;
- a nested module root does not inherit the parent root;
- `.root(systemRoot)` escapes to the system root;
- `.root(scope('#widget'))` emits inside `@scope`;
- `moduleRoot` requires a module root;
- manifest/introspection records the root/scope and owning modules.

## 7. `@scope`

`scope()` is a first-class condition and root descriptor:

```TS
const inCard = scope('.card').to('.card-media')
```

It supports:

- start and optional limit (“donut” scoping);
- composition with selectors, media, supports, and containers;
- registered condition use;
- module-root use;
- source/provenance;
- maturity annotation;
- a documentation callout for proximity precedence.

## 8. Axes

An axis is an ordered set of intended alternatives, not a proof that arbitrary conditions are mutually exclusive.

```TS
open.addAxis('density', ['compact', 'cozy'])

open.addAxis('scheme', {
  description: 'Pinned at the studio root',
  modes: {
    light: '&',
    dark: thisMode,
  },
  default: 'light',
})
```

`addAxes(ds => ({...}))` and callback overloads exist only when accumulated system context is needed.

Every axis records:

- literal name and modes;
- conditions/arms;
- default;
- mode order;
- description and source;
- activation metadata or explicit control adapter;
- overlap/precedence evidence;
- roots that carry values for it.

Axis and mode names may not begin with `$`. Integer-like ordering traps are diagnosed.

## 9. Scheme convenience

No behavior is triggered merely by naming an axis `scheme`.

The explicit built-in `colorSchemes()` axis definition bundles:

- guarded OS-preference arms so explicit light wins under OS dark and explicit dark wins under OS light;
- root `color-scheme` synchronization required by `light-dark()`;
- activation/read metadata;
- exact `light`/`dark` modes plus the unpinned state in which OS preference selects between them;
- honest locality and fallback metadata.

`colorSchemes()` and `schemeIs()` lower through the same guarded scheme-arm builder. The convenience never creates a parallel condition representation.

```TS
import { colorSchemes, createSystem, schemeIs } from '@mszr/vanity'

const open = createSystem().addAxis('scheme', colorSchemes())
const dark = schemeIs('dark') // a condition; it composes like any other condition
```

The axis and `schemeIs()` share one guarded scheme-arm builder. Output covers sparse non-color tokens, and the permanent canary proves explicit light under OS dark and explicit dark under OS light through the compiler-produced CSS.

## 10. Order and overlap

Declaration order is the default axis order. Consolidation may provide one exhaustive override:

```TS
open.consolidate({
  prefix: 'app',
  root: '#app',
  axisOrder: ['scheme', 'density', 'motion'],
})
```

Plugins may document preferred placement but cannot set global order.

Emission order:

```text
base
→ axes in consolidated order
→ explicit cross-axis cases
→ subtree/runtime override declarations
```

The `ambiguousAxes` audit reports overlap where order is load-bearing. It does not claim arbitrary conditions are exclusive.

## 11. Runtime activation metadata

Built-in activation-capable atoms attach descriptors while building the AST. Runtime never parses selectors to guess behavior.

An axis may instead provide:

```TS
const control = {
  id: 'app-mode-v1',
  read(root: Element) {
    return root.getAttribute('data-mode')
  },
  activate(root: Element, mode: string) {
    root.setAttribute('data-mode', mode)
  },
}
```

Modes without metadata or adapter are not runtime-activatable and are typed out of `$switchTo`. Intersections retain activation metadata only when one descriptor can satisfy the whole compiled arm; an attribute gated by media, supports, container, scope, or an interactive selector is not presented as activatable. A union remains activatable when one complete arm is activatable.

The root-resolving `rt.axes.*` controller surface consumes these descriptors directly; runtime never reparses selectors.

## 12. Introspection

Condition introspection exposes:

- stable ID;
- source AST;
- compiled arms;
- template anchors;
- example compiled contexts;
- activation metadata;
- maturity/support requirements;
- description and declaration location.

An `&`/root/mode template is never reported as a fake final selector without a context.

## 13. Evidence

Required matrices:

- `.and`, `.or`, `.not()` across selector/media/supports/container/scope;
- bounded expansion and deduplication;
- range query grammar and cursor errors;
- all anchor use sites and missing-module-root diagnostic;
- root inheritance/escape and scope roots;
- guarded scheme arms under opposing OS preference;
- `color-scheme` synchronization and nested-root locality;
- direct and callback axis forms;
- declaration and explicit axis order;
- overlapping-axis audit;
- activatable/non-activatable runtime types;
- headless hover selectors and library DOM contracts;
- browser selectors/cascade, not string snapshots alone.

### Evidence

- AST/algebra, range, anchor, direct/callback axis, order, and introspection fixtures live in `sdk/src/tokens/unified.*`.
- Exact selector/root/scope and anchor lowering lives in `sdk/src/tokens/unified.out.test.ts`.
- `sandbox/canary/tests/phase6.spec.ts` exercises the projected cross-kind condition and both opposing color-scheme preferences in Chromium.
- Registration, axis/case ordering, native-scheme locality, overlap audit, and sparse runtime addresses remain covered by the preserved token graph, emission, audit, and runtime suites.

The preset’s `open`, `closed`, `checked`, `selected`, `highlighted`, and `invalid` conditions are backed by `VANITY_HEADLESS_CONDITION_CONTRACTS`. Each record contains the exact emitted selector and per-library component, part, element, official source, and verification date. The 2026-07-24 evidence covers Reka UI, Ark UI, and Zag without pretending their selection contracts are interchangeable: `data-state="checked"` remains `checked`, while `selected` is reserved for the real `data-selected` contracts exposed by Reka range cells and Zag cascade-select items.
