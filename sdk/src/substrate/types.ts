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

export interface VanityCssSubstrate {
  emitClassRule: (input: VanityClassEmission) => string
  emitGlobalRule: (input: VanityGlobalRuleEmission) => void
  emitRawCss: (input: VanityRawEmission) => void
  emitKeyframes: (input: VanityKeyframesEmission) => string
  emitFontFace: (input: VanityFontFaceEmission) => string
  emitLayer: (input: VanityLayerEmission) => void
  createCustomProperty: (label?: string) => `--${string}`
  registerCustomProperty: (input: VanityCustomPropertyEmission) => void
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

export type VanityIdentOption
  = 'short'
    | 'debug'
    | ((input: {
      readonly hash: string
      readonly filePath: string
      readonly debugId?: string
      readonly packageName?: string
    }) => string)

export interface VanityCssCapture {
  readonly appendCss: (css: unknown, fileScope: VanityFileScope) => void
  readonly registerClassName: (className: string, fileScope: VanityFileScope) => void
  readonly registerComposition: (composition: unknown, fileScope: VanityFileScope) => void
  readonly markCompositionUsed: (identifier: string) => void
  readonly onEndFileScope?: (fileScope: VanityFileScope) => void
  readonly getIdentOption: () => VanityIdentOption
}

/**
 * The module half owns lifecycle and compiler integration, while keeping all
 * backend-specific representations behind the adapter boundary.
 */
export interface VanityModuleSubstrate {
  runInFileScope: <Result>(scope: VanityFileScope, operation: () => Result) => Result
  registerFunctionSerialization: (fn: (...args: unknown[]) => unknown, descriptor: VanityFunctionSerialization) => void
  transformStyleModule: (input: VanityStyleModuleTransform) => VanityStyleModuleResult

  getFileScope: () => VanityFileScope | undefined
  hasFileScope: () => boolean
  requireStyleModule: (surface: string) => string
  installCapture: (capture: VanityCssCapture) => void
  removeCapture: () => void
  setFileScope: (scope: VanityFileScope) => void
  endFileScope: () => void

  stringifyFileScope: (scope: VanityFileScope) => string
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
  readonly modules: VanityModuleSubstrate
}

// Keep these imports in the neutral module contract so the substrate's CSS
// responsibilities stay visibly tied to Vanity-owned authoring vocabulary.
export type { VanityFontFaceRule, VanityKeyframesRule }
