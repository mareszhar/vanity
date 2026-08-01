# Spike: a consolidated system across a package boundary

A **library-agnostic** probe of the scenario most likely to hurt real adopters: a design-system package builds a chained, consolidated system and **publishes it** — so the accumulated type must survive `tsc --declaration`, and consumers must get full DX from the emitted `.d.ts` alone.

Feared failure modes going in: **TS7056** ("the inferred type of this node exceeds the maximum length the compiler will serialize" — would force an impossible hand-written annotation), **TS2742** (non-portable inferred type), alias leakage (type-fest becoming part of the public API), and slow or broken consumer-side checking.

Verdict: **all clear, with one nuance worth knowing** (portable vs naive, below).

## Run it

```sh
cd spikes/system-package
pnpm install --ignore-workspace
pnpm run generate   # rewrite lib/src/index.ts + app/src/consume.ts (profile M)
pnpm run check      # emit lib d.ts, then typecheck the app against it
pnpm run test       # selenita: consumer DX from the emitted d.ts ALONE
pnpm run measure    # the profile sweep (M → XL), lib emit + app check per profile
```

## The setup

- `lib/` — the builder (same shape as spikes/system-scale: three facets, wide groups, contributions, derives, helpers) plus a generated entry that exports the consolidated system **two ways**:
  - `ds` — the **naive** export: the raw chain type, serialized as-is;
  - `dsPortable` — via `portable()`, a boundary simplifier returning `PortableSurface<Simplify<S>, …>` applied once at the export site.
- `app/` — a consumer that resolves **only `lib/dist/*.d.ts`** (no library source in sight, exactly like a published package), with reads across the whole surface and selenita completion probes.

## Results (TS 6.0.3, Apple Silicon, 2026-07)

| profile | lib emit | emit errors | d.ts size | type-fest in d.ts? | app check | app errors |
| --- | --- | --- | --- | --- | --- | --- |
| M (30×10) | 0.28s | none | 44.2KB | no | 0.14s | none |
| L (60×12) | 0.31s | none | 97.6KB | no | 0.16s | none |
| XL (100×15) | 0.59s | none | 188.2KB | no | 0.29s | none |

- **No TS7056 or TS2742 at any profile.** Declaration emit of a 100-group × 15-field consolidated system completes in ~0.6s.
- **`portable()` EVALUATES at emit.** The `dsPortable` declaration in the d.ts is a single flattened object type — `Simplify` does **not** survive as an alias reference, so **type-fest never becomes part of the public API**.
- **The naive export serializes the raw chain** — a long `Record<never, never> & { … } & { … }` intersection spelling. It works, and consumers read it fine, but it is what a consumer sees on hover.
- **d.ts size is linear and unremarkable** (~1.9KB per group at this field width), and the two export styles cost roughly the same bytes (21.1KB naive vs 24.1KB portable at M — flattening spells the same fields).
- **Consumer DX from the d.ts alone is intact** (selenita, all green): completions across the token tree (first group, last group, plugin-provided groups), deep branched reads, helpers, and the portable read-back — with the app resolving nothing but `lib/dist`.

## The rule to carry into the product

**Publish the portable form.** Not for size or for correctness — both forms work — but because the boundary type is a _read surface_:

1. hover on the naive export shows an N-way intersection chain; the portable export shows one object type (the §12.2 hover bar, applied at the boundary);
2. the portable surface contains no builder methods, guard brands, or accumulation machinery — nothing internal can leak into consumer docs;
3. alias evaluation at emit means zero type-only runtime deps for consumers.

This is the "defer `Simplify` to read-sites" rule from spikes/type-accumulation extended one level: **a package boundary is a read-site.**

## Footguns encountered

- A `.d.ts`-only import target (`emitDeclarationOnly`) resolves fine under `moduleResolution: bundler` for type-checking — but remember the entry has no runtime `.js`; a real package pairs the d.ts with built JS.
- Selenita `aliases` resolve relative to the **tsconfig's directory**, not the test's cwd — `#lib/*` had to map to `../lib/dist/*` from `app/`.
