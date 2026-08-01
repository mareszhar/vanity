# vanity — design principles

These rules are normative across every domain contract.

## North star — delightfulness

Every decision answers one governing question:

> **What would feel most delightful?**

Delight is not decorative polish after correctness. It is the combined experience of directness, capability, predictability, discoverability, excellent editor guidance, actionable diagnostics, inspectable output, fast feedback, and trust. When subordinate principles pull in different directions, choose the result that makes the complete authoring journey more delightful—not merely the implementation easier or one isolated call shorter.

The numbered laws below make that north star operational. None outranks it; none may be invoked to excuse an experience that is technically sound but needlessly confusing, noisy, brittle, slow, or hard to discover.

## 1. Naming law

CSS owns CSS vocabulary. Vanity uses a CSS name only for the platform concept exactly; algorithmic relatives receive distinct names.

| Form | Meaning |
| --- | --- |
| `create*` | create an API kit |
| `define*` / `*def` | describe a modular thing |
| `add*` | register a new name additively |
| `augment*` | fill an unset slot on registered data |
| `overwrite*` | explicitly replace existing data values without shrinking shape |
| `consolidate` | resolve and lock an open system |
| `expect*` | require host-provided shape |
| `*dec` | produce CSS declaration data |
| `$*` | Vanity-owned member sharing a namespace with user keys |

`$` is a namespace fence, not decoration. It appears on `ds.t.color.brand.$name`, `rt.t.color.brand.$set`, `$axes`, and fenced path keys such as `'$system'`. It does not appear on wholly Vanity-owned surfaces such as `rt.refreshRoots()` or `port.dec()`.

User token, axis, and mode names may not begin with `$`. Nothing else is reserved merely for possible future use.

## 2. Value law

Where a value of CSS data type T is accepted, a token handle of T is accepted.

This includes:

- CSS properties and descriptors;
- color channels;
- `calc()` operands;
- function arguments;
- token definitions and axis branches;
- ports and runtime setters;
- custom-property fallbacks;
- plugin and constructor inputs.

The user never writes a `{ var: token.$var() }` adapter just to make a compatible token usable.

Compatibility survives every composition boundary. A logical, locked, mutable, or external handle and a typed calculation remain graph values when they enter a color channel, relative-color component, constructor family, or plugin utility. They never fall through JavaScript string coercion.

Relative channel operations are immutable typed expressions. Chaining `channel.subtract(pivot).multiply(-1000)` preserves the channel's data type, dependencies, liveness, support requirements, and source provenance.

Every property lane also accepts CSS-wide keywords: `initial`, `inherit`, `unset`, `revert`, and `revert-layer`. Typed helpers may add other grammar-specific keywords such as `none`. A parity matrix, not per-parser folklore, enforces this.

## 3. Context law

A top-level export must satisfy all three:

1. its authored meaning is portable, even if a host policy resolves an intentionally abstract choice later;
2. its family is closed to user extension;
3. it describes data resolved at a contextual use site instead of emitting or mutating state.

Otherwise it belongs on `ds`.

Top-level examples:

- `createSystem`, `definePlugin`, portable `defineTokens`;
- built-in portable constructors such as `length`, `oklch`, and `calc`;
- condition constructors and anchors: `data`, `media`, `supports`, `container`, `selector`, `condition`, `scope`, `systemRoot`, `moduleRoot`, `thisMode`;
- pure collection helpers: `range`, `fromEntries`, `mapRecord`;
- the low-level runtime escape.

System-bound examples:

- policy-projected bound forms of built-in constructors;
- user-defined constructor families, which do not exist before registration;
- emitters such as `class`, `rules`, `recipe`, and `raw`;
- `t`, `consts`, `port`, `runtime`, `tdef`, `tdec`, and `omit`.

The namespace import `import * as de from '@mszr/vanity'` is the blessed description form. Vanity does not export a synthetic `de` object.

Portable and bound built-ins carry the same runtime value brand. The difference is authoring context: portable construction cannot know a restriction, while `ds` can surface that policy at the call site.

## 4. Policy law

A policy is system-wide law, not an option bag or a way for plugins to mutate the host.

- conformance policies adapt unresolved values at the system boundary;
- restriction policies attach diagnostics and never subtract API shape;
- portable values acquire host policy when mounted/consolidated;
- bound values expose restriction diagnostics immediately;
- prospective enforcement covers contributions after the restriction;
- retroactive enforcement scans the complete graph;
- explicit-unit values such as `length.px(8)` are policy-immune;
- `createSystem(config)` is exactly the initial policy book;
- plugins may require host policy and may register data about their own configuration, scoped automatically under their identity, but may not author global user policy.

