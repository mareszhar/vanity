/**
 * The introspection channel ([spec-introspection.md]): build-time factories
 * record what they defined — tokens with resolved per-scheme values, systems,
 * recipes, ports, escapes, contrast results — and the build-time compiler drains the
 * records into the manifest. The channel lives on `globalThis` under a
 * registered symbol because a style-module bundle carries its own copy of this
 * module ([vite.ts]): the two copies must observe one store.
 *
 * Recording is a no-op unless a collector is open, so authoring calls outside
 * the plugin (tests, the emit harness) pay one guarded push at most.
 */

import type { VanityPortMeta } from '../ports/types'
import type { VanityAxisRegistryDescription } from '../system/axes'
import type { VanityCssFeature, VanityExpressionKind, VanityExtensionIdentity, VanitySource } from '../values/protocol'
import type { VanityCssDataType } from '../values/types'
import type { VanitySemanticTokenAddress, VanityTokenMode } from './handle'

// ─── Records ─────────────────────────────────────────────────────────────────

export interface VanitySourceRecord {
  /** Compiler-owned definition source, when the call was transformed. */
  file?: string
  line?: number
  column?: number
}

export interface VanityTokenRecord extends VanitySourceRecord {
  kind: 'token'
  /** The dot path in the graph: `color.brand`. */
  path: string
  /** The emitted custom property: `--vanity-color-brand`. */
  var: string
  /** Effective selector and layer where this declaration was finalized. */
  root?: string
  scopes?: readonly string[]
  /** Nearest unified-module mount path, when authored through a module builder. */
  module?: readonly string[]
  layer?: string
  mode: VanityTokenMode
  /** The built value per scheme — equal strings when the token is scheme-blind. */
  light: string
  dark: string
  /** The emitted CSS value — the live form when the token stays live. */
  css: string
  /** The `contrast-color()` upgrade a live legible pairing declares, if any. */
  upgrade?: string
  /** Token paths this token's definition references — the graph edges. */
  refs: string[]
  /** CSS capabilities required by the expression that is actually emitted. */
  requirements: VanityCssFeature[]
  /** A proven resolved preview, or an honest reason no preview is available. */
  preview: VanityTokenPreviewRecord
  description?: string
  deprecated?: string
  /** Every resolved declaration site, including semantic branch provenance. */
  emission?: readonly VanityTokenEmissionRecord[]
  /** Opaque runtime addresses; semantic coordinates remain the primary key. */
  runtime?: {
    readonly type: string
    readonly validation?: { readonly id: string, readonly runtime: false | 'dev' | 'always', readonly onInvalid: string }
    readonly addresses: readonly {
      readonly address: VanitySemanticTokenAddress
      readonly slot: string
    }[]
  }
  /** Axis-agnostic semantic projection. */
  semantic: VanityTokenSemanticRecord
}

export interface VanityTokenSemanticRecord {
  readonly type: VanityCssDataType
  readonly reference: 'val' | 'var'
  readonly emit: boolean
  readonly mutable: boolean
  readonly hasDefault: boolean
  readonly expression: VanityTokenExpressionRecord
  readonly inference: {
    readonly reference: 'explicit' | 'engine-default' | 'capability'
    readonly emit: 'explicit' | 'engine-default' | 'capability'
    readonly reasons: readonly string[]
  }
  readonly fold: {
    readonly status: 'folded' | 'preserved' | 'unavailable'
    readonly val?: string | number
    readonly reason?: string
  }
  readonly dependencies: readonly VanityTokenDependencyRecord[]
  readonly support: {
    readonly target?: string
    readonly requirements: readonly VanityCssFeature[]
    readonly fallback?: string
    readonly enhancement?: string
  }
  readonly declarations: readonly VanityTokenDeclarationRecord[]
  /** Authored branch addresses include triggerless defaults and null reservations. */
  readonly branches: readonly {
    readonly address: VanitySemanticTokenAddress
    readonly val: string | number | null
    /** Present when an opaque plugin codec needs this branch's own semantic node. */
    readonly expression?: VanityTokenExpressionRecord
  }[]
  readonly registration?: {
    readonly syntax: string
    readonly inherits: boolean
    readonly initialVal?: string
  }
  readonly portability: {
    readonly status: 'portable' | 'codec' | 'nonportable'
    readonly extension?: VanityExtensionIdentity
    readonly reason?: string
  }
  readonly metadata: Readonly<Record<string, unknown>>
}

