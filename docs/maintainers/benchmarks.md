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

## Accepted baseline — 2026-09-26

Recorded at 2026-09-26T01:53:06.405Z from the worktree based on HEAD 0770ce7c. Environment: darwin 25.4.0 arm64, Node v24.21.0, pnpm 12.5.1, TypeScript 6.0.3. Wall-clock measurements are local one-run signals. Source receipt: `.vanity/benchmarks/current.json`.

| Scale | Cold TS / wall | Instantiations | Memory | Incremental TS / wall |
| --- | ---: | ---: | ---: | ---: |
| Small | 0.58s / 0.724s | 34,246 | 99,776 kB | 0.23s / 0.364s |
| Medium | 0.50s / 0.615s | 65,513 | 102,561 kB | 0.22s / 0.339s |
| Large | 1.03s / 1.157s | 288,916 | 147,646 kB | 0.25s / 0.379s |

| Scale | Root | Deep | Axis | Case | Runtime | CSS | Diagnostic | Rename |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 0.099ms | 0.151ms | 0.190ms | 0.237ms | 0.309ms | 6.407ms | 0.306ms | 0.968ms |
| Medium | 0.068ms | 0.162ms | 0.087ms | 0.148ms | 0.096ms | 5.183ms | 0.104ms | 1.210ms |
| Large | 0.132ms | 0.243ms | 0.065ms | 0.135ms | 0.116ms | 4.853ms | 0.116ms | 5.644ms |

| Scale | Declaration emit / bytes | Vite build | CSS raw / gzip | Manifest v4 raw / gzip |
| --- | ---: | ---: | ---: | ---: |
| Small | 0.579s / 40,184 B | 0.917s | 4,461 B / 812 B | 153,571 B / 7,227 B |
| Medium | 0.723s / 107,485 B | 0.759s | 24,712 B / 2,978 B | 1,169,491 B / 32,637 B |
| Large | 1.545s / 588,958 B | 4.930s | 208,567 B / 21,445 B | 11,386,892 B / 255,924 B |

| Host graph modules | Plain Vite | Vanity | Overhead | Package declaration walk cold / warm |
| --- | ---: | ---: | ---: | ---: |
| 3,000 app + 128 installed | 0.167s | 0.478s | 311 ms | 331 ms / 1 ms |

Package entries: root 623,976 B raw; runtime 65,808 B raw, 38,155 B minified, and 11,318 B min+gzip; Hail presets 31,202 B raw.

<!-- benchmark-receipt:end -->

`pnpm pack --dry-run --json` reports 34 intended package files.

The CSS numbers are expected release evidence, not a byte-identity promise against any other release. CSS size follows from authored color leaves, gamut-preserving relative-color expressions, the necessary re-resolved declarations for mode-varying folded derivations, and CSS-determined one-omitted color-mix weights.

Those semantic characteristics can increase or reduce fixture CSS; the raw and gzip values above are the reviewed output for this checkout.

Runtime min+gzip remains subject to the 12,400 B budget enforced by `scripts/benchmark.ts`. Any future runtime-affecting change must either stay within that budget or receive an explicit benchmark review and budget decision.

The host-graph row is a local timing signal. Zero handler calls for unserved modules is enforced by the supported-major Vite graph matrix, where the host is observed directly. The receipt also records cold and warm source-package declaration time on `sandbox/demo-main`'s installed tree.

## Acceptance policy

- Compare only like-for-like environment classes and fixture identities.
- Investigate a large-fixture editor or type regression above 20%; editor interactions below 1ms use absolute timing and repeated-run stability instead.
- Record an explicit decision for an intentional regression and name the user-visible gain.
- Keep raw machine output outside version control; update this page only for a reviewed baseline.
- Measure hover with the language-service path defined in [testing §5](./testing.md#5-typescripteditor-dx-contract).
- Keep browser, optimizer, package, fresh-app, and lifecycle checks separate from benchmark numbers. See [testing](./testing.md).
