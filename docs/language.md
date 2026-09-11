# vanity — language

Vanity's language follows its behavior. The mental model comes first; the glossary indexes it.

This guide defines reusable language and navigation. Owning reference specifications define exact APIs; maintainer records define implementation, evidence, and workspace practice.

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

Apply that rule to repository names, comments, assertions, and fixtures: describe the behavior a reader can use today and remove labels that only explain where a shape came from.

CSS owns CSS vocabulary. Vanity uses a CSS name only for the platform concept exactly. Vanity-specific behavior receives Vanity-specific language.

`$` is a namespace fence, not decoration. It appears on `ds.t.color.brand.$name`, `rt.t.color.brand.$set`, `$axes`, and fenced path keys such as `'$system'`. It does not appear on wholly Vanity-owned surfaces such as `rt.refreshRoots()` or `port.dec()`. User token, axis, and mode names may not begin with `$`. Nothing else is reserved merely for possible future use.

### Verb-first implementation names

Implementation functions, methods, and callable constants begin with a verb. These meanings are closed:

| Prefix | Meaning |
| --- | --- |
| `create*` | Construct a fresh instance or factory. |
| `define*` | Author portable, system-independent definition data. |
| `add*` / `augment*` / `overwrite*` | Add absent data, refine existing identity, or replace definition data. |
| `expect*` | Throw immediately at the call site unless a named structural element already exists; this is a stateless, order-sensitive existence guard that checks presence, not a particular value. |
| `get*` / `read*` | Retrieve in-memory data / cross an I/O, process, filesystem, or evaluated-module boundary. |
| `is*` / `has*` / `can*` / `should*` / `matches*` / `contains*` | Return a boolean predicate. |
| `assert*` / `require*` / `validate*` | Assert an existing invariant / require a value / produce validation evidence. |
| `normalize*` / `prepare*` / `apply*` / `update*` | Canonicalize / prepare a named next phase / apply a described transformation / update bookkeeping. |
| `parse*` / `format*` / `encode*` / `decode*` | Convert textual or interchange representations. |
| `serialize*` / `deserialize*` | Cross Vanity's portable value boundary. |
| `compose*` / `merge*` / `derive*` / `resolve*` | Combine compatible definitions / combine by a named policy / compute authored definitions / produce a semantically complete result. |
| `consolidate*` / `project*` / `restore*` | Resolve an open system / produce a consumer view / rehydrate portable data. |
| `copy*` / `clone*` / `freeze*` / `hash*` / `fingerprint*` | Perform the exact structural or identity operation named. |
| `visit*` / `walk*` / `compare*` / `sort*` / `order*` | Traverse / transform evidence / compare / deterministically order. |
| `bind*` / `mount*` / `install*` / `register*` | Bind / attach / install / register a capability or lifecycle participant. |
| `emit*` / `collect*` / `materialize*` / `build*` / `render*` | Produce CSS or another artifact / gather without resolving / construct an API surface / assemble a complete artifact / present output. |
| `prefix*` / `omit*` / `pick*` / `use*` | Apply the exact structural operation / consume a capability through a framework or runtime binding. |
| `$verb` | Runtime-controller mutation fenced beside user-defined names. |

When none of the grouped prefixes fits, choose a precise direct action verb whose name states the operation exactly—for example, `inspect*`, `compile*`, `fold*`, or `reorder*`. The [naming audit](../scripts/audit.ts) checks the complete implementation vocabulary; this document defines the rule rather than duplicating that changing list.

`expect*` is never deferred to consolidation. A plugin may expect a shape and use it in the next statement because the guard has already thrown or returned; recording a requirement for a later check would not provide that guarantee.

### Vocabulary owned by another contract

Not every public name is an implementation operation. Some spellings belong to a platform grammar, a host protocol, a public DSL, or a serialized data contract:

