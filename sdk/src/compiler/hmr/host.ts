/** Host operations required by compiler-owned style and graph HMR. */

export interface CompilerHmrHost {
  /** Browser import URL, including the host's public base. */
  readonly resolveBrowserModuleUrl: (id: string) => string
  /** Invalidate and request an already-served CSS module update. */
  readonly updateCssModule: (id: string) => void
  /** Retire CSS modules from every host graph when their last owner leaves. */
  readonly removeCssModules: (ids: ReadonlySet<string>) => void
  /** Request a full browser reload after an incompatible module export change. */
  readonly sendFullReload: () => void
  /** Modules with this physical source in any client or SSR graph. */
  readonly findModulesByFile: (file: string) => readonly object[]
  /** An existing compiler-owned runtime module. */
  readonly findModulesById: (id: string) => readonly object[]
  /** Mark every environment node for a compiler-owned runtime module invalid. */
  readonly markModulesInvalidById: (id: string) => readonly object[]
  /** A base-less graph URL lookup across client and SSR graphs. */
  readonly findModulesByUrl: (url: string) => Promise<readonly object[]>
  /** Materialize a failed first-request entry for a same-server retry. */
  readonly ensureEntryFromUrl: (url: string) => Promise<object>
  /** Invalidate a module in the graph that owns it. */
  readonly markModuleInvalid: (module: object) => void
  /** The graph URL stored on a module node, if it has been created. */
  readonly getModuleUrl: (module: object) => string | undefined
  /** Convert a style source path and optional graph URL into the host graph address. */
  readonly getGraphModuleUrl: (sourcePath: string, graphUrl?: string) => string
  /** Re-run one dependent style transform through the active client pipeline. */
  readonly compileStyle: (file: string) => Promise<void>
}
