# vanity — language

Vanity's language follows its behavior. The mental model comes first; the glossary indexes it.

## 0. House style and naming law

The style for every Vanity document:

- **Precise, not padded.** Lower the reader's effort instead of performing thoroughness.
- **Decisions, not deliberations.** State the endorsed answer.
- **Rationale earns its place.** Explain a choice when the reason prevents a known trap.
- **No hedging.** State real exceptions directly.
- **DRY.** A fact has one canonical home.
- **Concrete by default.** Pair an abstract contract with the smallest useful snippet, table, or diagram.
- **Renderer-owned layout.** Paragraphs are semantic units; the Markdown renderer owns wrapping.
- **Current, not historical.** Describe how Vanity works now. A document never narrates what a term used to mean, what was tried, or how the current shape was reached; a decision states what Vanity commits to, not what it moved away from. The changelog owns migration — the repository keeps no diary.

The naming law is:

> **A base term preserves the same useful inference everywhere it appears. Qualifiers may specialize that inference by domain, owner, state, representation, or relation; they may not rescue unrelated meanings.**

The test is predictive: after learning a term once, a reader should correctly infer something useful from every new compound containing it.

Names carry no history. Vanity keeps one canonical spelling per concept and ships no deprecated aliases, so a renamed concept leaves no trace of its former name in code, types, or documentation.

CSS owns CSS vocabulary. Vanity uses a CSS name only for the platform concept exactly. Vanity-specific behavior receives Vanity-specific language.

## 1. Behavioral spine

> **Grow a system additively; consolidate it; style with it.**

```text
portable descriptions + reusable contributions
                         │
                         │ define / add / mount
                         ▼
               persistent open system
                 ├─ immutable history
                 ├─ may keep growing
                 └─ may fork safely
                         │
                         │ consolidate
                         │ resolve policy · names · roots · layers · references
                         ▼
                  locked system
             + in-process system contract
                ┌────────┼───────────────┐
                │        │               │
         style authoring │        semantic observation
          + compiler     │         and interchange
                │        │               │
                ▼        ▼               ▼
          CSS artifacts portable      semantic map
          style handles contract      manifest
                        │             explain / audit
                        ▼             DTCG / DevTools
                 browser and SSR
                 restored handles
                 runtime controller
```

This is a branching projection graph, not a linear continuum:

- one open system may produce several locked forks;
- CSS, runtime data, manifests, explanations, and interchange are sibling projections;
- the browser evaluates CSS;
- the runtime controller changes only deliberately declared token slots and mode controls.

```TS
import { createSystem } from '@mszr/vanity'

const open = createSystem()
const locked = open.consolidate({
  prefix: 'app',
  root: '#app',
})
```

`ds` is the recommended local name at both system states. `open` and `locked` are explanatory names when both appear together.

## 2. Independent facets

No single lifecycle word classifies all of Vanity. Ask the exact question:

| Question | Facet | Examples |
| --- | --- | --- |
| What kind of semantic thing is it? | semantic kind | token, condition, axis, recipe, port |
| Who owns its meaning and lifetime? | ownership | engine, system, module, component, instance, build host, browser |
| Can system shape still grow? | system state | open, locked |
| How much context is attached? | binding state | portable, system-bound, resolved, restored, root-bound |
| What does it do? | effect | describe data, register shape, register style output, materialize an artifact, write DOM, observe |
| When does code execute? | execution time | authoring time, build time, runtime |
| Where does it execute? | execution environment | Node/build worker, SSR server, browser |
| What form is it in? | representation | in-process contract, portable contract, generated module, CSS, manifest |
| Has it been materialized? | materialization | in-memory representation, artifact |
| What job does a module perform? | module role | system, style, application, generated |
| How open is the choice space? | variability | finite declared choice, open value |
| What guarantees apply? | guarantee profile | typed, validated, raw standards, audited unsafe |
| What independent proof is required? | evidence dimension | runtime, type, editor, output, browser, integration, packaging, performance |

Use the facet name instead of a generic umbrella such as plane, lane, destination, phase, or stage. Those ordinary words remain valid when they name a precise local concept.

## 3. Actors, hosts, and mounting

