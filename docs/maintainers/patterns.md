# vanity — patterns

These are behavioral laws, not utilities. Domain specs reference them rather than reinventing their meaning.

## Open, consolidate, project

`createSystem()` returns an immutable open system. Every `add*` call creates a new branch, `augment*` fills a declared unset slot, and user-only `overwrite*` replaces existing data without pretending to be ordinary composition. `consolidate()` resolves the branch into an immutable locked system and emits nothing.

The one semantic system then has two compiler representations:

- an in-process contract, which may retain build-only closures;
- a validated portable artifact containing data only.

Tools import the plain `system.ts` contract directly. Style modules execute the build contract. Browser and SSR graphs receive facades generated only from the portable data. Build closures never cross that boundary.

## Identity follows the consumer

One hash cannot answer four different questions. A consolidated system carries:

- compatibility identity for semantic composition and physical-copy dedup;
- CSS identity for system stylesheet ownership;
- runtime-schema identity for runtime/SSR projection;
- documentation identity for provenance and descriptive changes.

Paths and object identity never define semantic compatibility. A docs-only change must not rewrite CSS; a token-value-only change must not invent a new runtime schema.

## System CSS and style CSS have different lifetimes

The compiler emits one system virtual stylesheet per CSS identity and one style virtual stylesheet per source module. Every eager or lazy style may import the same system virtual ID; the module graph deduplicates it while retaining normal lazy splitting for per-style CSS.

Cross-system layer order belongs to a compiler-owned prelude injected before entry and lazy styles. Import order is not a cascade-order protocol.

## Failed compilation is state, not absence

The compiler tracks attempted entries and dependencies even when an initial transform fails. Failed work never replaces last-good CSS, portable data, or manifest bytes. A dependency repair retries on the same server, and successful artifacts replace prior bytes atomically and only when content changed.

## 1. Evaluate TypeScript; compile CSS

`*.css.ts` modules execute as ordinary TypeScript at build time. They are not restricted to expressions a static analyzer can reconstruct. Loops, imports, plugin functions, generated maps, and composition remain ordinary language behavior.

The result is CSS and inert handles. Importing a style module in application code must not execute build-time styling work.

## 2. Type names and data; parse CSS grammar

The type system owns:

- token/group/axis/mode/case names;
- CSS data-type compatibility;
- condition, layer, recipe, variant, part, and port names;
- extension identities and configuration structure;
- runtime setter input types.

CSS parsers and value constructors own:

- concrete grammar validity;
- broad raw-string validation;
- serialization;
- compatibility/maturity diagnostics.

Do not encode entire CSS grammars into template-literal types. Do not accept invalid CSS merely because its TypeScript type is `string`.

## 3. Keep the four dimensions independent

A value's data type does not imply a custom property. A custom property does not imply runtime mutation. Runtime mutation does not imply an axis. An axis does not alter the underlying data type.

Every implementation type should be explainable as a composition of:

```text
data type
+ expression/dependencies
+ representation/emission
+ variation/mutability
```

If an enum branch such as `live` or `scheme` starts controlling several of those dimensions, the model has regressed.

## 4. Preserve CSS unless folding is proven

Folding is a compiler optimization, not the meaning of the API.

- Literal arithmetic may fold when units and semantics are exact.
- Expressions depending on custom properties remain CSS expressions.
- Color operations preserve the platform form when gamut mapping, interpolation, missing components, or future browser behavior could differ.
- Unknown raw values never fold.
- A plugin may provide a fold function, but serialization remains the source of truth.

Build and live forms of the same public operation must have equivalent semantics or an explicit capability diagnostic.

## 5. Reference propagation is explicit

`reference: 'val'` and `reference: 'var'` describe how a token is consumed. Dependencies may force the safer representation:

- axes imply `var`;
- mutability implies `var`;
- a runtime-dependent derivation cannot pretend to be a build constant;
- a compile-only definition used in a media query cannot depend on a runtime custom property.

The zero-config token policy is `reference: 'var'` plus `emit: true`; this is a product default, not an inference from literal shape. Engines may configure another stable default. Optimizer/folding improvements must not silently change whether a shorthand token has a public custom property.

The compiler should explain the propagation path in diagnostics and `ds.explain()` output.

## 6. Root composition is visible

Every emitted token declaration has one effective root. Selector conditions state their relationship to that root with `&` or a typed placement helper.

At-rule conditions wrap the root. Selector conditions refine, precede, descend from, or explicitly replace it. No helper silently assumes descendant nesting merely because CSS nesting would.

The final selector/context appears in the manifest.

## 7. Axis precedence is policy, not source accident

The engine records axis declaration order and may override it explicitly after axes exist. The compiler emits:

```text
base
→ each axis in declared order
→ explicit multi-axis cases
→ token override classes/runtime public bindings
```

Cascade layers encode this order before any declaration is emitted. Module import order cannot change it. `consolidate({ axisOrder })` is optional; when present it is an exhaustive typed override, not a requirement imposed on the common one-axis case.

True axis modes are mutually exclusive. When trigger arms can overlap, the axis owns explicit trigger precedence; built-in scheme preference is lower than an explicit application choice.

## 8. Mutable values use browser-native indirection

A mutable token emits an internal custom-property slot for each addressable authored value. The public token property references the selected slot.

Runtime updates write slots on a concrete system root. They do not patch extracted rules or recompute the graph in JavaScript.

Rules:

