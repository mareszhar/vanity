# vanity — benchmark baseline

Benchmarks are regression signals for deterministic generated projects. They are not product promises or cross-machine comparisons.

## Environment and fixtures

| Field | Value |
| --- | --- |
| Platform | Darwin 25.4.0, arm64 |
| Node | 24.18.0 |
| pnpm | 11.8.0 |
| TypeScript | 6.0.3 |
| Recorded | 2026-07-31 |

The source-controlled generator lives in [`benchmarks/`](../../benchmarks). `pnpm run bench:fixtures:check` detects fixture drift; `pnpm run bench:baseline` writes raw output to ignored `.vanity/benchmarks/current.json`.

| Scale | Tokens | Modules | Style/recipe consumers |
| --- | --- | --- | --- |
| Small | 50 | 2 | 5 |
| Medium | 500 | 10 | 30 |
| Large | 5,000 | 50 | 150 |

Fixtures cover open-to-locked system construction, token modules, axes and sparse cases, style and editor probes, rename, declaration emit, CSS output, and manifest generation.

## TypeScript and editor baseline

TypeScript total time excludes process startup; wall time includes it. Editor measurements are local medians after program warmup.

| Scale | Cold TS / wall | Instantiations | Memory | Incremental TS / wall |
| --- | --: | --: | --: | --: |
| Small | 0.40s / 0.865s | 33,608 | 140,606 kB | 0.21s / 0.670s |
| Medium | 0.48s / 0.955s | 64,539 | 112,687 kB | 0.23s / 0.695s |
| Large | 1.00s / 1.463s | 287,522 | 142,142 kB | 0.23s / 0.696s |

| Scale | Root | Deep | Axis | Case | Runtime | CSS | Diagnostic | Rename |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| Small | 0.085ms | 0.131ms | 0.169ms | 0.224ms | 0.141ms | 6.085ms | 0.128ms | 1.096ms |
| Medium | 0.088ms | 0.169ms | 0.089ms | 0.162ms | 0.104ms | 5.421ms | 0.069ms | 1.341ms |
| Large | 0.142ms | 0.268ms | 0.071ms | 0.135ms | 0.104ms | 5.008ms | 0.083ms | 6.132ms |

## Build and artifact baseline

| Scale | Declaration emit / bytes | Vite build | CSS raw / gzip | Manifest v4 raw / gzip |
| --- | --: | --: | --: | --: |
| Small | 0.921s / 44,064 B | 0.799s | 4,497 B / 816 B | 161,529 B / 7,953 B |
| Medium | 1.074s / 109,703 B | 1.064s | 24,749 B / 2,981 B | 1,188,535 B / 33,572 B |
| Large | 1.905s / 587,110 B | 6.259s | 208,603 B / 21,455 B | 11,516,121 B / 257,480 B |

The root entry is 508,132 B. The runtime entry is 56,237 B raw, 31.5 kB minified, and 9.71 kB gzip. Hail is isolated in a 22,953 B presets entry. `pnpm pack --dry-run` contains 23 intended files and produces a 313.1 kB tarball.

The 2026-07-31 runtime-index audit replaced per-token scans during runtime-address attachment and manifest recording with one linear index. Two consecutive large-fixture builds measured 6.168s and 6.259s, down from the accepted 15.658s, with byte-identical CSS and manifest artifacts. Runtime token mutation now reuses a lazy contract index as well.

## Realignment comparison against v0.3.0

This one-run comparison was recorded on 2026-09-02 while completing the architectural realignment. The baseline is the `v0.3.0` source at `ca62460`; the current side is the realignment worktree based on `d171f3ae`. Both runs used the same Darwin arm64 host, Node 24.18.0, pnpm 11.8.0, and TypeScript 6.0.3, with the checked-in Small, Medium, and Large fixtures and `pnpm run bench:baseline`.

The table reports current versus v0.3.0. Wall-clock measurements are noisy one-run signals; negative percentages are improvements, while byte counts are deterministic artifact comparisons.

| Scale | Cold typecheck | Incremental | Declarations | Vite build | CSS raw | Manifest raw | Editor deep median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 867 ms (-32.2%) | 686 ms (-1.4%) | 901 ms (-1.3%) | 1,638 ms (-36.3%) | 4,497 B (0.0%) | 154,537 B (-4.3%) | 0.129 ms (-43.5%) |
| Medium | 989 ms (+1.4%) | 710 ms (+1.1%) | 1,105 ms (+1.9%) | 991 ms (-0.1%) | 24,749 B (0.0%) | 1,170,006 B (-1.6%) | 0.167 ms (-7.4%) |
| Large | 1,489 ms (-3.6%) | 707 ms (-1.2%) | 1,871 ms (-2.6%) | 3,433 ms (-43.4%) | 208,603 B (0.0%) | 11,393,040 B (-1.1%) | 0.257 ms (-4.4%) |

The package entry grew from 508,081 B to 519,286 B (+2.2%), and the runtime entry grew from 56,237 B to 56,843 B (+1.1%). The CSS output is byte-identical at all three fixture scales. The raw measurements remain in ignored `.vanity/benchmarks/current.json`; the source-controlled record here is the reviewed comparison rather than machine-specific receipt data.

## Acceptance policy

- Compare only like-for-like environment classes and fixture identities.
- Investigate a large-fixture editor or type regression above 20%; editor interactions below 1ms use absolute timing and repeated-run stability instead.
- Record an explicit decision for an intentional regression and name the user-visible gain.
- Keep raw machine output outside version control; update this page only for a reviewed baseline.
- Keep browser, optimizer, package, fresh-app, and lifecycle checks separate from benchmark numbers. See [testing](./testing.md).