```text
engine
  supplies constructors · operations · policies · extension capabilities
        │ powers
        ▼
system
  owns one project's accumulated design decisions and styling contract
        │ consumed by
        ▼
compiler
  evaluates build-time authoring and materializes CSS/data outputs
        │ projects
        ▼
runtime controller
  changes declared token slots and mode controls
```

The engine is Vanity's immutable capability kernel and an internal architectural boundary. `createSystem()` uses the default engine; users do not need a separate engine-construction step.

A host is a context into which a guest mounts and from which it receives policy, capability, or lifecycle participation:

| Host | Guests | Supplies |
| --- | --- | --- |
| system host | plugins, definition contributions, portable values | policy, registered shape, ownership, resolution context |
| build host | Vanity's compiler through a host adapter | module graph, build lifecycle, transforms, bundling, type hooks |

Vite, Nuxt, and WXT are build hosts. `/vite`, `/nuxt`, and `/wxt` are Vanity-owned host adapters. Integration names the activity or resulting relationship, not the adapter object.

## 4. System states and composition

| Term | Exact meaning |
| --- | --- |
| open system | Immutable system whose structural vocabulary can still grow through registration operations. |
| locked system | Immutable system whose structural vocabulary is closed and whose contextual names, references, roots, layers, policies, and identities are resolved. |
| consolidation | Pure transition that resolves deferred system context, validates the complete model, establishes identities, and returns a locked system. It emits no CSS and performs no I/O. |
| definition module | Detached immutable reusable definition data for one registrable kind. |
| plugin | Identified reusable contribution that can add shape and declare external requirements. |
| named system rule | Metadata-bearing system-owned rule contribution emitted once by the compiler; it may contain nested selector rules and at-rules. |

Composition verbs form an algebra:

| Form | Meaning |
| --- | --- |
| `create*` | create an identity-bearing API environment |
| `define*` / `*def` | describe a detached reusable definition |
| `add*` | register absent shape additively |
| `augment*` | fill an unset slot on existing shape |
| `overwrite*` | explicitly replace existing value-data without shrinking shape |
| `expect*` | require shape/capability supplied outside this definition without claiming ownership |
| `consolidate` | resolve deferred context and return a locked system |
| `*dec` | produce CSS declaration data |
| `$*` | fence Vanity-owned members beside user-owned names |

`defineRules`, `addRule(s)`, `overwriteRule(s)`, and `expectRule(s)` remain the symmetric system-composition family. `ds.rules()` authors selector rules inside a style module; receiver and context make the distinction.

## 5. Contracts, projections, artifacts, and handles

```text
locked system
      │ owns
      ▼
in-process system contract
  may contain build-only closures
      │ projects
      ▼
portable system contract
  validated data only
      │ compiler materializes
      ├──────────────┬───────────────┬───────────────┐
      ▼              ▼               ▼               ▼
portable JSON    CSS artifact    generated module    manifest artifact
artifact
      │ restoration
      ▼
restored handles + runtime-controller factory
```

| Term | Exact meaning |
| --- | --- |
| contract | Structured behavioral/data agreement consumed by another part of the system; it may exist only in memory. |
| in-process system contract | Locked build-time representation allowed to retain build-only closures. |
| portable system contract | Validated serializable data-only representation used for restoration and generation. |
| projection | Derived representation preserving selected meaning from a source contract. |
| artifact | Materialized build output such as CSS, JSON, a generated module, manifest, or package. |
| restoration | Reconstruction of a context-appropriate handle or service from portable data. |
| handle | Small context-specific usable interface/reference to a semantic subject or compiled output. |

The semantic subject persists; its contextual interfaces differ:

```text
token definition
      │ mounted into an open system
      ▼
logical token handle
      │ consolidation
      ▼
resolved token handle
      ├─ build-time styling use
      ├─ serialized/restored application or SSR handle
      └─ mutable token control inside a runtime controller
```

Do not describe one JavaScript handle as travelling between environments and gaining methods.

Canonical handle compounds:

- logical token handle;
- resolved token handle;
- restored token handle;
- class handle;
- keyframes handle;
- recipe handle;
- anatomy handle;
- atom-set handle;
- port handle.

Inside a runtime controller, a mutable token leaf is a token control, not a generic runtime handle.

## 6. Canonical semantic vocabulary

