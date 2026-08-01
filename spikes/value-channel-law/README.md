# Spike: value-channel law

This is a library-agnostic proof for two patterns needed by a typed styling harness. It imports nothing from Vanity.

1. An unfinished logical reference stays value-capable by carrying a semantic path. A later host rebinds that path to its final emitted name; no temporary name or object coercion crosses the boundary.
2. A relative channel operation is an immutable left-associated expression. The first operation starts from the channel, and every subsequent operation composes on the result with exact completion.

Run independently:

```sh
pnpm install --ignore-workspace
pnpm run check
pnpm run test
```

The product graduates the patterns only after equivalent value/output/DX and live-browser fixtures pass.