Policy groups are additive shape. Overwrite is explicit value replacement. Every policy decision appears in identity, provenance, introspection, and diagnostics.

## 5. Additive law

`add*` creates names and never redefines them. A duplicate fails at the cursor when possible and at build otherwise, naming both owners.

Three distinct operations remain distinct:

- `add*` requires absence;
- `augment*` requires presence and an unset destination slot;
- `overwrite*` requires presence and may replace values or grow shape, but never shrink it.

Plugins cannot overwrite. Only the user's visible open-system chain has `overwrite*`.

Registration grammar is symmetric by default:

- every registrable data kind has a detached `define*` module;
- every valid system verb has singular and plural forms;
- value-producing verbs accept a direct value or accumulated-system callback;
- plural forms accept a record, callback, module, or independent module array;
- every detached builder uses one scoped `.add()` grammar;
- plugins are the principled singular exception because their identity is intrinsic.

Atomic data has no `augment` verb. Functions and constructors have no `overwrite` verb. Those absences protect meaning rather than weaken symmetry.

Utility namespaces merge recursively, but duplicate leaves and namespace/function collisions fail at the complete path.

## 6. Lifecycle law

One semantic handle gains capabilities across phases:

| Phase | Token handle capability |
| --- | --- |
| open system | logical path, type, traits, provenance |
| locked system | resolved name, `var()`, value preview, emission metadata |
| runtime | `$set`/`$unset` on mutable addresses |

Stage misuse receives a designed message with the correct sibling API. It never falls through to `undefined is not a function`.

## 7. CSS preservation law

Folding is an optimization, not the API's meaning. Preserve platform expressions unless equivalence is proven under the configured support policy.

Unknown or future syntax stays raw and auditable. Unsupported dynamic syntax receives a proven fallback/enhancement or an actionable diagnostic; Vanity never freezes it silently or adds hidden JavaScript recomputation.

## 8. Ordered contribution law

Styling arrays are ordered contribution sequences, not deep merges. They preserve repeated declarations, nested rules, conditional arms, and browser-fallback order in a lossless rule IR.

CSS cascade semantics decide collisions after lowering. JavaScript object-spread semantics never silently erase conditional siblings in the canonical array form.

Named system rule groups are system-owned contributions. They emit once, order by layer and then registration order (with explicit `order` as an escape), retain metadata/provenance, and remain selectable/introspectable before lowering.

## 9. Ownership law

- A mutable token changes a design-system decision at its owning root.
- A port supplies a per-instance component/style input.
- A condition describes when CSS applies.
- An axis names intended alternatives and their deterministic precedence.
- A layer decides cascade precedence.
- The compiler owns emission.
- The browser owns live cascade and inheritance.
- A plugin owns only axes and rule/util/constructor shape it explicitly adds; `expect*` names host-owned dependencies honestly.

No API blurs these lifetimes for convenience.

## 10. Diagnostic law

Every owned failure:

- names the thing;
- identifies the authored place;
- explains the cause;
- gives the concrete fix;
- states temporal ordering when order matters;
- carries a stable code and structured fields;
- exposes a clickable author frame rather than only embedding locality in message text;
- wraps substrate errors.

Prefer cursor diagnostics. Build-time diagnostics are the fallback, not an excuse for worse wording.

Overloaded convenience never excuses whole-call squiggles when TypeScript can identify the offending name, value, mode, member, or policy field. Completion, hover, and error ranges are part of the API.

## 11. Provenance law

Authored facts are recorded once and projected into tokens, declarations, styles, runtime schemas, DTCG, manifests, explanations, audits, and agent context. Overwrites and augments append history; they never erase authorship.

## 12. Extension law

Built-ins dogfood public contracts. Plain functions are the default extension mechanism. Plugins exist for structural requirements, registered namespaces, identities, and portable/compiler participation.

Detached modules are the unit of portable authored data. A callable constructor family may expose any typed call-like members; those members are build-plane closures and must lower before the portable boundary. Plugins use the same public modules, policies, rules, requirements, and constructors as users—there are no private capability escape hatches.

Closures may exist only in the in-process build contract. They are executed or lowered before the portable artifact boundary.

## 13. Evidence law

Every feature is proven on every relevant plane: runtime, type, editor, output, conformance, browser, integration, packaging, introspection, documentation, and performance.

No plane stands in for another. Release evidence matches the behavior it claims.
