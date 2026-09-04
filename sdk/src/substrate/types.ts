import type { VanityFontFaceRule, VanityKeyframesRule } from '../css/types'

/** The small, backend-neutral file identity needed while authoring CSS. */
export interface VanityFileScope {
  readonly filePath: string
  readonly packageName?: string
}

export interface VanityClassEmission {
  readonly rule: unknown
  readonly debugId?: string
}

export interface VanityGlobalRuleEmission {
  readonly selector: string
  readonly rule: unknown
}

export interface VanityRawEmission {
  readonly css: string
  readonly fileScope?: VanityFileScope
}

export interface VanityKeyframesEmission {
  readonly debugId?: string
  readonly render: (name: string) => string
}

export interface VanityFontFaceEmission {
  readonly debugId?: string
  readonly render: (family: string) => string
}

export interface VanityLayerEmission {
  readonly parent?: string
  readonly name: string
}

export interface VanityCustomPropertyEmission {
  readonly name: `--${string}`
  readonly registration: unknown
}

/** Backend-neutral operations for emitting CSS and registering custom properties. */
export interface VanityCssSubstrate {
  /** Emit one local class rule and return its generated class name. */
  emitClassRule: (input: VanityClassEmission) => string
  /** Emit one global selector rule. */
  emitGlobalRule: (input: VanityGlobalRuleEmission) => void
  /** Emit raw CSS owned by the current file scope. */
  emitRawCss: (input: VanityRawEmission) => void
  /** Emit keyframes and return the generated animation name. */
  emitKeyframes: (input: VanityKeyframesEmission) => string
  /** Emit a font-face rule and return its generated family name. */
  emitFontFace: (input: VanityFontFaceEmission) => string
  /** Record a cascade-layer declaration. */
  emitLayer: (input: VanityLayerEmission) => void
  /** Create a stable custom-property name for an authored label. */
  createCustomProperty: (label?: string) => `--${string}`
  /** Register custom-property syntax and initial-value metadata. */
  registerCustomProperty: (input: VanityCustomPropertyEmission) => void
  /** Read the active style-module file scope for CSS authoring context. */
  getStyleModuleFile: () => VanityFileScope | undefined
  /** Report whether CSS authoring currently has a style-module file scope. */
  hasStyleModuleFile: () => boolean
}

export interface VanityFunctionSerialization {
  readonly importPath: string
  readonly importName: string
  readonly args: readonly unknown[]
}

export interface VanityStyleModuleTransform {
  readonly cssObjects: readonly unknown[]
  readonly localClassNames: readonly string[]
  readonly composedClassLists: readonly unknown[]
}

export interface VanityStyleModuleResult {
  readonly css: string
}

/**
 * Identifier options consumed by the Vanilla Extract adapter.
 *
 * This intentionally mirrors Vanilla Extract's `IdentifierOption` because the selected backend
 * owns identifier generation; the explicit name keeps that coupling visible at the port.
 */
export type VanityVanillaExtractIdentOption
  = 'short'
    | 'debug'
    | ((input: {
      readonly hash: string
      readonly filePath: string
      readonly debugId?: string
      readonly packageName?: string
    }) => string)

/**
 * Capture callbacks consumed by the Vanilla Extract adapter.
 *
 * This intentionally mirrors the callback shape of Vanilla Extract's `Adapter`; it is not a
 * backend-neutral capture protocol.
 */
export interface VanityVanillaExtractCapture {
  readonly appendCss: (css: unknown, fileScope: VanityFileScope) => void
  readonly registerClassName: (className: string, fileScope: VanityFileScope) => void
  readonly registerComposition: (composition: unknown, fileScope: VanityFileScope) => void
  readonly markCompositionUsed: (identifier: string) => void
  readonly finishFileScope?: (fileScope: VanityFileScope) => void
  readonly getIdentOption: () => VanityVanillaExtractIdentOption
}

/**
 * Module operations whose semantics remain portable across substrate implementations.
 *
 * The selected adapter may implement these operations with a backend, but callers depend only on
 * the scope, serializer, and style-module transformation contracts below.
 */
export interface VanityPortableModuleSubstrate {
  /** Run an operation under one explicit style-module file scope. */
  runInFileScope: <Result>(scope: VanityFileScope, operation: () => Result) => Result
  /** Register a portable function serialization descriptor. */
  registerFunctionSerialization: (fn: (...args: unknown[]) => unknown, descriptor: VanityFunctionSerialization) => void
  /** Transform captured style-module data into its portable result. */
  transformStyleModule: (input: VanityStyleModuleTransform) => VanityStyleModuleResult
}

/**
 * Lifecycle and host integration supplied by the current Vanilla Extract CSS backend.
 *
 * This is intentionally not a portable substrate contract: its file-scope, module-serialization,
 * package-resolution, initialization, and Vite-plugin operations mirror the selected backend.
 */
export interface VanityVanillaExtractModuleLifecycle {
  installCapture: (capture: VanityVanillaExtractCapture) => void
  removeCapture: () => void
  setFileScope: (scope: VanityFileScope) => void
  finishFileScope: () => void

  serializeFileScope: (scope: VanityFileScope) => string
  parseFileScope: (serialized: string) => VanityFileScope
  serializeStyleModule: (cssImports: readonly string[], exports: Record<string, unknown>, unusedCompositionRegex: RegExp | null) => string
  addFileScope: (input: { source: string, filePath: string, rootPath: string, packageName: string }) => string
  getPackageName: (path?: string) => string
  resolveModule: (specifier: string) => string
  initialize: () => void
  createVitePlugins: (options: unknown) => readonly unknown[]
}

export interface VanitySubstrate {
  readonly css: VanityCssSubstrate
  readonly modules: VanityPortableModuleSubstrate
  readonly backend: VanityVanillaExtractModuleLifecycle
}

// Keep these imports in the substrate contract so CSS responsibilities stay visibly tied to
// Vanity-owned authoring vocabulary.
export type { VanityFontFaceRule, VanityKeyframesRule }
