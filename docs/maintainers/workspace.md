# vanity — workspace

This repository is the complete development and release home for Vanity. User-facing behavior belongs to the domain specifications; this document describes the infrastructure that keeps those contracts honest.

## 1. Layout

```text
vanity/
  package.json             root command manager
  pnpm-workspace.yaml
  pnpm-lock.yaml
  turbo.json
  tsconfig.base.json
  eslint.config.ts
  sdk/                     @mszr/vanity
  docs/                    canonical product and maintainer documentation
  scripts/                 audits, benchmarks, smoke tests, release tooling
  tests/                   browser and development integration tests
  spikes/                  standalone probes of patterns, run before designing
  benchmarks/              generated scale fixtures and accepted baselines
  sandbox/
    fixtures/              shared comparison data
    demo-main/             flagship Nuxt studio
    demo-comparisons/      Vite comparison matrix
  .github/workflows/       repository CI
```

The root is a private maintainer workspace. `sdk/` is the only publishable npm package.

## 2. Command architecture

The root `package.json` is the command center. Maintainers should not need to change directories for normal development, validation, benchmarking, demo work, or release preparation.

Leaf package scripts describe the tasks Turbo executes; root scripts provide the stable human-facing vocabulary. `typecheck` first checks root tooling and browser specs through the root TypeScript project, then runs Turbo’s complete workspace graph; `sdk:typecheck` remains the narrow SDK-only command. Workspace dependency edges ensure the SDK builds before demos that consume its package exports.

Turbo owns:

- dependency-aware `build`, `prep`, `typecheck`, and `test` execution;
- local caching of deterministic task output;
- persistent development processes;
- filtered SDK or demo workflows invoked by root aliases.

SDK production builds exclude test-only files from their cache key, so changing a Selenita or runtime fixture does not rebuild the publishable package. SDK typechecking stores incremental compiler state under ignored `.cache/`; ESLint does the same. Independent demo builds run with bounded concurrency, while editor and browser workers are capped where extra processes cost more than they save.

The raw vanilla-extract coexistence compiler is lazy: a Vanity-only project never starts its private Vite evaluator. When a raw vanilla-extract module does require it, the evaluator is middleware-only and transportless across Vite 7 and Vite 8, so concurrent builds do not allocate duplicate WebSocket ports or watchers.

Scripts that inspect the repository as a whole—lint, documentation examples, audits, benchmarks, browser suites, fresh-package smoke, and releases—remain explicit root commands.

## 3. Toolchain

- **Package manager:** pnpm, pinned by `packageManager` in the root manifest.
- **Runtime:** Node from `.nvmrc`.
- **Task graph:** Turborepo.
- **Lint and formatting:** ESLint with `@antfu/eslint-config`; formatting is part of the lint configuration.
- **SDK build:** obuild.
- **SDK tests:** Vitest across runtime, type, editor-DX, and emitted-output evidence dimensions.
- **Demo integration:** Playwright against Nuxt and Vite production/development servers.
- **Primary integration substrate:** published vanilla-extract packages declared in `sdk/package.json`.

### Dependency policy

Third-party version ranges live in `pnpm-workspace.yaml`. The default `catalog` is the exact maintainer test matrix consumed with `catalog:`; the named `peers` catalog is the broader SDK compatibility contract consumed with `catalog:peers`. This keeps “what this checkout verifies” separate from “what consumers may install” without duplicating either policy across package manifests.

Packing and publication use pnpm, which natively materializes both catalog and workspace references as ordinary npm-compatible ranges inside the artifact. It does not rewrite `sdk/package.json` on disk, so the authored manifest and Git always retain `catalog:` references—even after an interrupted pack or publish. Fresh-package smoke tests inspect and install that real tarball outside the workspace.

Use `workspace:*` only for local workspace packages: it guarantees a local link during development and is likewise replaced by the publishable version during packing. Do not use it for registry dependencies.

Run `pnpm run upi` to review and select latest eligible upgrades from the default catalog. The script derives its package selectors from that catalog, asks pnpm for machine-readable latest-version data, and presents one Clack multiselect option per outdated catalog entry. Each option shows the installed and latest versions, with the changed major, minor, or patch suffix highlighted accordingly; Space toggles an entry, the arrow keys move, and Enter confirms. Cancelling or submitting without a selection is a no-op. The updater deliberately excludes TypeScript while its ESLint integration supports only the current workspace toolchain, and preserves the broader `peers` catalog because it defines the SDK's published compatibility contract. Follow an upgrade with `pnpm run validate` before release work.

The dependency-update mental model has three layers: the workspace discovers projects and provides one install graph; the default catalog owns the exact versions Vanity tests; and the named `peers` catalog owns the broader versions the published SDK promises to support. `upi` derives candidates from the default catalog, asks pnpm for current registry data, lets the maintainer choose catalog entries once, and then delegates the actual update and install to pnpm before reapplying the explicit compatibility policies. A successful pnpm exit without a changed catalog or lockfile is treated as a no-op, which makes canceling safe.

