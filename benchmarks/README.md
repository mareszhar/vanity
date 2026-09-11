# vanity scale benchmarks

The checked-in `generated/` fixtures are deterministic consumer projects for the current public API. They keep stable token, module, axis, and consumer shapes so measurements remain comparable as the implementation evolves.

## Fixture set

- `small`: 50 tokens, 2 modules, 5 style/recipe consumers.
- `medium`: 500 tokens, 10 modules, 30 consumers.
- `large`: 5,000 tokens, 50 modules, 150 consumers.

## Commands

```sh
pnpm run bench:generate        # rewrite deterministic fixtures
pnpm run bench:fixtures:check  # fail when checked-in fixtures drift
pnpm run bench:baseline        # build SDK, verify accepted facts, and record metrics
```

The fixture checker uses the repository root by default. Pass `--workspace <path>` to `scripts/generate-benchmarks.ts --check` when checking an isolated workspace copy without mutating the checkout.

## Outputs

Machine-readable results go to the ignored `.vanity/benchmarks/current.json`. Reviewed byte facts live in [`accepted.json`](./accepted.json), while the human-readable baseline lives in [the maintainer benchmark record](../docs/maintainers/benchmarks.md); transient machine and cache noise does not belong in version control.

The corpus uses the canonical system and token-module APIs and scales from two to four environmental axes. It includes native color-scheme output, color-agnostic axis fixtures, sparse cross-axis cases at representative module intervals, token/style completion, runtime mutation, and snapshot overhead.
