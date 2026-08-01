# vanity — language

One word has one meaning. This page is the compact public map; domain specs own exact behavior.

## 0. House style

The style for every Vanity document.

- **Precise, not padded.** One concept has one term; synonyms signal different concepts. Use the technical word when the domain calls for it. Lower the reader’s effort instead of performing thoroughness.
- **Decisions, not deliberations.** State the answer: “use X” or “X is Y.” Do not narrate options the document does not endorse.
- **Rationale earns its place.** Explain a choice when the reason is non-obvious or prevents a known trap. Keep rules visible; do not make them feel arbitrary.
- **No hedging.** Remove “generally,” “usually,” and “try to.” State real exceptions directly.
- **DRY.** A fact has one canonical home. Link to it instead of restating it.
- **Renderer-owned layout.** Paragraphs are semantic units, not hand-wrapped lines. Let the Markdown renderer place text and tables; reserve hard line breaks for code and intentional breaks.
- **Concrete by default.** Pair an abstract contract with the smallest representative snippet, table, or flow that makes its shape visible. Use `TS` fences for TypeScript snippets; a focused fragment is valid when its prose names the missing context.

## 1. Canonical sentence

> **Grow a system additively; consolidate it; style with it.**

```TS
import { createSystem } from '@mszr/vanity'

const open = createSystem()
const locked = open.consolidate({
  prefix: 'app',
  root: '#app',
})
```

`ds` is the recommended local name at both stages because it remains the same design system. `open` and `locked` are explanatory names when both objects appear in one module.

## 2. Vocabulary

| Term | Exact meaning |
| --- | --- |
| open system | Immutable accumulating builder with `add*`, `expect*`, `augment*`, `overwrite*`, definition utilities, constructors, and logical handles. |
| locked system | Consolidated, immutable system with resolved tokens, styling emitters, runtime binding, and introspection; no registration methods. |
| in-process contract | Locked build-plane representation; deterministic and emission-free but allowed to contain build closures. |
| portable artifact | Data-only compiler projection used to generate browser, SSR, manifest, and CSS artifacts. |
| CSS data type | A platform category such as `<color>`, `<length>`, or `<image>`. |
| expression | A CSS-producing literal, function, calculation, reference, operation, composite, or raw value. |
| token | A named design decision, not necessarily a custom property. |
| token definition | A value, traits, axis values, registration, validation, and metadata before name resolution. |
| token handle | One phase-polymorphic identity that gains resolved and runtime capabilities over time. |
| token module | A composable `defineTokens` builder output, mountable under a key or unscoped. |
| definition module | Detached immutable data for one registrable kind, built with `define*().add()` and mountable on an open system. |
| condition | A typed AST describing selectors and conditional at-rules. |
| arm | One lowered conjunction of selector and at-rule conditions. |
| axis | An ordered set of intended alternative modes plus optional default and runtime control metadata. |
| mode | A named condition within an axis. |
| root | The selector or scope owning a system/module token declaration. |
| fragment | Ordered declaration/rule data with no class or selector of its own. |
| mixin | A normal TypeScript function returning a fragment or other styling input. |
| recipe | A finite variant function returning classes. |
| anatomy | A part-keyed multi-part recipe. |
| atom set | A bounded utility-class map plus resolver produced by `ds.atoms`. |
| port | A style/component-owned, defaulted custom-property input that produces declaration fragments. |
| mutable token | A system decision with runtime-addressable semantic slots. |
| runtime | A root-resolving facade for token mutation, mode control, snapshots, and hydration. |
| const | JSON-serializable convenience data added to and read from a system. |
| util | A function contributed to the system; use a plain function unless registration is valuable. |
| constructor | A system-extensible typed CSS value family. |
| portable constructor | A built-in top-level constructor whose host policy resolves when its value enters a system. |
| bound constructor | The corresponding `ds` constructor projected through that system's policies and authoring diagnostics. |
| policy | System-wide conformance, restriction, output, or support law; `createSystem(config)` supplies the initial policy book. |
| rule group | A named, metadata-bearing system CSS contribution emitted once at consolidation output. |
| plugin | An identified reusable contribution that can add and expect system shape. |
| Hail | The optional opinionated plugin: normalized color/size constructors, controls, starter tokens, and selectable rule presets. |
| declaration bundle | A token leaf/group projected through its argless `$dec` property into themeable styling declarations. |
| projection | A derived typed representation of one semantic contract, such as names, vars, props, runtime schema, or manifest data. |

