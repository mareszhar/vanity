# Spike: whole-system shape at realistic scale

A **library-agnostic** stress of the accumulating-builder pattern at the scale a real design system reaches. Where `spikes/type-accumulation` proved the pattern on one type parameter with tiny payloads and many links, this spike asks the question that profile leaves open: **do few links with WIDE payloads and SEVERAL facets accumulating at once change the blow-up profile?**

Answer: **no.** The lean discipline holds with a wide margin.

## Run it

Self-contained and independent of the monorepo workspace:

```sh
cd spikes/system-scale
pnpm install --ignore-workspace
pnpm run generate   # rewrite generated/m.ts (the committed M-profile module)
pnpm run check      # tsc over src + tests + generated
pnpm run test       # selenita: DX claims against the M-profile chain
pnpm run scale      # the profile sweep (S → XXL), one guarded tsc per profile
```

## What a profile contains

Each generated chain models a real system build, not a synthetic ladder:

- **3 facets accumulating at once** — groups `S`, variant sets `V`, helpers `U`; every call re-instantiates the builder interface with all three params;
- **wide groups** — a fixed field mix per group: plain values, **branched** fields (per-variant records, the "token with modes" shape), and one level of **nested subgroup** (bounded nesting, per the first spike's R1);
- **8 contributions** — early ones provide control groups, late ones carry requirements reaching back across the whole chain (including user groups);
- **periodic `derive` reads** — every 10th group derives from earlier groups, forcing a `Simplify` instantiation each time, as real usage does;
- **20 helpers in 2 batches**, then `consolidate()` and probes that force the first group, the last group's branched field, a helper, and a contribution-provided group to have survived accumulation.

## Results (TS 6.0.3, Apple Silicon, 2026-07)

| profile | groups×fields | errors | instantiations | memory | time |
| --- | --- | --- | --- | --- | --- |
| S | 10×8 | none | 4,303 | 46MB | 0.17s |
| M | 30×10 | none | 11,138 | 53MB | 0.23s |
| L | 60×12 | none | 28,805 | 54MB | 0.24s |
| XL | 100×15 | none | 66,207 | 67MB | 0.38s |
| XXL | 150×20 | none | 135,212 | 61MB | 0.75s |

- **No TS2589 at any profile.** XXL is ~3,000 leaf fields across 150 groups plus contributions, derives, and helpers — far beyond a plausible design system — and stays under a second of check time with near-linear instantiation growth.
- **Payload width is benign.** The first spike's blow-up axis was _naive per-step `Simplify` across many links_; wide payloads on few links do not reproduce it. The lean rules are the load-bearing part, not the link count.
- **Three facets are benign.** Accumulating `S`/`V`/`U` in parallel multiplies parameters per instantiation, not instantiation _depth_ — no compounding.

## DX at scale (selenita, all green, ~1s for the suite)

| id | claim |
| --- | --- |
| **SC1** | at the end of the M chain, a `derive` callback completes the first group, the last group, contribution-provided groups, and derived groups |
| **SC2** | deep reads stay typed: a branched field completes its branches, from both the open chain and the consolidated surface |
| **SC3** | additive-only still errors at the cursor at scale, naming `'g0.f0'` |
| **SC4** | an unmet requirement still collapses to the readable message at scale |

## Load-bearing rules

Use plain-intersection accumulation with `Simplify` deferred to read sites and guards by intersection. Keep periodic `derive` reads in benchmarks: every `derive` performs a full `Simplify` read of the accumulation, and a chain with zero reads understates real cost.

## Product guard

The open system keeps accumulated token, axis, condition, plugin, const, and util facets as lean intersections and simplifies only the locked read boundary. The committed XXL spike is the requirement/width ceiling; the product-side 80-link declaration fixture covers the deeper accumulation axis on every SDK typecheck.