| Vocabulary owner | Naming rule | Canonical home |
| --- | --- | --- |
| CSS and web standards | Keep a CSS spelling when Vanity models that platform concept; give Vanity-only behavior a distinct name. | [Values](./reference/spec-values.md) and [styling](./reference/spec-css.md) |
| JavaScript and browser protocols | Mirror the protocol spelling at the boundary; do not rename it to satisfy the verb-first rule. | [Runtime](./reference/spec-runtime.md) and [integrations](./reference/spec-integrations.md) |
| Build hosts and backends | Mirror host lifecycle names in the adapter that implements them. | [Integrations](./reference/spec-integrations.md) |
| Public authoring DSL | Allow a result-named or noun-shaped callable when it names the thing the author is defining, composing, or querying. | The owning [reference specification](./README.md#reference) |
| Portable and introspection data | Use stable field and category names that describe data; they are not implementation verbs. | [Introspection](./reference/spec-introspection.md) and the relevant [system contract](./reference/spec-system.md) |

The naming allowlist in `scripts/audit.ts` is the exhaustive, machine-checked list of concrete exceptions. Maintain each exception with its owning contract and test; do not copy that inventory into this rulebook.

### Module names and load-bearing nouns

Module filenames describe ownership rather than the number of runtime instances:

| Shape | Use when | Examples |
| --- | --- | --- |
| plural | The module owns a collection or vocabulary of peer members. | `system/axes.ts`, `system/plugins.ts`, `values/codecs.ts`, `system/definitions.ts`, `tokens/names.ts`, `tokens/checks.ts` |
| singular | The module defines one model and the operations over it. | `values/kernel.ts`, `system/contract.ts`, `system/state.ts`, `runtime/controller.ts`, `tokens/builder.ts`, `tokens/module.ts`, `substrate/vanilla-extract/adapter.ts` |

A handle module defines what one handle is and how to create, read, and update it; handles live in the token graph and there is no handle registry. That is why the canonical filename is `tokens/handle.ts`, matching `atoms/handle.ts`, `ports/handle.ts`, and `recipes/handle.ts`.

These nouns carry precise architectural meaning:

| Term | Meaning |
| --- | --- |
| `module` | Portable authored definitions, or one of the documented source-module roles; not an arbitrary state facet. |
| `registry` | Keyed, identity-aware storage with lookup and collision semantics. |
| `kernel` | The smallest immutable bundle of semantic capabilities that must evolve as one compatible revision. |
| `context` | A narrow set of inputs passed to an operation; not an owner or a state container. |
| `environment` | Ambient execution surroundings; not a synonym for a value kernel or plugin setup context. |
| `runtime` | Behavior in the declared runtime controller or consumer runtime; token authoring and build-time resolution are not runtime. |
| `mode` | An axis case selected through the cascade; not a token trait, compiler branch, or generic variant. |
| `host` | Something that installs or runs another capability, qualified by scope. |
| `origin` | The declared owner of authored capability data. `provenance` is evidence of how a resolved result was produced. |

Collections are plural, booleans use predicate names, singular identifiers end in `Id`, and ordered revisions use their domain nouns. Avoid generic names such as `data`, `info`, `item`, `thing`, `manager`, and `helper` when the domain supplies a precise term.

### Validation has qualified meanings

`validation` is not a global policy switch. Every validation mechanism has a qualified owner and an explicit execution point:

| Sense | Owner | When it runs |
| --- | --- | --- |
| per-token `tdef({ validate })` | `tokens/` | while authoring a token value |
| port/runtime value validation | `runtime/controller.ts` | on `$set` and hydration |
| CSS grammar validation | `css/validation.ts` | while compiling authored CSS |
| external format validation | `system/contractValidation.ts`, `introspect/manifestValidation.ts` | while reading untrusted artifacts |
| constructor restrictions | `values/` | while constructing a value |
| `expect*` structural requirements | `system/open.ts` | immediately at the `expect*` call |
| `audit()` / diagnostics | `introspect/audit.ts` | on demand over a locked system |

Keep the sense visible at the use site. Do not introduce a bare `validate` or `validation` identifier whose meaning is unclear from its module, and do not route these mechanisms through a new generic validation switch.

Author-facing failures use `VanityError`, with a stable code and structured path/fix guidance; `TypeError` is reserved for a genuine internal invariant violation that indicates a Vanity bug.

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
| Who owns its meaning and lifetime? | ownership | Vanity, system, module, component, instance, build host, browser |
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

Use the facet name instead of a generic umbrella such as plane, lane, destination, phase, or stage. Those ordinary words remain valid when they name a precise local concept. In the token graph, `stage` names a private per-axis custom-property address used to preserve mutable fallback order; it is not a public lifecycle state.

## 3. Actors, hosts, and mounting

```text
Vanity package capabilities
  define portable values and authored modules
        │ add / augment / overwrite / expect
        ▼
open system
  owns one project's accumulated design decisions and styling contract
        │ consolidate
        ▼
locked system
  resolves names, references, roots, layers, policies, and identities
        ├──────────────┬───────────────┬───────────────┐
        ▼              ▼               ▼
CSS authoring     portable contracts  runtime controller
and compiler     and introspection    changes declared token slots and modes
```

Vanity is the design-system engine and TypeScript harness for CSS. Its internal value kernel keeps portable value semantics compatible; it is not a nested authoring object or a second construction workflow. Users create an open system directly with `createSystem()`.

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

Composition uses the canonical verb meanings in [§0](#0-house-style-and-naming-law): composition verbs form an algebra, but their definitions live in the house-style table.

System composition keeps singular/plural verb families symmetric for each registered kind. Styling rule authoring is a separate operation: its receiver and execution context distinguish it from system-level rule composition. See [system authoring](./reference/spec-system-authoring.md) and [styling and output](./reference/spec-css.md) for the concrete forms.

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

Do not describe one JavaScript handle as traveling between environments and gaining methods.

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
| value IR | Portable normalized representation of a CSS value expression that preserves its semantics, dependencies, and lowering requirements across system and build boundaries. |
| token | Named design decision, not necessarily a custom property. |
| token definition | Value, traits, axis values, registration, validation, and metadata before final name resolution. |
| token module | Definition module with graph references, axes, roots, and token-definition grammar. |
| condition | Typed AST describing selectors and conditional at-rules. |
| arm | One lowered conjunction of selector and at-rule conditions. |
| axis | Ordered set of intended alternative modes plus optional default and runtime-control metadata. |
| mode | Named condition within an axis. |
| root | Selector or scope owning a system/module token declaration. |
| part | Named element of an anatomy, with its own class and typed cross-part relationships. |
| policy | System-wide conformance, restriction, output, or support law. |
| constructor | System-extensible typed CSS value family. |
| portable constructor | Built-in top-level constructor whose system policy resolves when its value enters a system. |
| bound constructor | Corresponding `ds` constructor projected through that system's policies and authoring diagnostics. |
| const | JSON-serializable convenience data added to and read from a system. |
| util | Function contributed to the system; use a plain function unless registration is valuable. |
| surface | Members a thing exposes for reading or calling. |
| position | Place in CSS grammar that accepts a value. |
| dimension | Independent non-substitutable classification or proof axis. |

Color policy vocabulary is explicit: `mixSpace` supplies a missing `color-mix()` interpolation space, and `adjustSpace` supplies the working space for bare polar channel adjustments. Named polar namespaces state the working space at the call site and take precedence over `adjustSpace`.

`theme` remains an application word. `scope` is reserved for CSS `@scope`. `override` remains cascade language; definition-data replacement is `overwrite`.

## 7. Styling vocabulary

Styling has one important boundary: style data is inert ordered declaration/rule data, while a style emitter registers that data for compiler materialization. A restored styling handle selects precompiled output or produces declaration data; it does not synthesize arbitrary browser CSS.

```text
style data
  inert ordered declaration/rule data
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

The complete producer/emitter API table lives in [styling and output §1](./reference/spec-css.md#1-styling-families). This guide keeps the ownership rule:

| Need | Model | Contract |
| --- | --- | --- |
| finite component choices | recipe or anatomy | precompiled class selection |
| finite declared utility choices | atom set | bounded property/value space |
| open per-instance component value | port | component-owned custom-property boundary |
| live system-wide design decision | mutable token | system-owned runtime control |

A mixin is an ordinary TypeScript function that returns a styling input. An explicit omission removes a declaration; CSS `unset` keeps its platform meaning. See [styling and output](./reference/spec-css.md) for the concrete forms.

## 8. Runtime vocabulary

Runtime is the projection that writes declared custom-property slots and axis controls at declared roots. It validates and batches those operations, snapshots and restores semantic state, and inspects its own writes; it does not generate arbitrary CSS or calculate the full cascade.

| Term | Meaning | Canonical contract |
| --- | --- | --- |
| runtime controller | binds roots and performs declared DOM writes | [Runtime](./reference/spec-runtime.md) |
| token control | mutates a declared mutable token address | [Runtime §2](./reference/spec-runtime.md#2-token-tree) |
| axis control | activates or reads a declared axis mode | [Runtime §3](./reference/spec-runtime.md#3-axis-tree) |
| snapshot | semantic runtime state suitable for hydration/reconciliation | [Runtime §6–8](./reference/spec-runtime.md#6-snapshots) |

Runtime mutation uses fenced verbs because it sits beside user token, axis, and mode names. The exact mutation and snapshot APIs belong to the [runtime contract](./reference/spec-runtime.md). Build-time declaration producers remain ordinary styling inputs.

## 9. Module roles

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

Build-host configuration is an integration concern. `system`, `style`, `app`, and `shared` describe module-role routing; the exact configuration shape and host lifecycle hooks live in [integrations](./reference/spec-integrations.md).

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

This is a map of ownership, not an exhaustive API catalog. The owning reference contract documents concrete members, signatures, examples, and degradation behavior; this guide explains how the surfaces fit together.

| Surface | Responsibility | Read next |
| --- | --- | --- |
| Top-level authoring | Portable CSS values, conditions, detached definitions, and system creation. | [Values](./reference/spec-values.md), [conditions](./reference/spec-conditions.md), [system authoring](./reference/spec-system-authoring.md) |
| Open system | Additive composition, augmentation, explicit overwrite, requirements, token builders, and plugin mounting. | [Open and locked systems](./reference/spec-system.md), [tokens](./reference/spec-tokens.md), [extensions](./reference/spec-extensions.md) |
| Locked system | Resolved tokens, conditions, policies, style emitters, declarations, recipes, ports, and semantic observation. | [Styling](./reference/spec-css.md), [recipes](./reference/spec-recipes.md), [introspection](./reference/spec-introspection.md) |
| Runtime controller | Declared token slots and axis controls, roots, transactions, snapshots, hydration, and inspection. | [Runtime](./reference/spec-runtime.md) |
| Framework and build projections | Module-role routing, restored handles, ports, Vue/Nuxt adapters, and host lifecycle integration. | [Integrations](./reference/spec-integrations.md), [Vue and Nuxt](./reference/spec-vue.md), [ports](./reference/spec-ports.md) |
| Optional opinion | Hail's removable constructors, controls, presets, and global rules. | [Hail](./reference/spec-hail.md) |

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

Token handles project declarations toward CSS properties, while token-declaration data assigns values back to token custom properties. A graph-aware declaration can include build-folded dependents that a local substitution invalidates; live dependents remain browser-driven. The [token](./reference/spec-tokens.md) and [styling](./reference/spec-css.md) specifications define the concrete APIs.

## 13. Condition language

```TS
const wide = media({ width: { '>=': '60rem' } })
const interactive = selector('&:hover').or('&:focus-visible')
const inCard = scope('.card').to('.card-media')
```

Conditions are AST values with `.and`, `.or`, and `.not()`. Plain selector/query strings remain the raw standards escape. Strings are never preprocessed as a private Vanity dialect.

Color-scheme axis behavior and `schemeIs()` are documented in [Conditions §9](./reference/spec-conditions.md#9-scheme-convenience).

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
