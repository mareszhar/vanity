# vanity — spec: open and locked system

Vanity itself is the design-system engine. The public lifecycle has two stages: an immutable open system accumulates capabilities, and `consolidate()` returns an immutable locked system that styles and binds runtime behavior.

```ts
import { createSystem } from '@mszr/vanity'

const open = createSystem({ length: { unitless: 'rem' } })
  .addTokens({
    color: { brand: '#635bff' },
    space: { md: '1rem' },
  })
  .addConditions({
    selected: '&[data-selected]',
  })
  .addConsts({
    product: 'docs',
  })

export const ds = open.consolidate({
  prefix: 'app',
  root: '#app',
})
```

> Grow a system additively; consolidate it; style with it.

## 1. Open-system contract

`createSystem()` accepts the system-wide value and token policy:

- CSS support policy;
- default unit behavior;
- default token reference and emission policy;
- color, validation, and project semantic policy.

It returns value constructors plus only open-stage operations. Emitters, runtime binding, and resolved token names are absent from the type surface. `tdec` is present because it produces prefix-independent declaration data for open-stage plugin utilities; it does not emit. Runtime property access to a locked-only method returns a designed throwing stub, so JavaScript misuse reports the correct lifecycle rather than `undefined is not a function`.

Every operation is immutable. A base may safely produce many independent branches and locked systems:

```ts
const base = createSystem().addTokens({ color: { brand: 'red' } })

const stable = base
  .addConsts({ channel: 'stable' })
  .consolidate({ prefix: 'stable' })
const next = base.addConsts({ channel: 'next' }).consolidate({ prefix: 'next' })
```

No call mutates `base`, another fork, or process-global system state.

## 2. Add, augment, overwrite, and expect

These verbs are different contracts.

### 2.1 Add

The additive families are:

- `addTokens`;
- `addAxis` and `addAxes`;
- `addConditions`;
- `addPlugin`;
- `addConsts`;
- `addUtils`.

An `add*` operation requires the destination name or token path to be absent. Duplicate additions fail at the input in TypeScript where possible and through a local runtime diagnostic otherwise.

`addTokens` accepts a raw token graph, a unified token builder, or a callback over the open system. `open.defineTokens()` supplies the system-bound four-form `.t` builder and `tdef`; top-level `defineTokens()` creates a plain-value portable module. Each contribution carries its own requirements, and the composed system validates them at the point of use. The complete token contract is [spec-tokens.md](./spec-tokens.md).

### 2.2 Augment

`augmentTokens` fills only a known unset base or axis branch. It rejects:

- unknown token paths;
- already-filled values;
- shape replacement disguised as augmentation.

Augmentation preserves the registered token's path, handle identity policy, type, traits, existing branches, requirements, and ownership. Its callback target exposes only legal `val`, axis-name, and `$axes` destinations.

### 2.3 Overwrite

The user-visible open chain may explicitly call:

- `overwriteTokens`;
- `overwriteAxis`;
- `overwriteConditions`;
- `overwriteConsts`.

Overwrite requires an existing destination. It is unavailable to plugin setup, and there is no overwrite for utilities or constructors. Every overwrite is recorded in portable provenance with its kind, affected paths, and authored source when available.

### 2.4 Expect

`expectTokens`, `expectAxis`, `expectPlugin`, and `expectConstructor` express temporal structural requirements. Token requirements may name paths and require data type, mutability, reference, and emission traits; axis requirements may require exact mode subsets. Extra host shape is allowed.

Requirements called inside plugin setup are carried in the plugin type. They must already be satisfied at the plugin's `.addPlugin()` position. Type failures remain local to that call; runtime failures name the plugin and the missing capability and explain that the supplying `add*` call must move earlier. The full contract is [spec-extensions.md](./spec-extensions.md).

## 3. Logical and resolved handles

`open.t` is a logical read surface. Its handles expose:

- `$phase: 'logical'`;
- semantic `$path`;
- CSS `$type`;
- reference, emission, and mutability traits;
- description, deprecation, and metadata.

