# vanity — benchmark baseline

Benchmarks are regression signals for deterministic generated projects. They are not product promises or cross-machine comparisons.

The source-controlled generator lives in [`benchmarks/`](../../benchmarks). `pnpm run bench:fixtures:check` detects fixture drift and asserts the reviewed byte facts in [`benchmarks/accepted.json`](../../benchmarks/accepted.json).

`pnpm run bench:baseline` writes raw output to ignored `.vanity/benchmarks/current.json` and compares it with those accepted facts. The checker uses the repository root by default and accepts `--workspace <path>` for an isolated workspace copy.

## Fixtures

| Scale | Tokens | Modules | Style/recipe consumers |
| --- | ---: | ---: | ---: |
| Small | 50 | 2 | 5 |
| Medium | 500 | 10 | 30 |
| Large | 5,000 | 50 | 150 |

Fixtures cover open-to-locked system construction, token modules, axes and sparse cases, style and editor probes, rename, declaration emit, CSS output, and manifest generation.

## Accepted baseline — 2026-09-11

Recorded on 2026-09-11 with `pnpm run bench:baseline`. This is the accepted baseline for this checkout: Darwin 25.4.0 arm64, Node 24.18.0, pnpm 11.25.0, TypeScript 6.0.3, and the checked-in Small, Medium, and Large fixtures. Wall-clock measurements are local one-run signals; raw output is retained in ignored `.vanity/benchmarks/current.json`.

| Scale | Cold TS / wall | Instantiations | Memory | Incremental TS / wall |
| --- | --: | --: | --: | --: |
| Small | 0.50s / 1.327s | 34,246 | 142,573 kB | 0.24s / 0.767s |
| Medium | 0.56s / 1.096s | 65,513 | 113,892 kB | 0.25s / 0.770s |
| Large | 1.22s / 1.761s | 288,916 | 143,502 kB | 0.25s / 0.780s |

| Scale | Root | Deep | Axis | Case | Runtime | CSS | Diagnostic | Rename |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| Small | 0.078ms | 0.137ms | 0.292ms | 0.258ms | 0.156ms | 6.496ms | 0.231ms | 1.086ms |
| Medium | 0.096ms | 0.191ms | 0.081ms | 0.166ms | 0.124ms | 6.088ms | 0.112ms | 1.344ms |
| Large | 0.147ms | 0.282ms | 0.081ms | 0.155ms | 0.163ms | 5.726ms | 0.125ms | 7.038ms |

| Scale | Declaration emit / bytes | Vite build | CSS raw / gzip | Manifest v4 raw / gzip |
| --- | --: | --: | --: | --: |
| Small | 1.055s / 40,184 B | 1.566s | 4,461 B / 812 B | 153,572 B / 7,225 B |
| Medium | 1.187s / 107,485 B | 1.131s | 24,712 B / 2,978 B | 1,169,492 B / 32,638 B |
| Large | 2.107s / 588,958 B | 3.860s | 208,567 B / 21,445 B | 11,386,892 B / 255,925 B |

The current package root entry is 620,865 B raw. The runtime entry is 65,808 B raw, 38,155 B minified, and 11,318 B min+gzipped. The Hail presets entry is 31,202 B raw, 17.5 kB minified, and 6.12 kB min+gzipped. `pnpm pack --dry-run --json` reports 34 intended package files.

The CSS numbers are expected release evidence, not a byte-identity promise against any other release. CSS size follows from authored color leaves, gamut-preserving relative-color expressions, the necessary re-resolved declarations for mode-varying folded derivations, and CSS-determined one-omitted color-mix weights.

Those semantic characteristics can increase or reduce fixture CSS; the raw and gzip values above are the reviewed output for this checkout.

The runtime min+gzip measurement remains below the 12,400 B budget enforced by `scripts/benchmark.ts`, with 1,082 B (9.6%) of headroom. Any future runtime-affecting change must either stay within that budget or receive an explicit benchmark review and budget decision.

## Acceptance policy

- Compare only like-for-like environment classes and fixture identities.
- Investigate a large-fixture editor or type regression above 20%; editor interactions below 1ms use absolute timing and repeated-run stability instead.
- Record an explicit decision for an intentional regression and name the user-visible gain.
- Keep raw machine output outside version control; update this page only for a reviewed baseline.
- Measure hover with the language-service path defined in [testing §5](./testing.md#5-typescripteditor-dx-contract).
- Keep browser, optimizer, package, fresh-app, and lifecycle checks separate from benchmark numbers. See [testing](./testing.md).
