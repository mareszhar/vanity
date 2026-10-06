# Which lifecycle and HTML context facts identify active Vite 6 browser builds?

A plugin reused across builds has to know which build an HTML hook is serving, and Vite 6 gives HTML hooks no environment. This spike records which lifecycle and HTML context facts still identify the one active browser build. It imports no Vanity code.

**Verdict:** the owning browser build is identifiable in every tested topology except concurrent builds of the same root, which filename alone cannot tell apart.

## Run

Use the workspace-pinned Node and pnpm. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm test
```

## Setup

One Vite 6.4.3 plugin observes `configResolved`, the environment-owned lifecycle hooks, and the HTML context. Plain HTML fixtures reuse the plugin sequentially, overlap browser and SSR builds and distinct roots, include multiple entries, and close a watch host.

## Observed result

Sequential reuse, overlapping browser/SSR builds and distinct roots, multiple HTML inputs, and watch closure each leave one owning active browser build.

| Observation | Result |
| --- | --- |
| Sequential reuse | Each HTML hook has one active owning browser build |
| Browser/SSR and distinct roots | Filename and inputs distinguish the active browser owner |
| Multiple entries | Each entry resolves its owning host |
| Watch closure | All groups inactive and closed after `closeWatcher` |

## Limits and footguns

Temporary roots are normalized with `realpath`. HTML hooks have no environment; lifecycle hooks do. Concurrent browser builds of the same root are not distinguished by filename alone.