- slots are emitted uniformly for every mutable token;
- slots remain inheritable/unregistered unless a proven reason requires registration;
- the public property is the only registered/consumer-facing property;
- `$unset()` removes the inline slot and restores stylesheet fallback;
- base, mode, and case setters share one serialization/validation path;
- mutable bindings target the effective token root so slot substitution occurs in the correct subtree.

Slot names are private implementation addresses. Runtime snapshots and batch setters identify a token path plus a semantic base/axis/case address, then resolve the current private name through system metadata.

Mode/case addresses are pay-for-what-you-author. Omitted branches do not become runtime setters accidentally; mutable `null` explicitly reserves a no-default address whose fallback restores the previously effective expression. Snapshot schema changes reconcile valid semantic addresses rather than discarding all persisted state.

## 9. Ports and mutable tokens solve different lifetimes

A mutable token changes a design-system decision for one bound system root. A port supplies a component/style's per-instance runtime input.

Use a mutable token for:

- user-customized brand/density/radius decisions;
- persisted application-level design settings;
- runtime editing tools over system tokens.

Use a port for:

- progress fractions;
- measurements or coordinates per component instance;
- a library component's published custom styling input;
- reactive values that are not design-system decisions.

Both write custom properties and share value serialization, but their ownership and discovery remain distinct.

## 10. Generic CSS capability remains available

`setCustomProperty(target, property, value)` from `@mszr/vanity/runtime` is the direct platform operation and may target vanity-owned or external properties. It requires an explicit target and does not imply token mutability.

Runtime selector-rule injection, if implemented, lives behind an explicit sheet object. Passing a selector must never ambiguously mean “query an element” in one API and “create a CSS rule” in another.

## 11. Capabilities and policies are separate

An engine plugin may define preferred units, aliases, ranges, or allowed inputs. Those are policy on the primary lane.

The standards/raw lane remains:

- standard CSS property names;
- valid raw CSS strings;
- raw typed future expressions;
- explicit unsafe escapes with auditable intent.

Strictness may change completion, diagnostics, or required annotations. It may not make a browser capability impossible.

Support targets are also policy, not wishful transpilation. A var-dependent expression outside target receives a proven CSS fallback/enhancement or an actionable diagnostic; vanity never silently freezes it or introduces hidden JS recomputation.

## 12. Extensions dogfood public contracts

Built-in values, operations, aliases, axes, scales, patterns, and utilities must be expressible through stable public extension points.

At minimum, extension authors need:

- a serialize-only typed value constructor;
- an optional exact fold operation;
- dependency and data-type declarations;
- style-fragment/pattern constructors;
- namespaces and collision diagnostics;
- optional manifest and DTCG codecs.

No public recipe should instruct users to subclass private IR classes.

Engine/plugin compatibility is structural and semantic. Stable protocol, policy, and plugin signatures survive HMR and duplicate package instances; JavaScript object equality is never a compatibility contract. Opaque extension semantics require an explicit stable identity, while nodes fully lowered to core IR are portable.

The flattened system namespace is versioned. Extensions prefer a distinctive top-level namespace, and a future core member cannot silently replace one.

## 13. Escape hatches degrade gracefully

The progression is:

```text
first-class typed helper
→ typed raw value/selector/at-rule
→ css.raw
→ explicit unsafe escape with reason
```

Each step retains as much typing, parsing, scoping, and provenance as possible. Unknown CSS should not force a user into an unrelated styling system.

## 14. Diagnostics are stable contracts

Every owned failure has:

- a stable `VANITY_*` code;
- the offending path/key;
- trustworthy file/line/column when source is available;
- one actionable message rather than an overload wall;
- a correction or nearest valid alternatives where enumerable;
- engine/plugin identity when incompatible values or modules are mixed.

Diagnostics for implicit behavior explain why it happened: reference propagation, axis precedence, root composition, folding refusal, runtime mutability, and export portability.

## 15. Provenance follows every projection

The graph records authored nodes once. Tokens, emitted declarations, runtime slots, DTCG nodes, names/vars projections, and devtools explanations point back to those nodes.

The manifest records declaration provenance rather than hardcoded light/dark fields:

```ts
const manifestToken = {
  path: ['color', 'brand'],
  type: '<color>',
  declarations: [
    { kind: 'base', val: '...', context: {/* ... */} },
    {
      kind: 'axis',
      axis: 'scheme',
      mode: 'dark',
      val: '...',
      context: {/* ... */},
    },
  ],
}
```

`ds.explain(token)` answers value source, dependencies, reference choice, folding decision, emission context, runtime slots, and portability from that same graph record.

## 16. Performance is part of DX

Type correctness that freezes completion is not delightful. Representative small, medium, and large graphs receive budgets for:

- cold `tsc` and declaration emit;
- incremental editor diagnostics;
- completion latency at token/axis/property sites;
- rename across composed modules;
- declaration-file size;
- manifest/build overhead;
- runtime helper and snapshot size.

Type-level convenience is accepted only with measured representative cost.

## 17. Evidence spans every plane

A feature is complete only when the applicable evidence is green:

- runtime semantics;
- type acceptance/rejection;
- editor completions, diagnostics, hover, and rename;
- emitted CSS and layer/selector order;
- browser cascade behavior;
- SSR/HMR/toolchain survival;
- manifest/provenance;
- packaging from the real tarball;
- performance budget.

One plane cannot stand in for another.

The consumer testing kit exposes the same law to design-system and plugin authors. Output capture owns a style-module callback, fold evidence owns an in-process build handle, rendered assertions own a mounted DOM fixture, and Selenita owns TypeScript editor observations. None pretends to prove another plane.