| Term | Exact meaning |
| --- | --- |
| CSS data type | Platform category such as `<color>`, `<length>`, or `<image>`. |
| expression | CSS-producing literal, function, calculation, reference, operation, composite, or raw value. |
| token | Named design decision, not necessarily a custom property. |
| token definition | Value, traits, axis values, registration, validation, and metadata before final name resolution. |
| token module | Definition module with graph references, axes, roots, and token-definition grammar. |
| condition | Typed AST describing selectors and conditional at-rules. |
| arm | One lowered conjunction of selector and at-rule conditions. |
| axis | Ordered set of intended alternative modes plus optional default and runtime-control metadata. |
| mode | Named condition within an axis. |
| root | Selector or scope owning a system/module token declaration. |
| policy | System-wide conformance, restriction, output, or support law. |
| constructor | System-extensible typed CSS value family. |
| portable constructor | Built-in top-level constructor whose system policy resolves when its value enters a system. |
| bound constructor | Corresponding `ds` constructor projected through that system's policies and authoring diagnostics. |
| const | JSON-serializable convenience data added to and read from a system. |
| util | Function contributed to the system; use a plain function unless registration is valuable. |
| surface | Members a thing exposes for reading or calling. |
| position | Place in CSS grammar that accepts a value. |
| dimension | Independent non-substitutable classification or proof axis. |

`theme` remains an application word. `scope` is reserved for CSS `@scope`. `override` remains cascade language; definition-data replacement is `overwrite`.

## 7. Styling vocabulary

```text
style data producer
  returns inert ordered declaration/rule data
        │ consumed by
        ▼
style emitter
  registers CSS output during style-module evaluation
        │ materialized by
        ▼
compiler
  emits CSS artifacts
        │ evaluated by
        ▼
browser
```

| Class | APIs | Effect |
| --- | --- | --- |
| style-data producers | `fragment`, `tdec`, `port.dec`, declaration bundles | return inert data; do not register or emit output |
| style emitters | `class`, `rules`, `raw`, `recipe`, `anatomy`, `atoms`, `keyframes`, `fontFace` | register style output while a style module is evaluated |
| restored resolvers | recipe, anatomy, atom-set, port, and other restored handles | select precompiled classes or produce declaration data; never synthesize arbitrary browser CSS |

Names state their result:

```text
class      → generated class handle/string
recipe     → finite class-selection function
anatomy    → part-keyed class-selection functions
atoms      → bounded utility-class resolver
fragment   → reusable ordered style data
rules      → authored selector rules
tdec       → token custom-property declaration data
keyframes  → animation-name handle
fontFace   → font-family handle
raw        → raw CSS in the declared layer
```

| Concept | Ownership and variability |
| --- | --- |
| recipe | finite component-owned choices |
| anatomy | finite choices across named component parts |
| atom set | finite declared property/value utility table |
| port | open component/style-owned per-instance input |
| mutable token | system-owned design decision with declared runtime-addressable slots |

Finite declared choice belongs in recipes, anatomy, or atom sets. An open per-instance value belongs in a port. A system-owned live decision belongs in a mutable token.

A fragment is ordered declaration/rule data with no class or selector of its own. A mixin is a normal TypeScript function returning a fragment or another styling input.

`ds.omit` means no declaration. CSS `unset` keeps its platform meaning.

## 8. Runtime vocabulary

The object returned by `ds.runtime()` is the runtime controller:

```TS
const rt = ds.runtime()

rt.t.color.brand.$set('#635bff')
rt.axes.scheme.$switchTo('dark')
```

The controller resolves/binds declared roots, validates and batches declared operations, snapshots its state, reconciles/hydrates snapshots, and inspects its own writes. It does not generate arbitrary CSS or calculate the full cascade.

Runtime mutation uses fenced verbs because they sit beside user token/axis/mode names. Build-time declaration producers do not:

```TS
port.dec(value)
ds.tdec({ color: { brand: value } })

rt.t.color.brand.$set(value)
rt.axes.scheme.$switchTo('dark')
```

Bare `runtime` keeps its temporal meaning in compounds such as runtime validation, runtime schema, runtime snapshot, runtime props, and runtime styles.

## 9. Module roles and integration vocabulary