export interface VanityTokenExpressionRecord {
  readonly kind: VanityExpressionKind | 'color' | 'contrast' | 'none'
  readonly type: VanityCssDataType
  readonly css?: string
  readonly source?: VanitySource
  readonly extension?: VanityExtensionIdentity
  readonly detail?: Readonly<Record<string, string | number | boolean | null>>
  readonly children?: readonly VanityTokenExpressionRecord[]
}

export interface VanityTokenDependencyRecord {
  readonly kind: 'token' | 'custom-property' | 'plugin'
  readonly path?: string
  readonly name?: `--${string}`
  readonly type: VanityCssDataType
  readonly resolution: 'self' | 'system'
  readonly extension?: VanityExtensionIdentity
}

export interface VanityTokenDeclarationRecord {
  readonly kind: 'base' | 'axis' | 'case' | 'override' | 'slot'
  /** Omitted when the declaration writes the token's public `name`. */
  readonly name?: `--${string}`
  readonly val: string | number | null
  readonly axis?: string
  readonly mode?: string
  readonly when?: Readonly<Record<string, string>>
  readonly context: {
    readonly root: string
    readonly selectors: readonly string[]
    readonly atRules: readonly string[]
    readonly layer?: string
  }
  readonly source?: VanitySourceRecord
}

export interface VanityTokenEmissionRecord {
  readonly kind: 'base' | 'native' | 'axis' | 'case'
  readonly root: string
  readonly layer?: string
  readonly axis?: string
  readonly mode?: string
  readonly when?: Readonly<Record<string, string>>
  readonly mechanism?: string
  readonly locality?: string
  readonly placement?: string
  readonly priority?: number
  readonly media?: string
  readonly supports?: string
  readonly container?: string
  readonly scopes?: readonly string[]
}

export type VanityTokenPreviewRecord
  = { status: 'available', light: string, dark: string }
    | { status: 'unavailable', reason: string }

export interface VanitySystemRecord extends VanitySourceRecord {
  kind: 'system'
  prefix: string
  root?: string
  tokenLayer?: string
  engine?: string
  supportTarget?: string
  layers: string[]
  ruleGroups?: import('../system/contract').VanityPortableSystemV1['ruleGroups']
  /** Condition name → its compiled arms, serialized readably. */
  conditions: Record<string, string>
  /** Condition name → every exact lowered selector/query arm. */
  conditionArms: Record<string, readonly import('../system/conditions').VanityConditionArm[]>
  /** Condition name → immutable authored algebra/template AST. */
  conditionAsts: Record<string, import('../system/conditions').VanityConditionAst>
  axes?: VanityAxisRegistryDescription
  audit?: VanityAuditConfig
  runtime?: {
    readonly protocol: number
    readonly system: string
    readonly root: string
  }
  /** Projection identities derived from normalized semantic records. */
  identities?: import('../system/contract').VanitySystemIdentities
  /** Validated data-only compiler projection. Never contains build closures. */
  portable?: import('../system/contract').VanityPortableSystemV1
}

export interface VanityRecipeRecord extends VanitySourceRecord {
  kind: 'recipe' | 'anatomy'
  /** The export name, via the debug-name transform; unnamed recipes stay out of the manifest. */
  name?: string
  parts?: string[]
  variants: Record<string, string[]>
  toggles: string[]
  defaults: Record<string, string | boolean>
  /** Published port name → the port's own custom-property name. */
  ports: Record<string, string>
}

