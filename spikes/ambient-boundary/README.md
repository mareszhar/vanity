# Spike: ambient auto-imports across a package boundary

A **library-agnostic** probe of the question raised by a monorepo adopter: a package authors `*.css.ts` and **ships TypeScript source**, so every downstream program that compiles that source inherits its ambient-declaration requirement. Today that surfaces as `error TS2304: Cannot find name 'cls'` pointing at a file in a *different* package, fixable only by giving every consumer — including consumers with no styling concern — a `vanity.config.ts`, a `types` entry, a `@mszr/vanity` devDependency, and a `prepare` step.

Two questions, both empirical:

1. can a **type-only unlock import** (`import type {} from '<pkg>/vanity-style-auto-imports'`) carry the declaration dependency with the source, so consumers need nothing?
2. if it can, does it **compose** with a host that generates its own declarations the way vanity does today?

Verdict: **yes to (1); (2) collides under `declare const` and composes under `declare var`, which still rejects genuinely divergent declarations.**

## Run it

```sh
cd spikes/ambient-boundary
pnpm install --ignore-workspace
pnpm test
```

`run.mjs` generates everything a real build would produce — the design package's `dist`, the host's `.vanity` declarations, and the `node_modules` links that make the fixtures resolve as published packages — then runs each `tsc` project, asserting clean-vs-errors against expectation. Generated paths are gitignored; only authored fixture source is committed.

## The setup

Real package boundaries via `node_modules` links and `exports` maps — not `paths` aliases — so resolution is faithful to a published package.

```text
packages/design            publishes ./authoring (the barrel) and
                           ./vanity-style-auto-imports (the generated ambient module,
                           byte-shaped like sdk/src/internal/autoImportDeclarations.ts)

packages/author-unlocked   ships SOURCE; bare `cls`/`t` + one type-only unlock import
packages/author-bare       ships SOURCE; bare `cls`/`t`, no unlock import   (control)
packages/author-mixed      ships SOURCE; one explicit-import file beside one unlock file

consumer/                  re-exports the authoring package. No vanity config, no
                           types entry, no devDependency — the innocent middle package.
host-generating/           generates its OWN ambient declaration (what vanity does
                           today) and also consumes an unlocked package.
host-deferring/            generates nothing; relies on the package-provided module.
conflict/                  two declarations of one name, divergent vs identical types.
emit-check/                the unlock import under verbatimModuleSyntax, with emit.
```

## Results (TS 6.0.3, Apple Silicon, 2026-08)

| case | declaration | result |
| --- | --- | --- |
| T1 intermediate consumer compiles source carrying the unlock import | `const` | clean |
| T2 control — same source, no unlock import | `const` | `TS2304` on `cls`, `t` |
| T3 host generating its own globals + consuming an unlocked package | `const` | `TS2451` ×4 |
| T4 host deferring to the package-provided declaration | `const` | clean |
| T5 T3 again, both declarations emitted as `var` | `var` | clean |
| T6 two `var` declarations, same name, **divergent** types | `var` | `TS2403`, naming both types |
| T7 two `var` declarations, same name, **identical** type | `var` | clean |
| T8 unlock import under `verbatimModuleSyntax`, with real emit | `const` | clean; fully elided |
| T9 consumer of a package whose files mix explicit-import and unlock styles | `const` | clean |

### 1. The unlock import works, and costs nothing at runtime

T1 against T2 is the whole finding: one line in the authoring package removes the requirement from every downstream consumer. The mechanism is that a type-only import is still a **resolved** import — TypeScript must load the target module to check the import statement, and loading it pulls its `declare global` block into whatever program includes the file. Global scope is program-wide, so the names then resolve in every file that program compiles.

T8 confirms the line survives `verbatimModuleSyntax` and is erased from emit: the emitted JS is `export const button = cls({ color: t.color.brand });` with no trace of the import, and the emitted `.d.ts` is a clean `export declare const button: string`.

That emitted JS also makes the division of labour explicit: **the unlock import fixes only the type half.** The value half is unchanged — the building host's compiler still injects the real import when it evaluates the `*.css.ts`. An intermediate consumer only ever typechecks the file, which is exactly why types alone are enough for it.

T9 adds that the choice is **per file, not per package**: one package holding an explicit-import file beside an unlock file compiles clean in an unconfigured consumer, because each file carries its own answer to where its names come from.

### 2. `const` is the reason declarations cannot compose

T3 is the coexistence failure, and it is not subtle: two `declare global` blocks declaring one name are a hard `TS2451`, because **block-scoped declarations cannot be redeclared even when their types are identical**. Vanity emits `const` ([autoImportDeclarations.ts:28](../../sdk/src/internal/autoImportDeclarations.ts:28)), so any two generated declarations covering one name are mutually exclusive by construction.

`var` is the platform's own answer — it is why `lib.dom.d.ts` writes `declare var window: Window` rather than `const`. T5 and T7 show identical-type redeclaration becoming legal, and **T6 shows the safety is retained**: divergent types still fail, with an error naming both offending types.

## What the matrix establishes

**The keyword, not the topology, decides whether declarations compose.** Every case that fails under `const` passes under `var` with no other change (T3/T5), and the two mechanisms that look like prerequisites for composition are not:

- a host **deferring** to a package-provided declaration composes (T4), but so does a host generating its own alongside it once the keyword changes (T5) — deferral is one way to compose, not the only one;
- **divergence is still caught** under `var` (T6), with `TS2403` naming both offending types, so redeclaration tolerance is not blanket tolerance.

The limits of what these cases can show: `TS2403` names the conflicting *types*, never the configuration that produced them, so a toolchain wanting to name a config key has to carry its own check. And T1 establishes only that the **type** dependency travels with source — the value dependency is out of scope here, since the emitted JS (T8) still calls a bare `cls` that something else must supply.

## Footguns encountered

- `allowImportingTsExtensions` requires `noEmit`/`emitDeclarationOnly`; the emit-checking project needs its own tsconfig rather than an extension of the type-checking base.
- The unlock import must name a module that resolves **from the consumer's** context, so the published declaration has to reference the barrel by bare specifier, not a relative path. The generated text is already portable this way and must stay so.
- `skipLibCheck: true` does **not** rescue T3: the redeclaration is reported at the program level, not only inside the `.d.ts`.
- Generated fixture paths collide with the repo's root `.gitignore` (`node_modules/`, `dist/`, `.vanity/`). The runner regenerates all three, so a fresh checkout works without a build step.
