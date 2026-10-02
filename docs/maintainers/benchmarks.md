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

## Accepted baseline — 2026-10-02

Recorded at 2026-10-02T05:34:43.377Z from the worktree based on HEAD d9ee7015. Environment: darwin 25.4.0 arm64, Node v24.21.0, pnpm 12.8.1, TypeScript 6.0.3. Wall-clock measurements are local one-run signals. Source receipt: `.vanity/benchmarks/current.json`.

| Scale | Cold TS / wall | Instantiations | Memory | Incremental TS / wall |
| --- | ---: | ---: | ---: | ---: |
| Small | 0.41s / 0.551s | 34,928 | 138,707 kB | 0.26s / 0.407s |
| Medium | 0.49s / 0.617s | 66,618 | 138,967 kB | 0.23s / 0.351s |
| Large | 1.05s / 1.188s | 290,476 | 198,160 kB | 0.25s / 0.377s |

| Scale | Root | Deep | Axis | Case | Runtime | CSS | Diagnostic | Rename |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 0.088ms | 0.139ms | 0.181ms | 0.213ms | 0.189ms | 10.689ms | 0.213ms | 0.969ms |
| Medium | 0.074ms | 0.165ms | 0.073ms | 0.131ms | 0.101ms | 4.905ms | 0.094ms | 1.264ms |
| Large | 0.131ms | 0.236ms | 0.161ms | 0.133ms | 0.113ms | 5.013ms | 0.116ms | 6.033ms |

| Scale | Declaration emit / bytes | Vite build | CSS raw / gzip | Manifest v4 raw / gzip |
| --- | ---: | ---: | ---: | ---: |
| Small | 0.592s / 40,184 B | 0.649s | 4,441 B / 808 B | 153,571 B / 7,227 B |
| Medium | 0.734s / 107,485 B | 0.770s | 24,691 B / 2,973 B | 1,169,491 B / 32,637 B |
| Large | 1.591s / 588,958 B | 4.992s | 208,547 B / 21,439 B | 11,386,892 B / 255,924 B |

| Host graph modules | Plain Vite | Vanity | Overhead | Package declaration walk cold / warm |
| --- | ---: | ---: | ---: | ---: |
| 3,000 app + 128 installed | 0.178s | 0.438s | 260 ms | 243 ms / 1 ms |

Package entries: root 630,604 B raw; runtime 66,344 B raw, 38,500 B minified, and 11,409 B min+gzip; Hail presets 31,202 B raw.

<!-- benchmark-receipt:end -->

`pnpm pack --dry-run --json` reports 34 intended package files.

The CSS numbers are expected release evidence, not a byte-identity promise against any other release. CSS size follows from authored color leaves, gamut-preserving relative-color expressions, the necessary re-resolved declarations for mode-varying folded derivations, and CSS-determined one-omitted color-mix weights.

Those semantic characteristics can increase or reduce fixture CSS; the raw and gzip values above are the reviewed output for this checkout.

Runtime min+gzip remains subject to the 12,400 B budget enforced by `scripts/benchmark.ts`. Any future runtime-affecting change must either stay within that budget or receive an explicit benchmark review and budget decision.

The host-graph row is a local timing signal. Zero handler calls for unserved modules is enforced by the supported-major Vite graph matrix, where the host is observed directly. The receipt also records cold and warm source-package declaration time on `sandbox/demo-main`'s installed tree.

The TypeScript memory column is the heap in use when the compiler reports its statistics, so it includes allocations still awaiting collection. To judge a large change, compare repeated ordinary runs against clean HEAD on the same toolchain. To tell retained growth from collection timing, run `tsc --extendedDiagnostics` under `node --expose-gc`, which collects before reading memory; its wall time is inflated by that collection, so compare latency from ordinary runs.

## Acceptance policy

- Compare only like-for-like environment classes and fixture identities.
- Investigate a large-fixture editor or type regression above 20%; editor interactions below 1ms use absolute timing and repeated-run stability instead.
- Record an explicit decision for an intentional regression and name the user-visible gain.
- Keep raw machine output outside version control; update this page only for a reviewed baseline.
- Measure hover with the language-service path defined in [testing §5](./testing.md#5-typescripteditor-dx-contract).
- Keep browser, optimizer, package, fresh-app, and lifecycle checks separate from benchmark numbers. See [testing](./testing.md).
