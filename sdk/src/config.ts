import type {
  VanityAppAutoImports,
  VanityAppAutoImportsOptions,
  VanityAppAutoImportSource,
} from './internal/applicationImports'

/** Naming strategy for generated classes and custom properties. */
export type VanityIdentifierMode = 'debug' | 'short'

/** Low-level mode forwarded to the underlying vanilla-extract Vite plugin. */
export type VanityCompilerMode = 'transform' | 'emitCss' | 'inlineCssInDev'

/** A Vanity-owned reference to the configured `compiler.system` module. */
export type VanitySystemAutoImportSource = '$system'

interface VanityStyleAutoImportsWithInclude {
  /** Source module. `$system` reuses `compiler.system`. */
  from?: string | VanitySystemAutoImportSource
  /** Keep only these named exports. */
  include: readonly string[]
  exclude?: never
}

interface VanityStyleAutoImportsWithExclude {
  /** Source module. `$system` reuses `compiler.system`. */
  from?: string | VanitySystemAutoImportSource
  include?: never
  /** Remove these named exports. */
  exclude: readonly string[]
}

/** A filtered source routed into the style-module role. */
export type VanityStyleAutoImportsOptions
  = VanityStyleAutoImportsWithInclude
    | VanityStyleAutoImportsWithExclude

/**
 * Names injected into evaluated `*.css.ts` style modules.
 *
 * A string names a module source. `$system` is the explicit shorthand for the
 * configured `compiler.system` entry. An object adds `include` or `exclude`;
 * omitting `from` there also means `$system`.
 */
export type VanityStyleAutoImports
  = string
    | VanityStyleAutoImportsOptions

/** One source that can be routed into both module roles. */
export type VanitySharedAutoImports = VanityStyleAutoImports

/** Module-role auto-import routing. */
export interface VanityAutoImportRouting {
  /** Inject this source into both module roles. This is not a third role. */
  shared?: VanitySharedAutoImports
  /** Inject authoring values only into evaluated `*.css.ts` style modules. */
  style?: VanityStyleAutoImports
  /** Inject application-facing values only into application and SSR modules. */
  app?: VanityAppAutoImports
}

/** A direct source string means `shared`; omit the key to inject nothing. */
export type VanityAutoImports = string | VanityAutoImportRouting

/**
 * Describes one plain consolidated system for compiler and application projection.
 *
 * A string in `compiler.system` is shorthand for `{ entry: string }`. Use the
 * object form when a prebuilt portable artifact or a non-default contract
 * export must be paired with the source module.
 */
export interface VanitySystemSource {
  /**
   * Module path or package specifier that exports the consolidated system.
   */
  entry: string
  /** Optional portable JSON artifact to validate and use for browser/SSR projection. */
  artifact?: string
  /** Package identity for stale-pair diagnostics; inferred when omitted. */
  packageName?: string
  /** Contract export to use when the entry cannot be inspected; defaults to `ds`. */
  exportName?: string
}

/** Compiler options shared by the Vite, Nuxt, and WXT host adapters. */
export interface VanityCompilerOptions {
  /**
   * Naming strategy for emitted classes and custom properties. Defaults to
   * `debug` in development and `short` in production.
   */
  identifiers?: VanityIdentifierMode
  /**
   * Low-level mode forwarded to the composed vanilla-extract plugin. This is
   * for `*.css.ts` coexistence and does not change Vanity's compiler contract.
   */
  unstableMode?: VanityCompilerMode
  /**
   * Plain consolidated system module(s) to evaluate. App and SSR imports are
   * replaced with a portable application-system projection, while style
   * compilation executes the full system entry. A string is the common form;
   * use an object or array for paired artifacts, custom export names, or
   * multiple systems.
   */
  system?: string | VanitySystemSource | readonly (string | VanitySystemSource)[]
  /**
   * Optional host-wide CSS cascade-layer order. Vanity emits these roots once
   * as the first stylesheet; when omitted, it derives the order from configured
   * system roots.
   */
  layerOrder?: readonly string[]
  /** Directory for compiler-owned system artifacts; defaults to `<root>/.vanity`. */
  artifactDirectory?: string
  /** Receives structured compiler and integration diagnostics. */
  diagnostics?: import('./diagnostics').VanityDiagnosticSink
}

/**
 * Host-neutral configuration shared by `defineVanityConfig`, `vanityPlugin`,
 * the Nuxt adapter, and `vanity prepare`.
 *
 * `compiler` configures Vanity's compiler. `autoImports` routes sources into
 * style and application module roles, so the same config travels between
 * Vite, Nuxt, WXT, and preparation tooling unchanged.
 */
export interface VanityConfig {
  /** Compiler configuration for systems and evaluated `*.css.ts` modules. */
  compiler?: VanityCompilerOptions
  /** Sources routed into style and application module roles. */
  autoImports?: VanityAutoImports
}

export type {
  VanityAppAutoImports,
  VanityAppAutoImportsOptions,
  VanityAppAutoImportSource,
}

/**
 * Define a host-neutral Vanity configuration with contextual IntelliSense.
 *
 * The helper is a typed identity: it returns the same plain object so it can
 * be passed unchanged to `vanityPlugin`, Nuxt's `vanity` option, or
 * `vanity prepare`. The generic overload preserves literal inference while
 * the `VanityConfig` context keeps known keys documented at the cursor.
 *
 * @example
 * ```ts
 * import { defineVanityConfig } from '@mszr/vanity/config'
 *
 * export default defineVanityConfig({
 *   compiler: { system: './src/design/system.ts' },
 *   autoImports: { shared: './src/design/authoring.ts', app: ['core', 'vue'] },
 * })
 * ```
 */
export function defineVanityConfig(): VanityConfig
export function defineVanityConfig<const Config extends VanityConfig>(config: Config & VanityConfig): Config
export function defineVanityConfig(config: VanityConfig = {}): VanityConfig {
  return config
}
