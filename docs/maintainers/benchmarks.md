# vanity — benchmark baseline

Benchmarks are regression signals for deterministic generated projects. They are not product promises or cross-machine comparisons.

The source-controlled generator lives in [`benchmarks/`](../../benchmarks). `pnpm run bench:fixtures:check` detects fixture drift and asserts the reviewed byte facts in [`benchmarks/accepted.json`](../../benchmarks/accepted.json).

`pnpm run bench:baseline` writes raw output to ignored `.vanity/benchmarks/current.json` and compares it with those accepted facts. The checker uses the repository root by default and accepts `--workspace <path>` for an isolated workspace copy.

After reviewing a new receipt, run `pnpm run bench:docs:update` to render the accepted measurement tables, then `pnpm run bench:docs:check` to verify their timestamp, environment, and values still match `.vanity/benchmarks/current.json`.

## Fixtures

| Scale | Tokens | Modules | Style/recipe consumers |
| --- | ---: | ---: | ---: |
| Small | 50 | 2 | 5 |
| Medium | 500 | 10 | 30 |
| Large | 5,000 | 50 | 150 |

Fixtures cover open-to-locked system construction, token modules, axes and sparse cases, style and editor probes, rename, declaration emit, CSS output, and manifest generation.

<!-- benchmark-receipt:start -->

## Accepted baseline — 2026-09-19

Recorded at 2026-09-19T03:07:49.141Z from the worktree based on HEAD 5cdcea95. Environment: darwin 25.4.0 arm64, Node v24.18.0, pnpm 11.25.0, TypeScript 6.0.3. Wall-clock measurements are local one-run signals. Source receipt: `.vanity/benchmarks/current.json`.

| Scale | Cold TS / wall | Instantiations | Memory | Incremental TS / wall |
| --- | ---: | ---: | ---: | ---: |
| Small | 0.46s / 0.982s | 34,246 | 142,215 kB | 0.24s / 0.750s |
| Medium | 0.55s / 1.072s | 65,513 | 114,291 kB | 0.25s / 0.770s |
| Large | 1.08s / 1.612s | 288,916 | 150,297 kB | 0.25s / 0.764s |

| Scale | Root | Deep | Axis | Case | Runtime | CSS | Diagnostic | Rename |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 0.078ms | 0.131ms | 0.270ms | 0.262ms | 0.150ms | 6.865ms | 0.212ms | 1.070ms |
| Medium | 0.079ms | 0.186ms | 0.082ms | 0.167ms | 0.113ms | 5.856ms | 0.106ms | 1.440ms |
| Large | 0.139ms | 0.270ms | 0.136ms | 0.144ms | 0.134ms | 5.708ms | 0.108ms | 6.585ms |

| Scale | Declaration emit / bytes | Vite build | CSS raw / gzip | Manifest v4 raw / gzip |
| --- | ---: | ---: | ---: | ---: |
| Small | 1.016s / 40,184 B | 1.302s | 4,461 B / 812 B | 153,571 B / 7,227 B |
| Medium | 1.190s / 107,485 B | 1.192s | 24,712 B / 2,978 B | 1,169,491 B / 32,637 B |
| Large | 2.085s / 588,958 B | 5.234s | 208,567 B / 21,445 B | 11,386,892 B / 255,924 B |

Package entries: root 623,976 B raw; runtime 65,808 B raw, 38,155 B minified, and 11,318 B min+gzip; Hail presets 31,202 B raw.

<!-- benchmark-receipt:end -->

`pnpm pack --dry-run --json` reports 34 intended package files.

The CSS numbers are expected release evidence, not a byte-identity promise against any other release. CSS size follows from authored color leaves, gamut-preserving relative-color expressions, the necessary re-resolved declarations for mode-varying folded derivations, and CSS-determined one-omitted color-mix weights.

Those semantic characteristics can increase or reduce fixture CSS; the raw and gzip values above are the reviewed output for this checkout.

Runtime min+gzip remains subject to the 12,400 B budget enforced by `scripts/benchmark.ts`. Any future runtime-affecting change must either stay within that budget or receive an explicit benchmark review and budget decision.

## Acceptance policy

- Compare only like-for-like environment classes and fixture identities.
- Investigate a large-fixture editor or type regression above 20%; editor interactions below 1ms use absolute timing and repeated-run stability instead.
- Record an explicit decision for an intentional regression and name the user-visible gain.
- Keep raw machine output outside version control; update this page only for a reviewed baseline.
- Measure hover with the language-service path defined in [testing §5](./testing.md#5-typescripteditor-dx-contract).
- Keep browser, optimizer, package, fresh-app, and lifecycle checks separate from benchmark numbers. See [testing](./testing.md).
