# Spike: symmetric authoring grammar

This spike isolates the shared six-form builder grammar and the corresponding system direct/callback mount. It proves that accumulated callback context stays exact, duplicates fail at the offending name, module arrays merge sequentially, and a realistic 500-leaf module spends one system link.

## Run

Use the workspace-pinned Node and pnpm. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm test
```

Dependencies use the shared catalog and root lockfile; the model imports no SDK code.
