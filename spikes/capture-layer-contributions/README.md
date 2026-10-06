# Can independent authoring bundles contribute an order to the currently installed backend capture?

A system's layer order has to reach every stylesheet that carries its rules, even when the system was authored in a different bundle than the style module being captured. This spike checks that a capture installed on the shared backend can own that order across lifetimes. It imports no Vanity code.

**Verdict:** yes. Independently bundled copies contribute through one installed capture, and the declarations match the backend's own.

## Run

Use the workspace-pinned Node and pnpm. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm test
```

## Setup

Two independently bundled fixture authoring modules externalize the same vanilla-extract backend. An installed adapter consumes their layer-order contribution and renders native `globalLayer` declarations.

## Observed result

Both bundled copies keep complete, repeated headers across three captures and nested restoration, with unchanged layer bytes.

| Observation | Result |
| --- | --- |
| Three capture lifetimes | Complete headers from both bundles in every capture |
| Nested capture and restore | Outer capture remains usable after restoring its adapter |
| Native layer byte control | The contribution emits the same bytes as native declarations |

## Limits and footguns

This isolates contribution ownership. Cached systems, raw batching, and identity controls remain integration evidence.
