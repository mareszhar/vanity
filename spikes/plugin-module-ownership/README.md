# Spike: plugin module ownership

A library-agnostic proof of where a Vite plugin can own one module, including a physically installed package, across client and SSR graphs. The fixtures are generated into temporary projects; the local plugin never imports Vanity.

## Run it

```sh
cd spikes/plugin-module-ownership
pnpm install --ignore-workspace
pnpm run validate
```

The spike pins Vite 8.2.2 and Vitest 4.1.10 directly. Its fixture runner writes package files into a real temporary `node_modules` directory and generates the plain application graph.

## Claims

| id | asserted claim | evidence |
| --- | --- | --- |
| **MO1** | Resolve-stage nested resolution and unfiltered `load` run for unowned graph modules; a native `load` filter and no plugin invoke no handler for them. Timings are informational. | `src/ownership.test.ts` |
| **MO2** | On tested Vite 8.2.2, dev caches each hook filter on first use by plugin object; one-shot builds read filters afresh, while a watch host snapshots filters when created. Sequential and concurrent client/SSR builds, shared dev caches, and the first-call hold behave as recorded below. Vite 5–7 behavior is attributed to source reading and the supported-major product matrix. | `src/ownership.test.ts` |
| **MO3** | `load` substitutes a physical member under its own ID in client and SSR development and builds. Importers consume the generated exports, the plugin supplies an empty source map, and query-bearing IDs are observed. | `src/ownership.test.ts` |
| **MO4** | The dependency scanner calls `resolveId` with `scan: true`, reads member source from disk without calling plugin `load`, follows the real import graph, and stops when scan resolution returns a `\0` ID. | `src/ownership.test.ts` |
| **MO5** | A physical package is optimized by default and passes through `load` when excluded in `config`; transitive imports from optimized packages and an included subpath of an excluded package are observed. | `src/ownership.test.ts` |
| **MO6** | SSR development externalizes an installed JavaScript package without a plugin resolver call; `ssr.noExternal` routes it through `load` in SSR development and build. | `src/ownership.test.ts` |
| **MO7** | Filtering a substituted member from `handleHotUpdate` stops propagation in client and SSR graphs, and the next request runs `load` again. | `src/ownership.test.ts` |

## Results

Observed with Vite 8.2.2, Rolldown 1.2.9, and Node 24.21.0 on darwin arm64:

| claim | result |
| --- | --- |
| MO1, 80 generated plain modules | Nested `resolveId`: 163 invocations. Unfiltered `load`: 80. Native `load` filter: 0. No plugin: 0. |
| MO1, local build time | Nested resolution: 52 ms; unfiltered `load`: 11 ms; filtered hook: 11 ms; no plugin: 10 ms. These are one-run fixture timings and informational only. |
| MO2, development cache | Vite's dev container compiles each hook filter at first use and stores it in a process-wide `WeakMap` keyed by plugin object (`getCachedFilterForPlugin` in `vite/dist/node/chunks/node.js`). The first dev server's absent filter remains cached by later dev servers using that object, even after one-shot builds narrow the same hook; the test proves those later servers still call the handler for plain files outside the visible filter. |
| MO2, pre-first-call hold | On tested Vite 8.2.2, a build started after a dev server's `config` but before the first dev handler call runs with both late-narrowed filters absent. It still projects its member, and its unowned files also reach `load`; this is the correct-but-slower interval before the development cache exists. That first call releases only its hook's hold, permanently for the shared plugin object. Vite 5 needs no hold because its dev server does not apply or cache filters; Vite 6 and 7 are covered by source reading and the supported-major matrix. |
| MO2, sequential builds | A client build followed by an SSR build using one plugin object both project their own members. The second filter is a new object describing the growing union; each build's handler calls are limited to its own member. |
| MO2, concurrent builds | Per-host narrowing races: the client build reads the SSR filter and ships its member from disk. A growing union keeps both projections correct, with calls only for the two member modules. |
| MO2, watch | The runtime probe mutates a hook's filter during the first watch load, then triggers a second rebuild. Both builds still use the filter snapshot taken when the watcher was created: watch reads it once, not per call or rebuild. Source inspection confirms this: Vite's `buildEnvironment` resolves Rolldown options before calling `watch`; Rolldown's `createWatcher` calls `PluginDriver.callOptionsHook` and `createBundlerOptions` once for each output; `createBundlerOptions` binds the filter into the plugin hook sent to the native watcher. |
| MO3, module identity | Client dev, SSR dev, client build, and SSR build all keep the physical member path as the module ID and bind the generated export. |
| MO3, queries | Development HTTP requests with `?raw` and `?url` are handled by Vite without reaching plugin `load`; `?raw` returns authored text and `?url` returns a URL export. Query-bearing `?t=` and `?v=` requests reach `load`, and the plugin container dispatches an explicit `?import` module ID to it. The dev HTTP middleware removes its import marker before `transformRequest`, so `?import` is tested at the plugin-container boundary. |
| MO4, scan shield | The dependency scan resolves through the plugin container with `scan: true`, reads the authored member's real import graph without calling plugin `load`, discovers the visible package, and stops at the plugin's `\0` result without discovering the package behind it. |
| MO5, optimization | A physical package is optimized by default in dependency scan and ordinary dev resolution. Excluding a package prevents its own optimization and sends its physical module through `load`. An optimized parent keeps a bare import for an excluded child; an explicit include of an excluded child's subpath optimizes that subpath. |
| MO6, SSR | SSR development and build externalize an installed `.js` package before the plugin resolver or `load` runs. Adding it to `ssr.noExternal` sends it through the pipeline, and the projection is used in both environments. |
| MO7, HMR | The client and SSR graphs contain the physical member ID. `handleHotUpdate` receives that member and returns an empty module list; the next client and SSR requests invoke `load` again. |

The implementation follows the observed Vite 8.2.2 behavior: member-dependent narrowing is held until each hook's first dev-environment call, then released for every dev server sharing the plugin object; a watch build holds both hooks for its lifetime and never joins its changing member set to the one-shot union. Vite 5–7 compatibility is separately established by source review and the product matrix.

## What this establishes

The spike isolates Vite behavior from the SDK. It does not establish compatibility across the published Vite range; the product matrix owns that evidence. It does not establish Nuxt's multi-host behavior or packed consumer behavior; fresh consumer tests own those paths.

## Footguns

Vite 6+ dev filters are cached process-wide by plugin object at each hook's first call; Vite 5 dev does not apply filters. Builds read the live filter differently: Vite 8 binds it for each one-shot build, Rollup compiles it per build, and Rolldown snapshots it once when a watch host is created. Keep development filters host-invariant, grow one-shot build filters monotonically with fresh objects, and hold each late-narrowed hook until its first dev call proves the absent filter was cached for every server sharing that plugin object. A watch host holds both late filters until it closes. Record any further host behavior that differs from these claims with the tested Vite version and the resulting limit on the design.