Repository automation under `scripts/` is TypeScript run through `tsx`, with an introductory comment that states the operational purpose and the invariant each script protects. Published runtime shims and tool-required configuration files may still use their required JavaScript module format outside that directory.

Markdown uses `TS` fences for illustrative fragments and lowercase `ts` fences for executable examples where appropriate. `pnpm run docs:examples` parses every TypeScript fence in the canonical README and documentation tree, then typechecks the package-backed examples under `docs/examples/`.

## 4. Top-level commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | install the workspace and optionally install the repository Git hook |
| `pnpm run dev` | run the SDK stub build and all demos |
| `pnpm run build` | build every workspace package with a build task |
| `pnpm run typecheck` | typecheck every workspace package that exposes a typecheck task |
| `pnpm run test` | run the complete SDK assertion suite |
| `pnpm run lint` | lint and format-check the repository with a persistent cache |
| `pnpm run lint:staged` | lint only staged files; this is the pre-commit guard |
| `pnpm run check:fast` | run cached lint, root tooling/browser-spec typechecking, incremental SDK typechecking, and non-editor SDK tests for the normal edit loop |
| `pnpm run clean:validation` | remove the exact ignored demo-generated declaration and adapter-cache paths before validation; release state is preserved |
| `pnpm run check` | run non-browser quality gates |
| `pnpm run validate` | run non-browser gates, the permanent canary, all demo builds, optimized-CSS checks, production/development browsers, and lifecycle cleanup |
| `pnpm run audit` | build and audit the canonical SDK fixture |
| `pnpm run docs:examples` | parse documentation fences and typecheck canonical examples |
| `pnpm run upi` | review default-catalog updates with a catalog-aware Clack multiselect |

### SDK

| Command | Purpose |
| --- | --- |
| `pnpm run sdk:dev` | run the SDK stub development build |
| `pnpm run sdk:build` | build `@mszr/vanity` |
| `pnpm run sdk:typecheck` | typecheck the SDK |
| `pnpm run sdk:test` | run every SDK assertion dimension |
| `pnpm run sdk:test:fast` | run runtime and emitted-output assertions without starting editor language services |
| `pnpm run sdk:test:dx` | run the Selenita editor-DX evidence dimension |
| `pnpm run sdk:test:types` | run the compile-time evidence dimension |
| `pnpm run sdk:test:watch` | run SDK tests in watch mode |

### Demos

| Command | Purpose |
| --- | --- |
| `pnpm run demo:main` | run the flagship Nuxt studio |
| `pnpm run demo:comparisons` | run the Vite comparison matrix |
| `pnpm run demo:typecheck` | prepare and typecheck all demos |
| `pnpm run demo:build` | build all demos |
| `pnpm run demo:e2e` | build, inspect CSS, run production/development browser suites, and verify process cleanup |

### Benchmarks and packaging

| Command | Purpose |
| --- | --- |
| `pnpm run bench:generate` | regenerate deterministic scale fixtures |
| `pnpm run bench:fixtures:check` | fail when generated fixtures drift |
| `pnpm run bench:resolution` | compare resolution-type encodings |
| `pnpm run bench:baseline` | build the SDK and record the current benchmark protocol |
| `pnpm run fresh:smoke` | pack the SDK and prove fresh strict testing-kit, Vite, and Nuxt consumers |
| `pnpm run publish:sdk:dry-run` | run the full gate and package rehearsal without changing versions |
| `pnpm run publish:sdk:patch` / `:minor` / `:major` | release: preflight, gate, rehearse, bump, publish, await npm, commit, tag, and push |

`pnpm run bench:baseline` is a manual release gate. Run it before release review and reconcile its raw, minified, and min+gzip package-entry measurements with [benchmarks.md](./benchmarks.md); it remains separate from `check` and `validate` because the measurement is intentionally reviewed as a baseline rather than run as a per-test assertion.

## 5. Test organization

SDK tests live beside the code they exercise in `sdk/src/`:

- `*.test.ts` — runtime behavior;
- `*.test-d.ts` — public type shape;
- `*.dx.test.ts` — editor completion, diagnostics, and hover;
- `*.out.test.ts` — emitted CSS and artifact shape.

Repository browser tests live in `tests/`. They own cross-package evidence that cannot belong to the SDK: `demos.spec.ts` and `scheme-axis.spec.ts` exercise built Nuxt/Vite applications, while `dev/nuxt-dev.spec.ts` proves first paint and HMR against the development server. The root `tsconfig.json` typechecks these Node/Playwright files and root tooling without making those concerns part of the reusable `tsconfig.base.json`. Shared demo data lives in `sandbox/fixtures/`; package-consumer fixtures live in `sdk/src/test-support/`.

The permanent evidence policy is [testing.md](./testing.md). A feature is complete only when the relevant runtime, type, editor, output, integration, packaging, and performance claims are independently proven.

Use `check:fast` while iterating and `check` before handing off non-browser work. `validate` remains the release-shaped gate: it deliberately pays for every canary, optimizer, browser, and development-lifecycle contract. The two levels differ in cadence, not standards; no release evidence was removed from the complete gate.

### 5.1 Spikes

