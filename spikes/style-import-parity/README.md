# Can style imports reuse the client resolver?

Style modules execute in Node while their CSS is consumed by client code. This experiment asks whether an evaluator can reuse the existing client plugin container, retain alias and plugin choices, and select Node package entries when the written request identifies the package. A second plugin pipeline would repeat initialization; an attempt to invert browser filenames loses the original request when multiple package subpaths share a browser file.

**Observed:** the existing client container supplies aliases, plugin choices and virtual source. Package-name requests can select Node entries without inverting filenames. The evaluator creates no second pipeline and adds no lifecycle calls. Resolution during buildStart can select a different file from client resolution after plugin initialization, even in that same pipeline. Nuxt initialization alone does not expose its complete client pipeline.

Run from a clean checkout with the repository’s pinned toolchain:

```sh
pnpm install --frozen-lockfile
pnpm --filter spike-style-import-parity check
pnpm --filter spike-style-import-parity test
```

`run.mjs` uses the catalog Vite. Set `VANITY_VITE_TEST_ENTRY` to another installed Vite’s Node entry to repeat its development/build/watch matrix. Fixtures and receipts are regenerated under ignored `.vanity/`; no SDK dependency or source import is used.

| Observation | Setup | Result |
| --- | --- | --- |
| Client aliases and plugin choices | String and regex aliases, an environment-initialized resolver plugin | Client project file or browser package file retained |
| Package requests | Exact and patterned exports, nested conditions, browser string/map entries, disabled main/subpath, browser-null export | Node target from the written package request |
| Redirects | A package name redirected into another package; opaque plugin requests sharing one browser file | Client target retained |
| Builtins | Authored `node:fs` and `fs`; a bare `buffer` name redirected to an installed package | Native filesystem builtin; selected polyfill file |
| Compiler implementation | A local compiler-shaped package importing `node:buffer` | Node imports remain outside delegation |
| Virtual source | Resolver returns a NUL-prefixed ID; the same container loads its source | Executable virtual module |
| Optimized sources | Named, alias and plugin imports resolve into the client optimizer cache | Live metadata supplies the original browser source before cache publication; named request selects Node, other requests retain that source, and an edit is reevaluated from the original file |
| Honest failures | Opaque browser-disabled request; direct/transitive throws, two browser entries in one importer chain, unmapped stack | Every implicated import site and package-name repair included; an unmapped stack retains its message and labels files as possible causes |
| Preparation timing | A later sequential buildStart initializes a resolver that selects ordinary files | Early evaluation selects before.js; evaluation after initialization and client code select client.js; virtual system imports load after initialization |
| Lifecycle | Every configured configureServer/buildStart/closeBundle instrumented | Each phase/plugin/environment key runs once |
| Plain headless acquisition | Project config, middleware mode, HMR and WebSocket transport disabled | No listening socket; clean close |
| WXT and Vitest | Their public server-creation APIs, existing client containers | Executable import matrix; no listening with both transports disabled |
| Nuxt | Initialization followed separately by a real dev host build | No client pipeline at initialization; both dev hosts use the existing client container |

The experiment models evaluation and compiler ownership locally. It does not establish Vanity’s CSS bytes, diagnostic schema, ownership graph, HMR invalidation or configured-system instance sharing. Those require integration evidence. Release probes separately captured real SDK CSS and diagnostics through the observed host callbacks; a prototype capture still does not replace the integrated host gate.

The failure attribution model starts from the source-mapped throwing module and walks the bundle's recorded metafile importers. Direct and re-exported failures, multiple browser entries in one chain, and possible-cause hints for unmapped stacks are exercised. A file selected by an alias or plugin is allowed to execute; its browser metadata is consulted only when evaluation fails. A same-package alias to a different entry still selects Node from the original package request.

Vite’s development plugin container can return a physical ID with a cache query and then return no source from `load()`. Its filesystem fallback runs outside the plugin container. The model keeps the returned ID, reads the physical filename only for that fallback, and lets explicit load hooks handle semantic queries. Vite 8’s buildStart virtual loading is unavailable even though transform-time loading works. Preparation timing therefore cannot be inferred from a transform-time success.

WXT’s default Vite WebSocket transport calls listen even when HMR is disabled. The host owns that socket and closes it; setting both `server.hmr: false` and `server.ws: false` gives a transportless headless instance. Nuxt’s configured Vite pipeline is assembled inside its framework build, rather than by `loadNuxt({ready:true})`; the experiment keeps those two observations separate.

`preparation.mjs` reproduces the timing difference for ordinary files, then loads a virtual system import after initialization. No second pipeline is created. Resolver identity alone does not establish answer stability across plugin initialization. Evaluation after initialization observes the client choice.

`optimizer.mjs` separately enables native optimization. On Vite 6–8, the client environment’s `depsOptimizer.metadata.optimized` and `discovered` records identify each cache answer’s original `src` immediately. Normalization precedes package-name selection for every request. A cache answer without an original-source record cannot be evaluated safely and stops compilation. The independent experiment checks original inputs and reevaluation after an edit; Vanity’s ownership and HMR behavior still require the integrated compiler tests.

The complete independent matrix passes on Vite 6, 7 and 8, including optimizer normalization. Vite 6 and 7 throw a package-entry resolution error when a package's own `exports.browser` condition is `null`; Vite 8 returns its Node file. The named request's Node file and package metadata authorize Node selection in either case. Unrelated host failures retain the native message, and a file redirected into another package retains the client answer.
