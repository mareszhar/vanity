# vanity — runtime

The runtime changes declared custom-property slots and axis controls. It does not reconstruct the graph, inject component styles, patch extracted rules, or compute design relationships in JavaScript.

```text
locked system ── projects ──▶ runtime-controller factory
                                      │ creates
                                      ▼
                              runtime controller
                                ├─ binds declared roots
                                ├─ writes declared token slots
                                ├─ activates declared modes
                                └─ snapshots/reconciles its state
                                      │
                                      ▼
                                  DOM roots
                                      │
                                      ▼
                          browser-owned CSS cascade
```

The browser evaluates CSS. The controller changes only degrees of freedom declared by the system.

## 1. Construction and roots

```TS
const rt = ds.runtime()
```

The locked system already knows every root. Runtime construction:

- accepts no repeated selector/element for the normal case;
- resolves system and module roots lazily on first use;
- remains DOM-free until resolution;
- supports `ds.runtime({ within: element })` to scope the declared selectors;
- supports `rt.bindRoot(path, element)` for one repeated root instance;
- never accepts a replacement selector string.

`rt.refreshRoots()` resolves all roots. `rt.refreshRoots('$system')` or a module path refreshes one. Framework adapters call it on mount.

Mode operations broadcast to every root carrying that axis. Mutable token writes target the one element owning that token's declaration root; ambiguity receives a diagnostic and asks for `within` or `bindRoot`.

## 2. Token tree

```TS
rt.t.color.hue.$set(275)
rt.t.color.hue.$unset()
```

Only mutable addresses expose these verbs.

`$set`:

- accepts the token's CSS data-type inputs and handles;
- validates and serializes through the common value layer;
- writes the private inline slot at the owning root;
- updates semantic snapshot state;
- never writes the public property rule or recomputes dependents.

`$unset` removes the inline slot and restores authored CSS.

Private slot names remain opaque. Snapshots store token path plus semantic base/axis/case address.

## 3. Axis tree

```TS
rt.axes.scheme.$switchTo('dark')
rt.axes.scheme.$cycle({
  exclude: ['contrast'],
})
rt.axes.scheme.$current()
rt.axes.scheme.dark.$activate()
```

Contracts:

- `$switchTo` is the only general setter;
- mode arguments include only activation-capable modes;
- `$activate()` is no-argument sugar for that mode;
- `$cycle()` follows mode order, wraps, and skips exclusions;
- `$current()` reads through activation metadata/adapter;
- multiple roots return a mode only when unanimous;
- disagreement returns `undefined` and a dev diagnostic naming roots;
- unknown effective media state is reported honestly;
- cycling from unknown begins at axis default, then first mode;
- runtime never parses authored selectors.

`setMode`, `clearMode`, and boolean `$activate(false)` do not exist because their names make false promises for `&`-conditioned modes.

For unusual axes, `axis({ control })` or the direct `addAxis()` config may declare `{ id, read(root), activate(root, mode), project?(mode) }`. The stable `id` and optional data-only style/attribute projections enter the portable runtime contract; closures do not. An in-process locked system binds its control automatically. A restored application-system projection receives the same implementation explicitly through `runtime({ controls: { [id]: control } })`, just as Standard Schema validators cross the boundary by stable ID. A control adapter makes every declared mode activatable and remains responsible for honest reads. A custom control that affects first paint supplies `project`; otherwise SSR projection stays honestly empty for that custom effect. Changing control semantics requires a new `id`; reusing an id promises the same read/activate/projection contract across compiler and application environments.

## 4. Root targeting

Mutable writes must occur on the token's owning root. Writing a module-owned slot on the system root can be shadowed and silently ineffective; Vanity prevents that.

Mode controls intentionally broadcast because selection may need to be synchronized across system and module roots.

A runtime scoped with `within` or pinned with `bindRoot` provides per-instance certainty for repeated widgets and shadow/micro-frontend contexts.

## 5. Transactions

```TS
rt.transaction(tx => {
  tx.t.color.hue.$set(275)
  tx.axes.scheme.$switchTo('dark')
})
```

Exact guarantee:

1. every input validates and serializes before the first DOM write;
2. validation failure performs no writes;
3. successful operations produce one snapshot/history entry.

This is validation atomicity, not rollback after an exceptional DOM failure.

`transaction()` batches handle writes:

```TS
rt.transaction(tx => {
  tx.t.space.control.$set('1.25rem')
  tx.t.shadow.card.$axes.density.compact.$set('none')
})
```

Use the same handle path inside and outside `transaction()`. This retains validation-before-write and semantic snapshots without maintaining a second mutation language.

## 6. Snapshots

```TS
const snapshot = rt.snapshot()
const seed = ds.snapshotFrom(next => {
  next.t.color.hue.$set(275)
})
```

