import type { VanityDiagnosticSink } from './diagnostics'
import type {
  VanityRuntimeAutoImports,
  VanityRuntimeAutoImportsOptions,
  VanityRuntimeAutoImportSource,
} from './internal/runtimeAutoImports'

/** Naming strategy for generated classes and custom properties. */
export type VanityIdentifierMode = 'debug' | 'short'

/** Low-level mode forwarded to the underlying vanilla-extract Vite plugin. */
export type VanityCompilerMode = 'transform' | 'emitCss' | 'inlineCssInDev'

interface VanityStyleAutoImportsWithInclude {
  /** Optional alternate authoring module; omitted means `compiler.system`. */
  from?: string
  /** Keep only these named authoring exports in the compiler auto-import lane. */
  include: readonly string[]
  exclude?: never
}

interface VanityStyleAutoImportsWithExclude {
  /** Optional alternate authoring module; omitted means `compiler.system`. */
  from?: string
  include?: never
  /** Remove these named authoring exports from the compiler auto-import lane. */
  exclude: readonly string[]
}

/** A filtered style source; omit `from` to reuse the configured system entry. */
export type VanityStyleAutoImportsOptions
  = VanityStyleAutoImportsWithInclude
    | VanityStyleAutoImportsWithExclude

/**
 * Controls authoring exports injected into evaluated `*.css.ts` modules.
 *
 * - `false` disables this lane.
 * - `true` reuses `compiler.system` as the source.
 * - A string names an alternate source module.
 * - An object names an optional source and filters its exports with `include`
 *   or `exclude`.
 *
 * This affects only the compiler lane; application modules use
 * `app.runtimeAutoImports` instead.
 */
export type VanityStyleAutoImports
  = false
    | true
    | string
    | VanityStyleAutoImportsOptions

/**
 * Describes one plain consolidated system for the compiler and runtime lanes.
 *
 * A string in `compiler.system` is shorthand for `{ entry: string }`. Use the
 * object form when a prebuilt portable artifact or a non-default contract
 * export must be paired with the source module.
 */
export interface VanitySystemSource {
  /**
   * Path to the TypeScript module that exports the consolidated system.
   * Relative paths resolve from the host project root.
   */
  entry: string
  /** Optional portable JSON artifact to validate and use for browser/SSR projection. */
  artifact?: string
  /** Package identity for stale-pair diagnostics; inferred when omitted. */
  packageName?: string
  /** Contract export to use when the entry cannot be inspected; defaults to `ds`. */
  exportName?: string
}

/** Build-plane options shared by the Vite and Nuxt adapters. */
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
   * Inject named authoring exports into evaluated `*.css.ts` modules.
   * `true` reuses `system`; a string names an alternate source; an object adds
   * an `include` or `exclude` filter. These imports exist only in the compiler
   * lane, and explicit imports remain untouched.
   */
  styleAutoImports?: VanityStyleAutoImports
  /**
   * Plain consolidated system module(s) to evaluate. App and SSR imports are
   * replaced with a portable runtime facade, while style compilation executes
   * the full system entry. A string is the common form; use an object or array
   * for paired artifacts, custom export names, or multiple systems.
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
  diagnostics?: VanityDiagnosticSink
}

/** Application-plane options shared by the Vite and Nuxt adapters. */
export interface VanityAppOptions {
  /**
   * Inject runtime-facing values into application and SSR modules. Template
   * support follows the host adapter. This lane never changes how `*.css.ts`
   * files are evaluated.
   */
  runtimeAutoImports?: VanityRuntimeAutoImports
}

/**
 * Host-neutral configuration shared by `defineVanityConfig`, `vanityPlugin`,
 * the Nuxt adapter, and `vanity prepare`.
 *
 * `compiler` configures the build plane; `app` configures the application
 * plane. Keeping both lanes here lets one `vanity.config.ts` travel unchanged
 * between adapters and preparation tooling.
 */
export interface VanityConfig {
  /** Build-plane configuration for systems and evaluated `*.css.ts` modules. */
  compiler?: VanityCompilerOptions
  /** Application-plane configuration for runtime-facing auto-imports. */
  app?: VanityAppOptions
}

export type {
  VanityRuntimeAutoImports,
  VanityRuntimeAutoImportsOptions,
  VanityRuntimeAutoImportSource,
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
 *   app: { runtimeAutoImports: ['core', 'vue'] },
 * })
 * ```
 */
export function defineVanityConfig(): VanityConfig
export function defineVanityConfig<const Config extends VanityConfig>(config: Config & VanityConfig): Config
export function defineVanityConfig(config: VanityConfig = {}): VanityConfig {
  return config
}
