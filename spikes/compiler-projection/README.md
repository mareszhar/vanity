# Spike: compiler-owned contract projection

A **library-agnostic** proof that one plain contract module can serve build-time style authoring, a browser bundle, DOM-free SSR, and ordinary tools while the compiler emits contract CSS exactly once.

Nothing here imports the product. The spike implements the smallest neutral `consolidate()` contract, compiler worker, and Vite virtual-module projection needed to prove the compilation model on its own.

## Verdict

**The pattern is viable.** A consolidated in-process contract can retain build-only closures without leaking them into client or SSR graphs, provided the compiler establishes a hard portable-data boundary and owns every emitted artifact. CSS deduplication, lazy CSS splitting, HMR error recovery, semantic cross-instance identity, precompiled package consumption, tree-shaking, and identity-specific invalidation all pass as executable assertions.

## Run it

```sh
cd spikes/compiler-projection
pnpm install --ignore-workspace
pnpm run check
pnpm run test
# or both:
pnpm run validate
```

The worker relies on Node's built-in type stripping, so the package declares Node 22.18 or newer.

Every compiler subprocess has an 8-second timeout and 1 MB output limit. Static dependency discovery is capped at 64 files. The scale fixture is capped at 16 style modules (12 eager, 4 lazy), and Vitest caps every test/hook at 60 seconds.

## Claims

| id | asserted claim | evidence |
| --- | --- | --- |
| **CP1** | one plain `system.ts` runs as a full, emission-free contract in an ordinary Node tool | `tests/contexts.test.ts` |
| **CP2** | style modules execute the full build contract, while the browser receives a projected runtime facade from that same import | `tests/contexts.test.ts` |
| **CP3** | many importers produce one system-CSS occurrence; a lazy style remains in its own CSS chunk and does not repeat system CSS | `tests/contexts.test.ts`, `tests/scale.test.ts` |
| **CP4** | the compiler-owned cascade prelude is the first stylesheet in built HTML; lazy CSS is not loaded until its chunk | `tests/contexts.test.ts` |
| **CP5** | SSR receives a DOM-free facade from the same `system.ts`; its built module executes in Node with no `document` reference | `tests/contexts.test.ts` |
| **CP6** | browser output contains no contract implementation, Node built-ins, build extension marker, or compiler code | `tests/contexts.test.ts` |
| **CP7** | an unused runtime projection export disappears from the bundle | `tests/contexts.test.ts` |
| **CP8** | two physical copies of the contract implementation create distinct objects but equal identities; Vite resolves both imports to one runtime virtual module and emits one CSS occurrence | `tests/identity.test.ts` |
| **CP9** | a library ships full build-plane JS plus a precompiled portable artifact from `dist/`; an app compiles library-authored styles and receives only the projected facade | `tests/precompiled.test.ts` |
| **CP10** | a token-value edit changes only the CSS identity and the next style transform imports the new artifact | `tests/hmr.test.ts` |
| **CP11** | a failed transform caused by an imported contract dependency recovers after the dependency is fixed, without restarting Vite | `tests/hmr.test.ts` |
| **CP12** | a docs-only edit changes the docs identity and manifest bytes while compatibility/CSS/runtime identities, CSS bytes, write count, and mtime remain unchanged | `tests/hmr.test.ts` |
| **CP13** | 16 style modules across eager and four lazy chunks still emit one system artifact and exactly 16 module-style artifacts | `tests/scale.test.ts` |

Selenita is intentionally absent: this spike makes no editor-completion, diagnostic-shape, or hover claim. TypeScript checks the source surface, and `type-fest`'s `Jsonify` marks the portable boundary as data-only. Any future projection-specific editor behavior should add selenita assertions here rather than relying on this runtime/build suite.

## The landed pattern

```text
plain system.ts
  └─ consolidate() -> immutable in-process contract
       ├─ build worker executes style/build closures
       │    ├─ one virtual system CSS module, keyed by CSS identity
       │    └─ one virtual CSS module per style source
       ├─ portable JSON artifact
       │    ├─ browser virtual module
       │    ├─ SSR virtual module
       │    └─ manifest
       └─ ordinary tools import the in-process contract directly
```

The worker is deliberately a fresh Node process. That makes contract evaluation independent of Vite's module cache, gives every evaluation a hard timeout, and makes introduced-then-fixed errors retryable by construction. A production compiler can use a long-lived isolated runner for speed, but it must preserve those three properties.

