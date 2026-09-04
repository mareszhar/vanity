# vanity scale benchmarks

The checked-in `generated/` fixtures are deterministic consumer projects for the current public API. They keep stable token, module, axis, and consumer shapes so measurements remain comparable as the implementation evolves.

- `small`: 50 tokens, 2 modules, 5 style/recipe consumers.
- `medium`: 500 tokens, 10 modules, 30 consumers.
- `large`: 5,000 tokens, 50 modules, 150 consumers.

Commands:

```sh
pnpm run bench:generate        # rewrite deterministic fixtures
pnpm run bench:fixtures:check  # fail when checked-in fixtures drift
pnpm run bench:baseline        # build SDK and record all current metrics
```

Machine-readable results go to the ignored `.vanity/benchmarks/current.json`. Accepted human baselines live in [the maintainer benchmark record](../docs/maintainers/benchmarks.md); transient machine and cache noise does not belong in version control.

The corpus uses the canonical system and token-module APIs and scales from two to four environmental axes. It includes native color-scheme output, color-agnostic axis fixtures, sparse cross-axis cases at representative module intervals, token/style completion, runtime mutation, and snapshot overhead.