`theme` remains an application word. `scope` is reserved for CSS `@scope`. `override` remains cascade language; definition-plane destructive replacement is `overwrite`.

## 3. Surface map

### Top level

```text
createSystem
definePlugin
defineTokens / defineAxes / defineConditions / defineConsts / defineUtils
defineConstructor / defineConstructors / defineRules / definePolicies
portable built-in value constructors
data / media / supports / container / selector / condition / scope
systemRoot / moduleRoot / thisMode
range / fromEntries / mapRecord / ports
```

### Open system

```text
add{Kind} / add{Kinds} for every registrable data kind; addPlugin
augmentToken(s) / augmentAxis(es)
overwrite token(s) / axis(es) / condition(s) / const(s) / rule(s) / policy(ies)
expect singular/plural tokens, axes, conditions, consts, utils, rules, constructors, policies
define* detached modules / tdef
t / tdec / constructors / conditions
consolidate
```

### Locked system

```text
t / consts / conditions / axes
constructors and added utils
class / recipe / anatomy / atoms / fragment / rules
tdec / port / keyframes / fontFace / raw
inLayer / omit / serialize
runtime / snapshotFrom
introspect / explain / audit
```

Every logical and locked token handle exposes `$dec`. On a CSS-property leaf it declares that property; on a property/condition group it recursively projects a themeable declaration bundle. `tdec` points the other direction: it assigns values to token custom properties.

### Runtime

```text
t.<path>.$set / $unset
axes.<axis>.$switchTo / $cycle / $current
axes.<axis>.<mode>.$activate
refreshRoots / bindRoot / transaction
snapshot / hydrate / inspect
```

### Component projections

```text
propsOf
usePorts
useAnatomy
fromTokenGroup
button.ports
namesOf / varsOf / tokensOf and future uniform projections
```

## 4. Canonical file roles

```text
open-system.ts     create and extend the open system
*.tokens.ts        define portable or system-bound token modules
system.ts          add modules and consolidate; plain TypeScript
*.css.ts           emit classes, rules, recipes, anatomy, ports, and at-rules
component/app code consume serialized style handles and runtime facade
```

A system must not be created or consolidated inside `*.css.ts`. The compiler serializes style-module exports; it diagnoses this mistake and points to a plain `system.ts`.

## 5. Token language

```TS
const palette = ds.defineTokens()
  .add('hue', 264)
  .add('brand', t => ds.oklch(0.6, 0.15, t.hue))
  .add(t => ({
    canvas: ds.oklch.from(t.brand, { l: 0.98 }),
  }))
```

`.add()` adds a literal/configured token, a derived token, a derived batch, or another builder. Every form merges additively.

Tree syntax uses `ds.tdef({...})` to disambiguate a definition from a group. `.add(name, config)` accepts the raw config directly because that position cannot be a group.

## 6. Condition language

```TS
const wide = media({ width: { '>=': '60rem' } })
const interactive = selector('&:hover').or('&:focus-visible')
const inCard = scope('.card').to('.card-media')
```

Conditions are AST values with `.and`, `.or`, and `.not()`. Plain selector/query strings remain the raw standards lane. Strings are never preprocessed as a private Vanity dialect.

## 7. Styling language

Names state their output:

```text
class → class
recipe → finite class family
anatomy → part-keyed class families
atoms → bounded utility-class resolver
fragment → reusable ordered data
rules → authored selector rules
tdec → token custom-property declarations
keyframes → animation-name handle
fontFace → font-family handle
raw → raw CSS in the declared layer
```

`ds.omit` means no declaration. CSS `unset` keeps its platform meaning.

## 8. Runtime language

Runtime mutation uses fenced verbs because they sit beside user token/axis/mode names. Build-plane declaration producers do not:

```TS
port.dec(value)
ds.tdec({ color: { brand: value } })

rt.t.color.brand.$set(value)
rt.axes.scheme.$switchTo('dark')
```

This is deliberate asymmetry: build APIs produce CSS declarations as data; runtime APIs mutate state now.

## 9. Import patterns

Three forms are blessed:

1. generated style auto-imports, including ambient types;
2. `import * as de from '@mszr/vanity'` for definition modules;
3. explicit named imports.

There is no exported aggregate `de` object. Style modules should normally need only `ds`, whether explicitly imported or injected with exact generated types.

Hail is the only public preset:

```TS
import { hail } from '@mszr/vanity/presets'
```

`hail()` installs zero-output static authoring conveniences. Its ranges, semantic elevation, live controls, tokens, and rules are explicit options. The singular `/preset` entrypoint does not exist.