System CSS and style CSS use different virtual modules. Every style module imports the system virtual CSS ID plus its own style virtual CSS ID. Vite/Rolldown deduplicates the first by ID and naturally leaves an async module's own CSS in the async chunk.

The cross-system cascade prelude is not another module import. It is a distinct compiler asset injected with `head-prepend`, so it is fetched before the entry stylesheet and necessarily exists before any lazy stylesheet can load.

## Identity rules

One hash cannot drive every cache:

| identity | includes | intentionally excludes | consumer |
| --- | --- | --- | --- |
| compatibility | normalized policy, extension id/version/options, token shape, runtime shape | token values, descriptions, closure identity | duplicate-package resolution |
| CSS | layer/prefix plus emitted token names and values | descriptions, runtime-only shape | system CSS filename/module ID |
| runtime schema | mutable token and port shape | token values and docs | runtime/SSR hydration facade |
| docs | descriptions and provenance | CSS and runtime implementation | manifest revision |

Physical source paths and function object identity never participate in compatibility. That is what lets duplicate installed package instances collapse to one runtime module while still being different JavaScript objects when imported directly.

## Rules to carry into implementation

1. **`consolidate()` emits nothing.** It resolves names, references, policies, metadata, and identities, then returns an immutable contract. A plain tool import must not require compiler state or create files.
2. **Lower closures before the portable boundary.** Build extensions execute in the worker. Browser and SSR virtual modules are generated only from portable data; source-module tree-shaking is not a sufficient security boundary.
3. **Deduplicate by artifact identity, not source path or object reference.** Runtime modules use compatibility + runtime identity; CSS uses CSS identity.
4. **Keep system CSS separate from module CSS in the graph.** System CSS deduplicates while module CSS stays eligible for lazy splitting.
5. **Make the prelude a host-owned first asset.** Import order cannot guarantee first occurrence when lazy chunks and independently built systems exist.
6. **Track attempted transforms and their dependency graphs, including failed transforms.** A failed entry may not remain discoverable through Vite's module graph, but it still needs invalidation and a fresh retry.
7. **Retain the last good artifacts across an error.** Do not rewrite CSS or the manifest with half-built state. The fixed change replaces them atomically on the next successful evaluation.
8. **Write artifacts only when bytes change.** Content-addressed filenames are not enough: an unconditional rewrite still creates noisy mtimes and watchers.
9. **A precompiled package has two useful outputs.** Full Node/build JS preserves build closures for downstream style compilation; the adjacent portable JSON artifact lets consumers project without executing that JS in client/SSR graphs.

## Footguns found

- Vite recognizes the virtual style payload as CSS only when its resolved ID still ends in `.css`. Dropping the suffix silently bypasses CSS extraction and lazy splitting.
- `this.addWatchFile()` alone did not attach all non-graph contract dependencies to the Vite 8 dev watcher in this harness. The plugin also adds discovered dependencies through `server.watcher.add()` during `configureServer` and after style discovery.
- Native filesystem events for copied macOS temp fixtures were unreliable. Lifecycle tests use 20 ms polling for deterministic CI behavior; this is a test-harness setting, not part of the projection contract.
- A failed transform cannot be recovered solely by walking the current module graph: the failed module may not be there. Keep an explicit bounded set of attempted style entries and their dependencies.
- Building the full precompiled contract as a browser library externalized `node:crypto` to a browser shim, which then failed when a downstream compiler executed the dist file in Node. The full contract dist is a Node/SSR build; the portable artifact is the browser boundary.
- A dynamic import exported from an application entry can be tree-shaken when nothing reaches it. The lazy fixture publishes its loader on the probe so the production graph really contains and tests the async chunk.
- `/var` and `/private/var` spell the same macOS temp path differently. Tests canonicalize temp roots before passing them to Vite or comparing watched IDs.
- The compiler worker imports `.ts` directly through Node's built-in type stripping. Keep contract fixtures within erasable TypeScript syntax and retain the package's Node 22.18+ floor (or introduce an explicit transform runner).
- The build-time intrinsic returns compiler metadata at runtime but is typed as the class-name string consumers receive after transformation. That localized cast is acceptable only at the compiler intrinsic; letting this mismatch leak into user-authored types would make style imports unpleasant and unsound.
