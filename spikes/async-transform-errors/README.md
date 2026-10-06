# Can an asynchronous transform avoid an outdated error without suppressing real failures?

A compiler can retain accepted exports while their replacement is being prepared. Reading those exports during a save can produce an error that the replacement already resolves. This spike compares waiting for that known evaluation with an immediate cache read and a fixed diagnostic grace period. It imports no Vanity code.

**Verdict:** Vite can keep the request pending until current output is ready, without a terminal error or browser overlay. A fixed grace period does not establish that the replacement is ready.

## Run

Use the workspace-pinned Node and pnpm. Dependencies use the shared catalog and root lockfile. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test
```

To inspect another installed host, pass its absolute Vite Node entry path after `pnpm test`. The runner accepts several paths.

## Setup and observations

A local plugin models a cached system and an asynchronous replacement defining a missing `menu` role. A browser requests its consumer while the replacement is pending. The runner holds that evaluation for 100 ms after the transform starts, then verifies native terminal logging, the error overlay and computed font size. Each policy also receives a persistent missing-role failure.

Vite 5.4.21, 6.4.3, 7.3.6 and 8.3.1 produce the same results:

| Transform policy | Known replacement pending | Persistent missing role |
| --- | --- | --- |
| Read accepted exports | Terminal error and overlay | Terminal error and overlay |
| Wait for the known evaluation | 14px output; no terminal error or overlay | Terminal error and overlay |
| Wait 50 ms, then read accepted exports | Terminal error and overlay | Terminal error and overlay |

## Limits and footguns

The held evaluation establishes transport behavior, not a latency estimate for a real compiler. The model does not establish dependency ownership, snapshot verification, HMR ordering or supersession; those need compiler integration evidence. It cannot identify whether a future save will repair a currently invalid expression.

Older Vite hosts treat `port: 0` as the default port. The runner obtains a free port through Node before starting each server. Chromium must match the standalone Playwright version.