| Module role | Purpose | Processing |
| --- | --- | --- |
| system module | creates, grows, and consolidates a system in plain TypeScript | evaluated by compiler/tools; replaced by projections in application graphs |
| style module | performs build-time styling authoring in `*.css.ts` / `*.css.js` | evaluated by Vanity's compiler; produces CSS contributions and serialized exports |
| application module | consumes style handles and runtime/application APIs | transformed by the build host; may execute in SSR or browser environments |
| generated module | carries compiler-projected browser, SSR, CSS, or metadata content | consumed by the build host/application |

A TypeScript program is a separate type consumer. It may include generated declarations even when no module receives an injected value.

```text
style-module pipeline
system module + *.css.ts
        │ compiler evaluates
        ▼
CSS contributions + serialized style exports

application-module pipeline
system/style imports
        │ build host transforms using adapter projections
        ▼
restored handles + runtime/application APIs
```

Configuration uses compact module-role keys:

```TS
{
  compiler: { system, layerOrder },
  autoImports: { shared, style, app },
}
```

`compiler` configures a Vanity-owned actor. `autoImports` configures import routing. `style` and `app` target their module roles; `shared` is shorthand for routing one source to both roles, not a third role.

## 10. Canonical file roles

```text
open-system.ts     create and extend the open system
*.tokens.ts        define portable or system-bound token modules
system.ts          add modules and consolidate; plain TypeScript
*.css.ts           emit classes, rules, recipes, anatomy, ports, and at-rules
component/app code consume serialized style handles and the runtime controller
```

A system must not be created or consolidated inside `*.css.ts`. The compiler serializes style-module exports; it diagnoses this mistake and points to a plain `system.ts`.

## 11. Public surface map

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
add{Kind} / add{Kinds}; addPlugin
augmentToken(s) / augmentAxis(es)
overwrite token(s) / axis(es) / condition(s) / const(s) / rule(s) / policy(ies)
expect tokens, axes, conditions, consts, utils, rules, plugins, constructors, policies
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
runtime / snapshotFrom / reconcileRuntimeSnapshot / runtimeStyle / runtimeProps
introspect / explain / audit
```

### Runtime controller

```text
t.<path>.$set / $unset
axes.<axis>.$switchTo / $cycle / $current
axes.<axis>.<mode>.$activate
refreshRoots / bindRoot / transaction
snapshot / hydrate / inspect
```

### Component/framework projections

```text
propsOf
usePorts
useAnatomy
fromTokenGroup
button.ports
namesOf / varsOf / tokensOf
```

The effective locked/public surface is authoritative: a member that appears only in a lower-level implementation type is not public API.

## 12. Token language

```TS
const palette = ds.defineTokens()
  .add('hue', 264)
  .add('brand', m => ds.oklch(0.6, 0.15, m.hue))
  .add(m => ({
    canvas: ds.oklch.from(m.brand, { l: 0.98 }),
  }))
```

`.add()` adds a literal/configured token, derived token, derived batch, or another builder. Every form merges additively.

Tree syntax uses `ds.tdef({...})` to distinguish a definition from a group. `.add(name, config)` accepts raw config directly because that position cannot be a group.

Every logical and resolved token handle exposes `$dec`. On a CSS-property leaf it declares that property; on a property/condition group it recursively projects themeable declaration data. `tdec` points the other direction: it assigns values to token custom properties.

## 13. Condition language

```TS
const wide = media({ width: { '>=': '60rem' } })
const interactive = selector('&:hover').or('&:focus-visible')
const inCard = scope('.card').to('.card-media')
```

Conditions are AST values with `.and`, `.or`, and `.not()`. Plain selector/query strings remain the raw standards escape. Strings are never preprocessed as a private Vanity dialect.

## 14. Import patterns

Three forms are blessed:

1. generated style/application auto-imports with exact ambient types;
2. `import * as de from '@mszr/vanity'` for definition modules;
3. explicit named imports.

There is no exported aggregate `de` object. Style modules should normally need only `ds`, whether explicitly imported or injected with exact generated types.

Hail is the only public preset:

```TS
import { hail } from '@mszr/vanity/presets'
```

`hail()` installs zero-output static authoring conveniences. Its ranges, semantic elevation, live controls, tokens, and rules are explicit options. The singular `/preset` entrypoint does not exist.