They deliberately do not expose a final custom-property name or `var()` reference because prefix, root, layers, and final graph resolution belong to consolidation.

`locked.t` contains resolved handles. It adds the final `$name`, `$var()`, resolved/default value information, branches, and emission/runtime metadata. The runtime projection later decorates mutable semantic addresses with `$set`/`$unset`.

Token-module `.refs` are lazy module-relative handles. They rebind at each mount, including inside expressions, while `open.t` addresses the accumulated mounted graph and `locked.t` owns final CSS identity.

## 4. Config, consts, and utilities

Configuration changes how Vanity resolves or emits the system. It belongs in `createSystem()` or `consolidate()` options and participates in the appropriate semantic identities.

Constants are JSON-safe authored data exposed through `open.consts` and `locked.consts`. `addConsts` and `overwriteConsts` validate finite, cycle-free, data-only values. Constants are portable and may participate in the runtime facade.

Utilities are functions added with `addUtils`. They remain in the in-process contract and locked build/tool surface; functions are rejected at the portable JSON boundary. There is intentionally no utility overwrite.

## 5. Consolidation

`open.consolidate(options?)` resolves:

- token names, references, dependencies, branches, registrations, and runtime addresses;
- normalized conditions and condition arms;
- axes and deterministic order;
- system prefix, selector/scope roots, module-root inheritance/escape, layers, and token sublayers;
- extension identity and policy;
- overwrite provenance;
- four normalized projection identities.

It then returns a deeply immutable locked system.

Axis declaration order is the default. `axisOrder` may be supplied once in the consolidation options and must list every axis exactly once. Typed `systemRoot`, `moduleRoot`, and `thisMode` anchors resolve only in their valid system/module/mode contexts.

Consolidation is pure with respect to CSS and files:

- it requires no Vanilla Extract file scope;
- it emits no CSS;
- it performs no I/O;
- it registers no global system;
- it can run in an ordinary Node tool;
- it may be called many times to create independent locked forks.

Calling `consolidate()` from a `*.css.ts` file is a dedicated error: `VANITY_SYSTEM_IN_STYLE_MODULE`. The fix is to move the chain to a plain `system.ts` and import the locked result.

## 6. Locked-system contract

The locked surface contains resolved reads and build and runtime families:

- `t`, configured value constructors, constants, and added utilities;
- `class`, `rules`, `raw`, `fragment`, `omit`, `tdec`, keyframes, font faces, recipes, anatomy, ports, atoms, `inLayer`, and token projections;
- runtime binding, DOM-free `snapshotFrom`, reconciliation, runtime style, and runtime props;
- normalized conditions and layers;
- `introspect()`.

Open mutation methods are absent from completion and type surfaces. Runtime access receives a lifecycle-specific throwing stub.

The shared emitter grammar, ordered rule IR, layers, and raw placement are documented in [spec-css.md](./spec-css.md). Recipes/anatomy and ports retain their detailed contracts in [spec-recipes.md](./spec-recipes.md) and [spec-ports.md](./spec-ports.md).

Conditions, roots, axes, range queries, `@scope`, and `colorSchemes()` are documented in [spec-conditions.md](./spec-conditions.md).

## 7. In-process and portable forms

The locked object owns a private immutable in-process contract:

```ts
interface VanityInProcessSystemContract {
  readonly portable: VanityPortableSystemV1
  readonly emit: () => void
}
```

The emission closure is compiler-only. The portable value is validated, cycle-free JSON data with format discriminator `vanity.system/1`. It contains normalized policies, extensions, axes, conditions, token restoration data, token semantic records, runtime contract, constants, ownership, provenance, and four identities. It contains no functions. This interchange form is private compiler restoration data rather than the public tool schema.

`ds.introspect()` projects that contract into the normalized, versioned `vanity.introspection/1` semantic map. Manifest v3's primary `system` field is byte-order/deep-equal to that map. The compiler continues to write the separate portable artifact under `.vanity/systems/` when app/SSR restoration needs it; tools never need to interpret its private handle records.

