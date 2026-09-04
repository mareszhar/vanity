# vanity — benchmark baseline

Benchmarks are regression signals for deterministic generated projects. They are not product promises or cross-machine comparisons.

## Reference baseline environment and fixtures

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

## Reference TypeScript and editor baseline

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

## Reference build and artifact baseline

| Scale | Declaration emit / bytes | Vite build | CSS raw / gzip | Manifest v4 raw / gzip |
| --- | --: | --: | --: | --: |
| Small | 0.921s / 44,064 B | 0.799s | 4,497 B / 816 B | 161,529 B / 7,953 B |
| Medium | 1.074s / 109,703 B | 1.064s | 24,749 B / 2,981 B | 1,188,535 B / 33,572 B |
| Large | 1.905s / 587,110 B | 6.259s | 208,603 B / 21,455 B | 11,516,121 B / 257,480 B |

The baseline root entry was 508,132 B. The baseline runtime entry was 56,237 B raw, 31.5 kB minified, and 9.71 kB gzip. Hail was isolated in a 22,953 B presets entry. The baseline `pnpm pack --dry-run` contained 23 intended files and produced a 313.1 kB tarball. The reviewed hardening receipt below is the current release-candidate record.

The 2026-07-31 runtime-index audit replaced per-token scans during runtime-address attachment and manifest recording with one linear index. Two consecutive large-fixture builds measured 6.168s and 6.259s, down from the accepted 15.658s, with byte-identical CSS and manifest artifacts. Runtime token mutation now reuses a lazy contract index as well.

## Reference dated comparison baseline

This one-run comparison was recorded on 2026-09-02 against the `v0.3.0` baseline. Both runs used the same Darwin arm64 host, Node 24.18.0, pnpm 11.8.0, and TypeScript 6.0.3, with the checked-in Small, Medium, and Large fixtures and `pnpm run bench:baseline`. The reviewed hardening receipt below is the current release-candidate record.

The table reports current versus v0.3.0. Wall-clock measurements are noisy one-run signals; negative percentages are improvements, while byte counts are deterministic artifact comparisons.

| Scale | Cold typecheck | Incremental | Declarations | Vite build | CSS raw | Manifest raw | Editor deep median |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 867 ms (-32.2%) | 686 ms (-1.4%) | 901 ms (-1.3%) | 1,638 ms (-36.3%) | 4,497 B (0.0%) | 154,537 B (-4.3%) | 0.129 ms (-43.5%) |
| Medium | 989 ms (+1.4%) | 710 ms (+1.1%) | 1,105 ms (+1.9%) | 991 ms (-0.1%) | 24,749 B (0.0%) | 1,170,006 B (-1.6%) | 0.167 ms (-7.4%) |
| Large | 1,489 ms (-3.6%) | 707 ms (-1.2%) | 1,871 ms (-2.6%) | 3,433 ms (-43.4%) | 208,603 B (0.0%) | 11,393,040 B (-1.1%) | 0.257 ms (-4.4%) |

The package entry grew from 508,081 B to 519,286 B (+2.2%), and the runtime entry grew from 56,237 B to 56,843 B (+1.1%). The CSS output is byte-identical at all three fixture scales. The raw measurements remain in ignored `.vanity/benchmarks/current.json`; this page retains the like-for-like comparison rather than machine-specific receipt data.

## Hardening completion receipt

Recorded on 2026-09-03 with `pnpm run bench:baseline`. This is the current release-candidate baseline for the checkout: Darwin 25.4.0 arm64, Node 24.18.0, pnpm 11.24.0, TypeScript 6.0.3, and the checked-in Small, Medium, and Large fixtures. Wall-clock measurements are local one-run signals; raw output is retained in ignored `.vanity/benchmarks/current.json`.

| Scale | Cold TS / wall | Instantiations | Memory | Incremental TS / wall |
| --- | --: | --: | --: | --: |
| Small | 0.42s / 0.927s | 33,164 | 138,817 kB | 0.23s / 0.738s |
| Medium | 0.52s / 1.036s | 64,087 | 110,502 kB | 0.25s / 0.755s |
| Large | 1.03s / 1.530s | 287,198 | 186,943 kB | 0.25s / 0.795s |

| Scale | Root | Deep | Axis | Case | Runtime | CSS | Diagnostic | Rename |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| Small | 0.089ms | 0.134ms | 0.230ms | 0.239ms | 0.194ms | 5.563ms | 0.225ms | 1.341ms |
| Medium | 0.097ms | 0.171ms | 0.090ms | 0.145ms | 0.118ms | 5.327ms | 0.103ms | 1.326ms |
| Large | 0.146ms | 0.268ms | 0.082ms | 0.139ms | 0.102ms | 6.121ms | 0.142ms | 6.367ms |

| Scale | Declaration emit / bytes | Vite build | CSS raw / gzip | Manifest v4 raw / gzip |
| --- | --: | --: | --: | --: |
| Small | 1.002s / 44,270 B | 0.905s | 4,497 B / 816 B | 154,537 B / 7,270 B |
| Medium | 1.127s / 109,909 B | 1.029s | 24,749 B / 2,981 B | 1,170,006 B / 32,690 B |
| Large | 2.107s / 587,316 B | 3.614s | 208,603 B / 21,455 B | 11,393,040 B / 255,993 B |

The current package root entry is 567,643 B raw, 331 kB minified, and 94.7 kB min+gzipped. The runtime entry is 65,814 B raw, 38,155 B minified, and 11,318 B min+gzipped. Hail is isolated in a 31,202 B presets entry, 17.5 kB minified, and 6.12 kB min+gzipped. `npm pack --dry-run --json` reports a 456,609 B tarball with 34 intended files. The root and runtime growth is deliberate: named public type surfaces, structured authoring/runtime diagnostics, and the verb-first internal error callback name account for the increase. Authoring-context routing adds 6 raw bytes to the root entry; runtime diagnostics remain formatter-free in the browser entry. The structured runtime diagnostics account for about 1.6 kB of min+gzip growth over the reference runtime and buy browser failures with stable codes, paths, and fixes. CSS and manifest bytes remain unchanged from the reviewed 2026-09-02 comparison.

`scripts/benchmark.ts` enforces a 12,400 B min+gzip runtime-entry budget. The current runtime leaves 1,082 B (9.6%) of headroom; any future runtime-affecting change must either stay within that budget or receive an explicit benchmark review and budget decision. The measured runtime figures above retain raw, minified, and min+gzip values together so the download-facing guard remains comparable with the source-size and minified-size signals.

CSS and manifest bytes remain unchanged; wall-clock and memory readings are local one-run signals rather than deterministic regressions.

## Acceptance policy

- Compare only like-for-like environment classes and fixture identities.
- Investigate a large-fixture editor or type regression above 20%; editor interactions below 1ms use absolute timing and repeated-run stability instead.
- Record an explicit decision for an intentional regression and name the user-visible gain.
- Keep raw machine output outside version control; update this page only for a reviewed baseline.
- Measure hover with the language-service path defined in [testing §5](./testing.md#5-typescripteditor-dx-contract).
- Keep browser, optimizer, package, fresh-app, and lifecycle checks separate from benchmark numbers. See [testing](./testing.md).
