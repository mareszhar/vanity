# Spike: policy as law

This isolation spike proves the two mechanics that are hardest to debug inside the accumulated system type:

1. a bound forbidden constructor keeps its name and a useful replacement diagnostic, while portable calls remain policy-agnostic;
2. prospective enforcement compares value-registration revision to the policy revision, while retroactive enforcement scans every value.

The product implementation may use richer provenance, but must retain these observable semantics and Selenita locality.

## Run

Use the workspace-pinned Node and pnpm. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm test
```

Dependencies use the shared catalog and root lockfile; the model imports no SDK code.