## 8. Four identities

| Identity | Includes | Excludes | Consumer |
| --- | --- | --- | --- |
| compatibility | policy, extension identities, token/axis/condition shape, ownership | token values, docs, object/path identity | composition and duplicate-package resolution |
| CSS | namespace, layers, roots, emitted token values/branches/registration | docs and runtime-only behavior | one system CSS virtual module |
| runtime schema | semantic runtime contract, app-visible consts, required handle projection | docs and build-only CSS values | browser/SSR facade |
| docs | descriptions, metadata, provenance, authored source | CSS/runtime implementation | manifest/documentation revision |

A token-value-only change leaves compatibility, runtime-schema, and docs identities stable. A description-only change changes only docs identity. Physical copies with equal normalized semantics deduplicate even when object and source identities differ.

## 9. Compiler projection

The Vite integration accepts one or more plain system entries:

```ts
vanityPlugin({
  system: './src/system.ts',
  cascade: ['vendor', 'app'],
})
```

For a style transform the compiler executes the full in-process contract, emits its system declarations once under a virtual module keyed by CSS identity, and emits style declarations under a virtual module keyed by source. Eager importers share system CSS; a lazy style retains only its own async CSS.

For ordinary browser and SSR imports of the configured `system.ts`, Vite replaces the source with a facade generated from portable data. The source module, authoring closures, compiler, Vanilla Extract, and Node-only code never enter those graphs.

A compiler-owned cascade prelude is emitted as the first stylesheet.

## 10. Package projection

A design-system package ships two adjacent products:

1. ordinary built JavaScript retaining the full build contract for downstream style compilation;
2. portable JSON for browser, SSR, manifest, and tooling projection.

The Vite `system` option accepts:

```ts
const packagedSystem = {
  entry: './dist/system.js',
  artifact: './dist/system.vanity.json',
  packageName: '@acme/design-system',
}
```

The compiler evaluates the build JS and compares all four identities with the portable artifact. A mismatch names the package and requires a rebuild; it never silently projects a stale pair.

Artifacts are written atomically and only when bytes change.

## 11. CSS ownership and duplicate installs

Two systems may not claim the same prefix/root/layer namespace with different CSS identities. The compiler reports both owners and fingerprints.

Semantically identical physical package copies are valid. Compatibility plus runtime identity selects one facade; CSS identity selects one system stylesheet. Source path and object reference never prevent deduplication.

## 12. HMR and last-good state

The compiler records:

- every attempted system and style entry;
- successful dependency graphs;
- dependencies discovered from failed builds;
- resolved runtime virtual modules;
- last-good CSS, portable artifacts, and manifest records.

Success → dependency error → repair and first-request error → dependency repair both recover on the same server. A failed attempt never replaces last-good bytes. On repair, affected style entries and runtime facades invalidate and re-evaluate.

## 13. Evidence

Permanent release evidence:

- runtime/type/DX lifecycle suites in `sdk/src/system/openSystem.*`;
- projection, SSR, package-pair, duplicate-copy, namespace-collision, and closure-exclusion suites in `sdk/src/system/projection.test.ts`;
- both HMR recovery orders over the plain-system canary in `sdk/src/system/projection.test.ts`, plus stable CSS IDs and style-module suffix validation in `sdk/src/vite.test.ts`;
- the permanent `sandbox/canary` app with a plain system, two eager styles, one lazy style, mutable token, activatable axis, DOM-free SSR seed, manifest, pure introspection/explanation, and compiler-first cascade prelude;
- emitted package declarations and the public-surface absence test;
- the type-accumulation, system-scale, system-package, and compiler-projection spikes.
- the unified token behavior/type/DX/output/rename/scale suites described in [spec-tokens.md §13](./spec-tokens.md#13-evidence);
- the condition algebra, root/scope, axis-order, introspection, and Chromium canary evidence described in [spec-conditions.md §13](./spec-conditions.md#13-evidence).
- the styling rule-IR, recipe/anatomy, port/atom, plugin, property-alias, and Hail suites described by their owning specifications.