export interface VanityPortRecord extends VanitySourceRecord {
  kind: 'port'
  /** The export name, via the debug-name transform; manual labels pass through too. */
  label?: string
  /** The live declaration record — read at manifest time so late `.describe()` calls still land. */
  meta: VanityPortMeta
}

export type VanityEscapeForm
  = | 'class.standard'
    | 'raw'
    | 'rules'
    | 'unsafe'
    | 'overrides'
    // Internal characterization fields retained below the public system model.
    | 'css.raw'
    | 'css.standard'
    | 'globalCss'

export interface VanityEscapeRecord extends VanitySourceRecord {
  kind: 'escape'
  form: VanityEscapeForm
  /** What the escape holds: the selector, the declaration, or the block's first line. */
  detail: string
  /** The stated intent — required on `unsafe`, absent elsewhere. */
  reason?: string
  layer?: string
}

export interface VanityContrastRecord extends VanitySourceRecord {
  kind: 'contrast'
  file?: string
  /** The token path (a `legibleOn` value) or the check's pairing description. */
  pairing: string
  scheme: 'light' | 'dark'
  algorithm: 'apca' | 'wcag2'
  /** The measured contrast: APCA Lc or a WCAG ratio. */
  measured: number
  min: number
  /** True when the threshold was consciously accepted at the definition site. */
  accepted: boolean
}

export interface VanityStyleRecord extends VanitySourceRecord {
  kind: 'style'
  /** The emitted class visible in browser DevTools. */
  class: string
  /** The authored declaration name injected by the compiler. */
  name?: string
  /** Custom properties referenced by the compiled declarations. */
  vars: string[]
}

export type VanityInspectRecord
  = | VanityTokenRecord
    | VanitySystemRecord
    | VanityRecipeRecord
    | VanityPortRecord
    | VanityEscapeRecord
    | VanityContrastRecord
    | VanityStyleRecord

// ─── Audit configuration (recorded by the system, applied by the audit) ──────

export type VanityAuditKind
  = | 'unusedTokens'
    | 'nearDuplicates'
    | 'contrast'
    | 'escapes'
    | 'scaleStrays'
    | 'focusVisibility'
    | 'specificityContexts'
    | 'rawAssertions'
    | 'nonportableValues'
    | 'ambiguousAxes'
    | 'mutableRootHazards'
    | 'aliasEscapes'
    | 'overwriteInventory'
    | 'eagerStyleBarrels'
    | 'cssParityGaps'
    | 'staleArtifacts'
    | 'rootModeDisagreements'

export type VanityAuditLevel = 'off' | 'warn' | 'error'

/**
 * Per-audit promotion, declared on the system so the quality bar travels with
 * the design system ([spec-introspection.md §3]): none is a hard gate by
 * default; `error` promotes one, `off` silences one.
 */
export type VanityAuditConfig = Partial<Record<VanityAuditKind, VanityAuditLevel>>

// ─── The channel ─────────────────────────────────────────────────────────────

const CHANNEL = Symbol.for('vanity.inspection')

interface Channel {
  current: VanityInspectRecord[] | undefined
}

function channel(): Channel {
  const host = globalThis as { [CHANNEL]?: Channel }
  return host[CHANNEL] ??= { current: undefined }
}

/** Record one introspection fact; a no-op unless a collector is open. */
export function record(entry: VanityInspectRecord): void {
  channel().current?.push(entry)
}

/** Whether a collector is open — guards record preparation that isn't free. */
export function inspecting(): boolean {
  return channel().current !== undefined
}

/**
 * Run a build-time evaluation and return what it recorded. Evaluation is
 * synchronous end-to-end (the same guarantee the css adapter rides), so one
 * `current` slot suffices — collectors never interleave.
 */
export function collectInspection<T>(run: () => T): { result: T, records: VanityInspectRecord[] } {
  const store = channel()
  const previous = store.current
  const records: VanityInspectRecord[] = []
  store.current = records

  try {
    return { result: run(), records }
  }
  finally {
    store.current = previous
  }
}