Snapshots contain:

- protocol version;
- runtime schema ID;
- canonical mutable token addresses and serialized values;
- runtime-managed modes;
- no private slot names, DOM references, untouched graph values, or generic custom-property writes.

The portable runtime-contract protocol is `2` for declared multi-root metadata. The semantic snapshot protocol remains `1`: its token-path/address records already survive root and private-slot changes.

`snapshotFrom()` is DOM-free and uses the same validation/serialization/semantic address model as a live runtime.

`snapshotFrom(configure, options)` creates no document/element dependency, accepts the same typed base/axis/case setters and axis tree as the live runtime, runs the same validation policy, and returns the versioned semantic snapshot.

## 7. Hydration and reconciliation

`hydrate(snapshot)` and system SSR projections:

- validate protocol shape;
- compare runtime schema ID;
- reconcile known semantic entries on schema mismatch;
- keep valid additive changes;
- skip removed, unauthored, type-incompatible, or invalid entries with structured diagnostics;
- reject the whole document only when the snapshot protocol is unreadable/unsupported;
- avoid redundant writes when SSR inline state already matches;
- preserve valid runtime state across compatible HMR;
- mark superseded controllers stale so they cannot mutate behind the current runtime.

Schema mismatch triggers per-entry reconciliation, not wholesale state loss. Unsupported snapshot protocols reject before any state is applied.

## 8. SSR projections

The portable runtime artifact produces root attributes/styles without DOM access:

```TS
const result = ds.reconcileRuntimeSnapshot(snapshot)
const props = ds.runtimeProps(result.snapshot)
const style = ds.runtimeStyle(result.snapshot)
```

`runtimeProps()` returns a deterministic record keyed by `'$system'` and module-root paths. Each entry contains the attributes and style declarations for matching server-rendered roots. A single-root adapter may project the `'$system'` entry directly. `runtimeStyle()` is the style-only projection over the same result, and `reconcileRuntimeSnapshot()` remains the explicit DOM-free migration/validation surface.

Named/mounted modules use their dot-separated mount path. A rooted module mounted at the token top level has no authored module path; its deterministic fenced fallback (`$root0`, `$root1`, …) is visible through `inspect().roots` and the projection keys. Applications should prefer named mounting whenever a root will be bound directly.

These capabilities preserve:

- semantic snapshot validation;
- style map for opaque slots;
- runtime-managed root attributes;
- multi-root projection;
- first paint matching client hydration;
- request-local validator binding;
- no client graph recomputation.

`rt.hydrate(snapshot)` applies the reconciled result to live roots. It never writes a mismatched snapshot blindly.

## 9. Validation

Optional Standard Schema contracts:

- cross build/application boundaries by stable `id`, not function serialization;
- default to `runtime: 'dev'` and `onInvalid: 'throw'`;
- reject async schemas for synchronous APIs;
- serialize transformed output only after CSS data-type validation;
- bind validator implementations explicitly in app/SSR code;
- never use process-global mutable registries.

Transactions validate all values before writes.

## 10. Generic custom-property escape

From `@mszr/vanity/runtime`:

```TS
setCustomProperty(element, tokenOrProperty, value)
setCustomProperties(element, entries)
```

The property input accepts:

- `` `--${string}` ``;
- `{ $name }`;
- `{ name }`;
- a token/custom-property handle directly.

This escape works for external or Vanity-owned custom properties, does not require token mutability, does not enter the system snapshot, and explicitly targets one element.

Serialization prevents `"[object Object]"` mistakes for branded values.

## 11. Ports

Ports remain per-instance declaration fragments, not runtime objects that write DOM:

```TS
port.dec(value)
```

Framework binding performs the write. Runtime tokens and ports share CSS serialization and validation infrastructure, not ownership or discovery.

## 12. Inspection

`rt.inspect()` reports:

- runtime/schema identity;
- resolved/bound roots;
- explicit overrides;
- mode state and disagreements;
- reconciliation/validation diagnostics;
- stale/superseded status.

It never claims to reproduce the browser's complete computed cascade.

## 13. Evidence

- system/module/repeated/shadow roots and correct slot ownership;
- lazy resolution, refresh, within, and binding;
- set/unset for base and authored branch addresses;
- mode switch/cycle/current/activate typing and DOM behavior;
- broadcast and disagreement;
- `transaction()` zero-write validation failure;
- DOM-free seed snapshots;
- snapshot/SSR/hydration no-flash round trip;
- additive reconciliation and unsupported protocol rejection;
- compatible HMR rebinding and stale controller failure;
- Standard Schema policies and request isolation;
- generic HTML/SVG custom-property writes;
- runtime and metadata size budgets.