A spike answers one question about what is *possible* before a design commits to it. It is not a test: tests defend behavior Vanity already has, while a spike measures the substrate — TypeScript, the bundler, the module system — to find out what a design may assume. `proven` in [docs/README.md](../README.md) means a pattern has isolated spike evidence behind it.

Four rules keep spikes durable:

1. **Substrate-agnostic.** A spike depends on TypeScript and its own fixtures, never on `@mszr/vanity`. A spike that imports the SDK expires when the SDK changes, which is exactly when its evidence would be most useful. Model Vanity's shape with local fixtures instead.
2. **Observational, never prescriptive.** A spike reports what happened: what held, what failed, what a measurement establishes, and what it cannot show. Decisions about what Vanity should therefore do belong in a plan or a specification. A spike that carries a verdict outlives the reasoning that produced it and starts to read as policy.
3. **Reproducible from a clean checkout.** `pnpm install --ignore-workspace` then `pnpm test`. A runner regenerates everything the root `.gitignore` excludes — `node_modules/`, `dist/`, `.vanity/` — so only authored fixture source is committed. Assert results against expectation rather than printing them for a human to interpret.
4. **Named for its question, not its subject.** The directory says what was asked; the README's opening paragraph says why it was worth asking, and its verdict line answers it.

A README carries: the question, how to run it, the setup, a results table, what the results establish and what they do not, and the footguns hit along the way. Cross-references to product code are welcome as context and should describe rather than cite paths, which rot.

Spikes are permanent references, not scratch work. When a spike's finding still governs a design decision, [architecture.md](./architecture.md) links it.

## 6. Generated and local state

The root `.gitignore` is the single ignore authority. Generated or machine-local state includes:

- `node_modules/`, `dist/`, `.nuxt/`, `.output/`, and `styled-system/`;
- `.turbo/`, `.pnpm-store/`, coverage, Playwright results, and TypeScript build info;
- `.vanity/` manifests, benchmark measurements, release validation receipts, and in-flight release records;
- generated auto-import declarations.

The validation entrypoints clear only the demo-generated declaration and adapter-cache paths before typechecking. This prevents an ignored ambient file from masking a removed or renamed import while preserving the root `.vanity/` receipts, benchmark measurements, and resumable release records.

Non-Nuxt demos run `vanity prepare` before typechecking, so a clean checkout has the generated ambient declarations its `*.css.ts` and application modules rely on; the command's contract lives in [spec-integrations.md §8](../reference/spec-integrations.md#8-integration-adapters). The Turbo `prep` task declares the canonical `.vanity/types/` directory and the `@types/vanity-*-auto-imports` bridges as outputs, so a cached preparation stays usable by the dependent typecheck task.

Checked-in benchmark fixtures under `benchmarks/generated/` are deterministic source artifacts and are guarded by `pnpm run bench:fixtures:check`.

The canary's `sandbox/canary/dist-ssr/entry-server.js` is intentionally tracked as a bundle-composition tripwire. `pnpm run canary:validate` rewrites it during the SSR build; review changes to that artifact as evidence of what the published runtime path pulls into the canary, rather than treating it as disposable local output. Other generated `dist/` directories remain ignored.

## 7. CI

`.github/workflows/ci.yml` runs two parallel jobs:

1. types, tests, documentation examples, audits, lint, and benchmark drift;
2. the permanent canary, demo builds, optimized-CSS checks, production and development browser suites, lifecycle cleanup, and fresh packed consumers.

Both jobs install from the root lockfile. The workflow carries read-only repository permissions and never publishes.

## 8. Releases

The SDK package metadata points to `https://github.com/mareszhar/vanity` and declares `sdk/` as its repository directory.

Release tooling is intentionally review-first, and a release is one command, happy path included. The one precondition it asks of the maintainer: the working tree must be clean before `pnpm run publish:sdk:patch`, `:minor`, or `:major` starts — whatever history led there, squashed or not.

Given that, the command verifies npm authentication and target-version availability before any expensive work, runs the complete gate and packaging rehearsal, bumps `sdk/package.json`, rebuilds, publishes `@mszr/vanity`, waits for registry visibility, then commits the bump as `🔖 release v<version>`, tags `HEAD` as `v<version>`, and pushes the branch and tag to `origin`. The only remaining step is attaching release notes to the GitHub release the pushed tag makes available.

`pnpm run publish:sdk:dry-run` proves the same gate and packaging rehearsal without changing anything.

Failure handling is explicit:

- Validation and packaging receipts under ignored `.vanity/` are keyed to a digest of repository content with the manifest version masked, so unchanged inputs are never revalidated — not even after the bump itself. `VANITY_FORCE_VERIFY=1` ignores receipts; `VANITY_UNSAFE_PUBLISH_SKIP_CHECKS=1` skips the gate entirely and is never appropriate for a real release.
- A failure before publication restores `sdk/package.json` and leaves no release state.
- Once published, the bump is permanent: the release is recorded under `.vanity/`, and re-running the same `publish:sdk:<bump>` command resumes registry propagation, commit, tag, and push individually — whichever of those didn't complete — instead of re-bumping or re-publishing.
