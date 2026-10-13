/**
 * The introspection channel ([spec-introspection.md]): build-time factories
 * record what they defined — tokens with resolved per-scheme values, systems,
 * recipes, ports, escapes, contrast results — and the build-time compiler drains the
 * records into the manifest. The channel lives on `globalThis` under a
 * registered symbol because a style-module bundle carries its own copy of this
 * module ([vite.ts]): the two copies must observe one store.
 *
 * Recording is a no-op unless a collector is open, so authoring calls outside
 * the plugin (tests, the emit runner) pay one guarded push at most.
 */

import type { VanityDeclarationRecord } from '../css/declaration'
import type { VanityPortMeta } from '../ports/types'
import type { VanityStyleModuleResult } from '../substrate/types'
import type { VanityAxisRegistryDescription } from '../system/axes'
import type { VanitySemanticTokenAddress } from '../tokens/handle'
import type { VanityCssFeature, VanityExpressionKind, VanityExtensionIdentity, VanitySource } from '../values/protocol'
import type { VanityCssDataType } from '../values/types'
import { getArmKey } from '../css/arm'

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
  /** Nearest module mount path, when authored through a module builder. */
  module?: readonly string[]
  layer?: string
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
  usage?: import('../tokens/types').VanityTokenUsage
  restrict?: import('../tokens/types').VanityTokenRestriction
  range?: readonly [string, string]
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
    readonly reference: 'explicit' | 'policy' | 'capability'
    readonly emit: 'explicit' | 'policy' | 'capability'
    readonly reasons: readonly string[]
  }
  readonly fold: {
    readonly status: 'folded' | 'preserved' | 'unavailable'
    readonly val?: string | number
    readonly reason?: string
  }
  /**
   * Build-time coverage proof for folded derivations whose dependencies vary
   * across more than one axis. Required cases are the combinations where the
   * axis layers alone would not deliver the resolved value.
   */
  readonly axisCoverage?: {
    /** Axes carried by this token's own branches and transitive dependencies. */
    readonly contributingAxes: readonly string[]
    /** Full mode combinations that require an intersection declaration. */
    readonly requiredCases: readonly Readonly<Record<string, string>>[]
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
  capabilitySignature?: string
  supportTarget?: string
  layers: string[]
  ruleGroups?: import('../system/contract').VanityPortableSystem['ruleGroups']
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
  portable?: import('../system/contract').VanityPortableSystem
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
  /** The same emitted lookup table the recipe or anatomy runtime consumes. */
  classes?: {
    base: string
    variants: Record<string, Record<string, string>>
    toggles: Record<string, string>
    compound: Array<{ when: Record<string, string | boolean>, class: string }>
  } | {
    base: Record<string, string>
    variants: Record<string, Record<string, Record<string, string>>>
    toggles: Record<string, Record<string, string>>
    compound: Array<{ when: Record<string, string | boolean>, classes: Record<string, string> }>
  }
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

export interface VanityEscapeRecord extends VanitySourceRecord {
  kind: 'escape'
  form: VanityEscapeForm
  /** What the escape holds: the selector, the declaration, or the block's first line. */
  detail: string
  /** The stated intent — required on `unsafe`, absent elsewhere. */
  reason?: string
  layer?: string
  style?: string
  property?: string
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
  evidence?: import('../evidence').VanityEvidence
  samples?: number
  step?: Readonly<Record<string, string>>
  worst?: Readonly<Record<string, string | number>>
  profile?: 'development' | 'production' | 'both'
  note?: string
  tokens?: readonly string[]
  environment?: Readonly<Record<string, string>>
  /** The pick used a representative target because exact folding was declined. */
  fallback?: string
}

export interface VanityEmittedDeclarationRecord extends VanityDeclarationRecord {
  arm: import('../css/rule').VanityArm & { selector: string, ordinal: number }
  layer: string
}

export interface VanityStyleRecord extends VanitySourceRecord {
  kind: 'style'
  /** The emitted class visible in browser DevTools. */
  class: string
  /** The authored declaration name injected by the compiler. */
  name?: string
  /** Custom properties referenced by the compiled declarations. */
  vars: string[]
  declarations?: import('../css/declaration').VanityDeclarationRecord[]
  /** Emitted winners in CSS order, projected from the same classified records. */
  emittedDeclarations?: VanityEmittedDeclarationRecord[]
  layer?: string
  exports?: readonly string[]
  /** Internal capture state; never serialized into the manifest. */
  selectorsResolved?: boolean
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

/**
 * Stable categories emitted by `ds.audit()` and configurable in `consolidate({ audit })`.
 *
 * - `unusedTokens`: tokens declared but never consumed by a style or semantic record.
 * - `nearDuplicates`: colors whose resolved values fall within the configured similarity threshold.
 * - `contrast`: authored contrast checks that do not meet their requested guarantee.
 * - `escapes`: token references that escape the intended ownership or portability boundary.
 * - `scaleStrays`: scale values that sit outside the declared scale vocabulary.
 * - `focusVisibility`: focus treatments that do not provide the required visible indication.
 * - `specificityContexts`: selectors whose specificity context can change unexpectedly.
 * - `rawAssertions`: raw CSS assertions that bypass a typed capability without an explicit reason.
 * - `nonportableValues`: values that cannot cross the portable value boundary.
 * - `ambiguousAxes`: axis declarations whose defaults or branches do not select one meaning.
 * - `mutableRootHazards`: mutable root tokens whose lifetime can make updates unsafe.
 * - `aliasEscapes`: aliases that resolve outside their declared token ownership.
 * - `overwriteInventory`: overwrite operations whose affected declarations are not fully accounted for.
 * - `eagerStyleBarrels`: style barrels loaded eagerly when a lazy module boundary is expected.
 * - `cssParityGaps`: declared CSS capability rows missing from emitted or adapter evidence.
 * - `staleArtifacts`: generated artifacts whose content or identity no longer matches their source.
 * - `rootModeDisagreements`: root mode readings that disagree across the build evidence.
 * - `staleDerivations`: folded token values that do not cover every mode of a varying dependency axis.
 * - `derivedCaseGrowth`: folded derivations whose required intersection cases exceed the advisory size budget.
 */
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
    | 'staleDerivations'
    | 'derivedCaseGrowth'
    | 'descendantConditions'
    | 'unanchoredSelectors'

/** Per-category audit behavior: `'off'` silences, `'warn'` reports, and `'error'` promotes a finding to a failure. */
export type VanityAuditLevel = 'off' | 'warn' | 'error'

/**
 * Per-audit promotion, declared on the system so the quality bar travels with
 * the design system ([spec-introspection.md §3]): most categories are
 * advisory by default; `staleDerivations` is an error by default because it
 * can make an emitted folded value observably wrong, while `derivedCaseGrowth`
 * remains advisory because its output is correct; `error` promotes another
 * category and `off` silences one.
 */
export type VanityAuditConfig = Partial<Record<VanityAuditKind, VanityAuditLevel>>

// ─── The channel ─────────────────────────────────────────────────────────────

const CHANNEL = Symbol.for('vanity.inspection')

interface Channel {
  current: VanityInspectRecord[] | undefined
  findings?: import('../css/findings').VanityDeclarationFinding[]
  warnings?: import('../diagnostics').VanityDiagnosticInput[]
}

function channel(): Channel {
  const host = globalThis as { [CHANNEL]?: Channel }
  return host[CHANNEL] ??= { current: undefined }
}

/** Record one introspection fact; a no-op unless a collector is open. */
export function record(entry: VanityInspectRecord): void {
  channel().current?.push(entry)
}

/** Finalize the active graph through its capture's actual CSS backend and class registry. */
export function resolveStyleSelectors(
  resolve: (selectors: readonly string[]) => VanityStyleModuleResult,
  records = channel().current ?? [],
): void {
  const styles = records.filter((record): record is VanityStyleRecord => record.kind === 'style' && !record.selectorsResolved)
  const selectors = styles.flatMap(style => style.emittedDeclarations?.map(declaration => declaration.arm.selector) ?? [])
  if (styles.length === 0)
    return
  const resolved = resolve(selectors)
  for (const style of styles) {
    const authoredArms = new Map<string, Map<string, VanityEmittedDeclarationRecord[]>>()
    for (const declaration of style.emittedDeclarations ?? []) {
      const key = `${declaration.layer}:${getArmKey(declaration.arm)}:${declaration.arm.ordinal}`
      let properties = authoredArms.get(key)
      if (!properties) {
        properties = new Map()
        authoredArms.set(key, properties)
      }
      const values = properties.get(declaration.property) ?? []
      values.push(declaration)
      properties.set(declaration.property, values)
    }
    const getEmittedArmKey = (arm: VanityEmittedDeclarationRecord['arm']) => getArmKey({
      ...arm,
      scopes: arm.scopes?.length ? arm.scopes : undefined,
      startingStyle: arm.startingStyle || undefined,
    })
    const emittedArms = new Map<string, Map<string, VanityEmittedDeclarationRecord[]>>()
    for (const properties of authoredArms.values()) {
      const first = properties.values().next().value![0]!
      const selector = resolved.selectors![first.arm.selector]!
      const key = `${first.layer}:${getEmittedArmKey({ ...first.arm, selector })}`
      let emitted = emittedArms.get(key)
      if (!emitted) {
        emitted = new Map()
        emittedArms.set(key, emitted)
      }
      for (const [property, values] of properties)
        emitted.set(property, values)
    }
    const ordinals = new Map<string, number>()
    style.emittedDeclarations = []
    for (const properties of emittedArms.values()) {
      const first = properties.values().next().value![0]!
      const raw = first.arm.selector
      const key = `${first.layer}:${getEmittedArmKey({ ...first.arm, selector: resolved.selectorKeys![raw]! })}`
      const ordinal = ordinals.get(key) ?? 0
      ordinals.set(key, ordinal + 1)
      for (const values of properties.values()) {
        for (const declaration of values) {
          declaration.arm.selector = resolved.selectors![declaration.arm.selector]!
          declaration.arm.ordinal = ordinal
          style.emittedDeclarations.push(declaration)
        }
      }
    }
    style.selectorsResolved = true
  }
}

/** Whether a collector is open — guards record preparation that isn't free. */
export function isInspecting(): boolean {
  return channel().current !== undefined
}

/** Append one declaration finding to the active evaluation capture. */
export function collectDeclarationFinding(finding: import('../css/findings').VanityDeclarationFinding): void {
  channel().findings?.push(finding)
}

/** Non-policy warnings share the evaluation capture without inventing a declaration. */
export function collectInspectionWarning(diagnostic: import('../diagnostics').VanityDiagnosticInput): void {
  const current = channel().warnings
  if (!current)
    return
  if (!current.some(prior => JSON.stringify(prior) === JSON.stringify(diagnostic)))
    current.push(diagnostic)
}

/**
 * Run a build-time evaluation and return what it recorded. Evaluation is
 * synchronous end-to-end (the same guarantee the css adapter rides), so one
 * `current` slot suffices — collectors never interleave.
 */
export interface VanityInspectionCapture {
  records: VanityInspectRecord[]
  findings: import('../css/findings').VanityDeclarationFinding[]
  warnings: import('../diagnostics').VanityDiagnosticInput[]
  /** The authored body returned; later compiler finalization can still fail. */
  complete: boolean
  error?: unknown
}

export function collectInspection<T>(run: () => T, observe?: (capture: VanityInspectionCapture) => void): { result: T, records: VanityInspectRecord[], findings: import('../css/findings').VanityDeclarationFinding[], warnings: import('../diagnostics').VanityDiagnosticInput[] } {
  const store = channel()
  const previous = store.current
  const previousFindings = store.findings
  const previousWarnings = store.warnings
  const records: VanityInspectRecord[] = []
  const findings: import('../css/findings').VanityDeclarationFinding[] = []
  const warnings: import('../diagnostics').VanityDiagnosticInput[] = []
  store.current = records
  store.findings = findings
  store.warnings = warnings
  let complete = false
  let failure: unknown

  try {
    const result = run()
    complete = true
    return { result, records, findings, warnings }
  }
  catch (error) {
    failure = error
    throw error
  }
  finally {
    store.current = previous
    store.findings = previousFindings
    store.warnings = previousWarnings
    observe?.({ records, findings, warnings, complete, ...(!complete ? { error: failure } : {}) })
  }
}
