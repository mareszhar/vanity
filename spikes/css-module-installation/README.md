# Can a CSS module report completion after native installation, independently of websocket message ordering?

A development page must keep its old stylesheet until the replacement is installed, and message order alone cannot tell the host when that happened. This spike checks whether a CSS module can report completion after Vite's native installation. It imports no Vanity code.

**Verdict:** yes, on every supported Vite major.

## Run

Use the workspace-pinned Node and pnpm. From this directory:

```sh
pnpm install --ignore-workspace
pnpm test
```

The runner accepts absolute Vite Node entry paths after `pnpm test` to measure each supported host, and Chromium needs the host's browser permissions.

## Setup

Native Vite serves a source that imports a new CSS module and separately updates stable CSS. A post-order transform reports evaluation through the native hot channel. Two Chromium pages delay requests independently, and the server holds native retirement until each page reports both installations.

## Observed result

Vite 5.4.21, 6.4.3, 7.3.6, and 8.3.1 all report completion after native `updateStyle`. Stable and new-ID CSS, and two clients delayed by 600 ms and 1200 ms, prune without a gap.

| Observation | Result |
| --- | --- |
| Vite 5.4.21 | Completion and per-client native prune pass |
| Vite 6.4.3 | Completion and per-client native prune pass |
| Vite 7.3.6 | Completion and per-client native prune pass |
| Vite 8.3.1 | Completion and per-client native prune pass |

## Limits and footguns

The probe holds retirement before the native prune. This establishes the post-transform completion seam, not the compiler's generation, failure, or supersession bookkeeping.
