/** Serializable runtime contracts and public runtime data shapes. */

import type {
  VANITY_RUNTIME_ACTIVATABLE,
  VanityAxisControl,
  VanityAxisDefinition,
  VanityAxisDefinitions,
} from '../system/axes'
import type {
  VanityHandleMeta,
  VanitySemanticTokenAddress,
} from '../tokens/handle'
import type {
  VanityStandardSchemaV1,
  VanityTokenFallback,
  VanityTokenHandleAny,
} from '../tokens/types'
import type { VanityCssDataType } from '../values/types'

export const VANITY_RUNTIME_SNAPSHOT_VERSION = 1 as const
export const VANITY_RUNTIME_CONTRACT_PROTOCOL = 2 as const

/** Value accepted by a runtime token setter for the token's CSS data type. */
export type VanityRuntimeInput<Type extends VanityCssDataType = VanityCssDataType>
  = VanityTokenFallback<Type>

/** Minimal style adapter used to apply runtime declarations to a target. */
export interface VanityRuntimeStyleDeclaration {
  /** Set a CSS declaration on the target. */
  readonly setProperty: (name: string, value: string, priority?: string) => void
  /** Remove a CSS declaration and return its previous value. */
  readonly removeProperty: (name: string) => string
  /** Read a CSS declaration when the adapter supports it. */
  readonly getPropertyValue?: (name: string) => string
}

/** Structural by design: HTML/SVG elements and test/framework adapters qualify. */
export interface VanityRuntimeTarget {
  /** Inline style adapter used for token and port declarations. */
  readonly style: VanityRuntimeStyleDeclaration
  /** Set a runtime axis or control attribute. */
  readonly setAttribute: (name: string, value: string) => void
  /** Remove a runtime axis or control attribute. */
  readonly removeAttribute: (name: string) => void
  /** Read a runtime attribute when the adapter supports it. */
  readonly getAttribute?: (name: string) => string | null
  /** Test whether this target matches a declared root selector. */
  readonly matches?: (selector: string) => boolean
  /** Test whether this target contains another bound target. */
  readonly contains?: (other: any) => boolean
  /** Document lookup surface used when the target owns a document. */
  readonly ownerDocument?: {
    readonly querySelector: (selector: string) => unknown
    readonly querySelectorAll?: (selector: string) => ArrayLike<unknown> | Iterable<unknown>
    readonly documentElement?: unknown
  } | null
}

/** A document, shadow root, element, or framework adapter that can resolve declared roots. */
export interface VanityRuntimeQueryScope {
  /** Resolve every declared root selector within this scope. */
  readonly querySelectorAll: (selector: string) => ArrayLike<unknown> | Iterable<unknown>
  /** Resolve the first declared root selector within this scope. */
  readonly querySelector?: (selector: string) => unknown
  /** Document element used as the fallback root. */
  readonly documentElement?: unknown
}

/** Reference accepted when setting a custom property through the runtime. */
export type VanityCustomPropertyReference
  = `--${string}`
    | { readonly $name: `--${string}` }
    | { readonly name: `--${string}` }

/** Target shape accepted by custom-property runtime helpers. */
export type VanityCustomPropertyTarget
  = VanityRuntimeStyleDeclaration
    | { readonly style: VanityRuntimeStyleDeclaration }

/** One or more custom-property values supplied to a runtime operation. */
export type VanityCustomPropertyEntries
  = Readonly<Record<`--${string}`, VanityRuntimeInput>>
    | readonly (readonly [VanityCustomPropertyReference, VanityRuntimeInput])[]

export interface VanityRuntimeValidationContract {
  /** Stable validator lookup key. */
  readonly id: string
  /** Runtime validation mode selected by the token definition. */
  readonly runtime: false | 'dev' | 'always'
  /** Action taken when validation rejects a value. */
  readonly onInvalid: 'throw' | 'fallback' | 'omit'
  /** Fallback value used when `onInvalid` is `fallback`. */
  readonly fallback?: string
}

/** One axis-mode branch address carried by the runtime contract. */
export interface VanityRuntimeBranchContract {
  /** Semantic axis address selecting this branch. */
  readonly address: Exclude<VanitySemanticTokenAddress, { readonly kind: 'base' }>
  /** Concrete custom-property slot for the branch. */
  readonly slot?: string
  /** Resolved branch value when the contract carries one. */
  readonly value?: string | number
}

export interface VanityRuntimeTokenContract {
  /** Semantic token path used by runtime setters and diagnostics. */
  readonly token: readonly string[]
  /** Emitted custom-property name for the token. */
  readonly name: `--${string}`
  /** Semantic owner used by the runtime and SSR projections. */
  readonly rootPath: string
  /** Declared selector for the owner; retained for diagnostics/introspection. */
  readonly root: string
  /** Internal selector preludes required before the token declaration. */
  readonly scopes?: readonly string[]
  /** CSS data type used to validate runtime values. */
  readonly type: VanityCssDataType
  /** Reference mode used by the token's generated declaration. */
  readonly reference: 'val' | 'var'
  /** Whether the token declaration is emitted. */
  readonly emit: boolean
  /** Whether runtime updates may change this token. */
  readonly mutable: boolean
  /** Resolved base value when one exists. */
  readonly value?: string | number
  /** Human-readable token description. */
  readonly description?: string
  /** Deprecation guidance for the token. */
  readonly deprecated?: string
  /** JSON-safe token metadata. */
  readonly metadata?: VanityHandleMeta['metadata']
  /** Runtime validation contract for mutable updates. */
  readonly validation?: VanityRuntimeValidationContract
  /** Base custom-property slot for mutable updates. */
  readonly baseSlot?: string
  /** Axis branches and their semantic addresses. */
  readonly branches: readonly VanityRuntimeBranchContract[]
}

/** Declared root metadata used to resolve runtime targets. */
export interface VanityRuntimeRootContract {
  /** `'$system'` or the mounted module path that declared this root. */
  readonly path: string
  /** Selector used to locate the root in a document or subtree. */
  readonly selector: string
  readonly scopes?: readonly string[]
  /** Axes whose emitted token declarations are carried by this root. */
  readonly axes: readonly string[]
}

export interface VanityRuntimeAxisContract {
  /** Default mode selected when no active trigger matches. */
  readonly defaultMode?: string
  /** All modes declared by the axis, in authoring order. */
  readonly modes: readonly string[]
  /** Attribute mutation used by the built-in runtime controller. */
  readonly attribute?: {
    /** Attribute name controlled by the axis. */
    readonly name: string
    /** null selects a triggerless default by removing the shared attribute. */
    readonly values: Readonly<Record<string, string | null>>
  }
  readonly control?: {
    /** Stable application binding id for a custom axis controller. */
    readonly id: string
    readonly projections?: Readonly<Record<string, {
      readonly style?: Readonly<Record<`--${string}`, string>>
      readonly attributes?: Readonly<Record<string, string>>
    }>>
  }
}

export interface VanityRuntimeContract {
  /** Runtime contract protocol version. */
  readonly protocol: typeof VANITY_RUNTIME_CONTRACT_PROTOCOL
  /** Deterministic runtime schema identity. */
  readonly system: string
  /** Custom-property prefix used by the system. */
  readonly prefix: string
  /** Root selector used by the system. */
  readonly root: string
  /** Deterministic order of environmental axes. */
  readonly axisOrder: readonly string[]
  /** Runtime metadata for each environmental axis. */
  readonly axes: Readonly<Record<string, VanityRuntimeAxisContract>>
  /** Root selectors and the axes they carry. */
  readonly roots: readonly VanityRuntimeRootContract[]
  /** Mutable and branch-capable token metadata. */
  readonly tokens: readonly VanityRuntimeTokenContract[]
}

export type VanityRuntimeContractDraft = Omit<VanityRuntimeContract, 'system'>

/** One semantic token override carried by a runtime snapshot. */
export interface VanityRuntimeSnapshotOverride {
  /** Semantic token path being overridden. */
  readonly token: readonly string[]
  /** Semantic address of the base or branch override. */
  readonly address: VanitySemanticTokenAddress
  /** Serialized value written to the runtime slot. */
  readonly val: string
}

/** JSON-safe runtime state that can cross SSR and hydration boundaries. */
export interface VanityRuntimeSnapshot {
  /** Snapshot protocol version. */
  readonly version: typeof VANITY_RUNTIME_SNAPSHOT_VERSION
  /** Runtime schema identity that produced this snapshot. */
  readonly system: string
  /** Semantic token overrides captured by the snapshot. */
  readonly overrides: readonly VanityRuntimeSnapshotOverride[]
  /** Active mode selected for each environmental axis. */
  readonly modes: Readonly<Record<string, string>>
}

/** Stable codes emitted while validating or reconciling runtime state. */
export type VanityRuntimeDiagnosticCode
  = | 'VANITY_RUNTIME_SCHEMA_MISMATCH'
    | 'VANITY_RUNTIME_UNKNOWN_TOKEN'
    | 'VANITY_RUNTIME_UNKNOWN_ADDRESS'
    | 'VANITY_RUNTIME_IMMUTABLE_TOKEN'
    | 'VANITY_RUNTIME_INVALID_VALUE'
    | 'VANITY_RUNTIME_INVALID_OPTIONS'
    | 'VANITY_RUNTIME_INVALID_TARGET'
    | 'VANITY_RUNTIME_INVALID_HANDLE'
    | 'VANITY_RUNTIME_UNKNOWN_AXIS'
    | 'VANITY_STYLE_MODULE_MISUSE'
    | 'VANITY_RUNTIME_UNKNOWN_MODE'
    | 'VANITY_RUNTIME_UNSELECTABLE_AXIS'
    | 'VANITY_RUNTIME_ROOT_NOT_FOUND'
    | 'VANITY_RUNTIME_AMBIGUOUS_ROOT'
    | 'VANITY_RUNTIME_MODE_DISAGREEMENT'

/** Structured runtime failure with the affected semantic location and fix context. */
export interface VanityRuntimeDiagnostic {
  /** Stable diagnostic code for this runtime reconciliation failure. */
  readonly code: VanityRuntimeDiagnosticCode
  /** Human-readable failure and repair guidance. */
  readonly message: string
  /** Token path involved in the failure, when applicable. */
  readonly token?: readonly string[]
  /** Semantic address involved in the failure, when applicable. */
  readonly address?: VanitySemanticTokenAddress
  /** Axis involved in the failure, when applicable. */
  readonly axis?: string
  /** Mode involved in the failure, when applicable. */
  readonly mode?: string
  /** Root path involved in the failure, when applicable. */
  readonly rootPath?: string
  /** Semantic path involved in the failure, when applicable. */
  readonly path?: readonly string[]
  /** Supporting detail lines for the failure, when applicable. */
  readonly detail?: readonly string[]
  /** Human repair instruction for the failure, when applicable. */
  readonly fix?: string
}

/**
 * Browser-safe structured runtime failure. It deliberately owns only the
 * runtime contract, so importing `/runtime` never pulls in authoring
 * diagnostic normalization or formatting.
 */
export class VanityRuntimeError extends Error {
  readonly diagnostic: VanityRuntimeDiagnostic
  readonly code: VanityRuntimeDiagnosticCode

  constructor(diagnostic: VanityRuntimeDiagnostic) {
    super([diagnostic.message, ...(diagnostic.detail ?? [])].join('; '))
    this.name = 'VanityRuntimeError'
    this.diagnostic = Object.freeze({
      ...diagnostic,
      ...(diagnostic.token === undefined ? {} : { token: Object.freeze([...diagnostic.token]) }),
      ...(diagnostic.path === undefined ? {} : { path: Object.freeze([...diagnostic.path]) }),
      ...(diagnostic.detail === undefined ? {} : { detail: Object.freeze([...diagnostic.detail]) }),
    })
    this.code = this.diagnostic.code
  }
}

/** Create a runtime-native error without importing the authoring formatter. */
export function createVanityRuntimeError(diagnostic: VanityRuntimeDiagnostic): VanityRuntimeError {
  return new VanityRuntimeError(diagnostic)
}

/** Runtime snapshot plus all diagnostics produced while reconciling it. */
export interface VanityRuntimeReconciliation {
  /** Normalized snapshot accepted by the runtime. */
  readonly snapshot: VanityRuntimeSnapshot
  /** Diagnostics emitted while applying or rejecting the snapshot. */
  readonly diagnostics: readonly VanityRuntimeDiagnostic[]
}

/** Serialized inline styles grouped by runtime root path. */
export interface VanityRuntimeRootProps {
  /** Custom-property declarations for this root. */
  readonly style: Readonly<Record<`--${string}`, string>>
  /** Attribute values required to select runtime axis modes. */
  readonly attributes: Readonly<Record<string, string>>
}

/** Root-keyed attributes and inline styles for SSR runtime output. */
export type VanityRuntimeProps = Readonly<Record<string, VanityRuntimeRootProps>>
/** Root-keyed custom-property styles for SSR runtime output. */
export type VanityRuntimeStyles = Readonly<Record<string, Readonly<Record<`--${string}`, string>>>>

/** Detailed root, mode, override, and diagnostic state reported by inspection. */
export interface VanityRuntimeInspection {
  /** Runtime schema identity being inspected. */
  readonly system: string
  /** Root selector associated with the live runtime. */
  readonly root: string
  /** Whether at least one declared root is currently bound. */
  readonly active: boolean
  /** Resolution status and selector matches for every declared root. */
  readonly roots: readonly {
    readonly path: string
    readonly selector: string
    readonly status: 'unresolved' | 'missing' | 'resolved' | 'ambiguous' | 'bound'
    readonly matches: number
    readonly axes: readonly string[]
  }[]
  /** Current active mode per environmental axis. */
  readonly modes: Readonly<Record<string, string>>
  /** Semantic overrides and the concrete slots they write. */
  readonly overrides: readonly {
    readonly token: readonly string[]
    readonly address: VanitySemanticTokenAddress
    readonly val: string
    readonly name: `--${string}`
    readonly slot: `--${string}`
    readonly tokenRootPath: string
    readonly tokenRoot: string
    readonly applied?: string
  }[]
  /** Diagnostics collected by the live runtime. */
  readonly diagnostics: readonly VanityRuntimeDiagnostic[]
}

/** Options for creating or reconciling a runtime controller. */
export interface VanityRuntimeOptions {
  /** Resolve the system's declared selectors within this document/subtree. */
  readonly within?: VanityRuntimeQueryScope | VanityRuntimeTarget
  /** Initial snapshot or state applied before the controller is returned. */
  readonly initial?: unknown
  /** Application-runtime Standard Schema implementations keyed by token.validate.id. */
  readonly validators?: Readonly<Record<string, VanityStandardSchemaV1>>
  /** Application-runtime implementations for portable custom axis control ids. */
  readonly controls?: Readonly<Record<string, VanityAxisControl<any>>>
  /** Explicit dev signal for `runtime: 'dev'`; inferred when omitted. */
  readonly dev?: boolean
}

export interface VanityRuntimeMutableActions<Type extends VanityCssDataType = VanityCssDataType> {
  /** Set a mutable token or branch to a validated runtime value. */
  readonly $set: (input: VanityRuntimeInput<Type>) => void
  /** Remove a mutable override and restore the authored value. */
  readonly $unset: () => void
}

type RuntimeBranch<Branch, Mutable extends boolean, Type extends VanityCssDataType>
  = Branch & (Mutable extends true ? VanityRuntimeMutableActions<Type> : object)

type RuntimeAxes<Axes, Mutable extends boolean, Type extends VanityCssDataType> = {
  readonly [Axis in keyof Axes]: {
    readonly [Mode in keyof Axes[Axis]]: RuntimeBranch<Axes[Axis][Mode], Mutable, Type>
  }
}

type RuntimeMutability<Handle extends VanityTokenHandleAny>
  = [Handle['$mutable']] extends [true] ? true : false

type RuntimeToken<Handle extends VanityTokenHandleAny>
  = Omit<Handle, '$axes' | '$case'>
    & (RuntimeMutability<Handle> extends true
      ? VanityRuntimeMutableActions<Handle['$type']>
      : object)
    & {
      readonly $axes: RuntimeAxes<
        Handle['$axes'],
        RuntimeMutability<Handle>,
        Handle['$type']
      >
      readonly $case: (
        when: Parameters<Handle['$case']>[0],
      ) => RuntimeBranch<
        ReturnType<Handle['$case']>,
        RuntimeMutability<Handle>,
        Handle['$type']
      >
    }

/** Recursively project token handles into the runtime setter surface. */
export type VanityRuntimeTokens<T> = {
  readonly [Key in keyof T as Key extends `$${string}` ? never : Key]: T[Key] extends VanityTokenHandleAny
    ? RuntimeToken<T[Key]>
    : T[Key] extends object ? VanityRuntimeTokens<T[Key]> : T[Key]
}

type ActivatableModeName<Axis> = Axis extends VanityAxisDefinition<infer Modes, any>
  ? Axis extends { readonly control: VanityAxisControl<any> } ? keyof Modes & string : {
    [Mode in keyof Modes & string]: Modes[Mode] extends {
      readonly [VANITY_RUNTIME_ACTIVATABLE]: true
    } ? Mode : never
  }[keyof Modes & string]
  : never

/** Options controlling which modes a runtime axis cycle may skip. */
export interface VanityRuntimeCycleOptions<Mode extends string> {
  /** Modes excluded from the cycle order. */
  readonly exclude?: readonly Mode[]
}

/** Recursively expose runtime axis selection and activation operations. */
export type VanityRuntimeAxes<Axes extends VanityAxisDefinitions> = {
  readonly [Axis in keyof Axes]: {
    readonly $switchTo: (mode: ActivatableModeName<Axes[Axis]>) => void
    readonly $cycle: (options?: VanityRuntimeCycleOptions<ActivatableModeName<Axes[Axis]>>) => void
    readonly $current: () => ActivatableModeName<Axes[Axis]> | undefined
  } & {
    readonly [Mode in ActivatableModeName<Axes[Axis]>]: {
      readonly $activate: () => void
    }
  }
}

/** Live root-bound controller that applies token and axis operations to targets. */
interface VanityRuntimeControllerCore<T, Axes extends VanityAxisDefinitions> {
  /** Runtime token handles with mutable setters where the token allows them. */
  readonly t: VanityRuntimeTokens<T>
  /** Axis mode selectors, cycles, and activation operations. */
  readonly axes: VanityRuntimeAxes<Axes>
  /** Diagnostics collected during root resolution and value updates. */
  readonly diagnostics: readonly VanityRuntimeDiagnostic[]
  /** Re-resolve declared roots, optionally limiting the refresh to one path. */
  readonly refreshRoots: (path?: '$system' | string) => void
  /** Bind a concrete target to a declared runtime root path. */
  readonly bindRoot: (path: '$system' | string, element: VanityRuntimeTarget) => void
  /** Apply several token and axis operations as one observable update. */
  readonly transaction: (configure: (runtime: VanityRuntimeController<T, Axes>) => void) => void
  /** Validate and apply an SSR snapshot to the live runtime. */
  readonly hydrate: (snapshot: unknown) => VanityRuntimeReconciliation
  /** Capture the current semantic overrides and active modes as JSON-safe state. */
  readonly snapshot: () => VanityRuntimeSnapshot
  /** Inspect semantic overrides together with the concrete slots they write. */
  readonly inspect: () => VanityRuntimeInspection
}

/** Live root-bound controller that applies token and axis operations to targets. */
export type VanityRuntimeController<T, Axes extends VanityAxisDefinitions = VanityAxisDefinitions>
  = VanityRuntimeControllerCore<T, Axes>

/**
 * Root-resolving runtime entry returned by `ds.runtime`.
 *
 * @example
 * `type Runtime = ReturnType<typeof ds.runtime>`
 */
export type VanityRuntimeControllerFactory<T, Axes extends VanityAxisDefinitions = VanityAxisDefinitions> = (
  options?: VanityRuntimeOptions,
) => VanityRuntimeController<T, Axes>

/** Build a JSON-safe runtime snapshot without resolving or mutating a DOM. */
export type VanitySnapshotFrom<T, Axes extends VanityAxisDefinitions = VanityAxisDefinitions> = (
  /**
   * Apply the same semantic token and mode operations available on a live
   * runtime. The controller is backed only by memory and never resolves DOM.
   */
  configure: (runtime: VanityRuntimeController<T, Axes>) => void,
  options?: VanityRuntimeOptions,
) => VanityRuntimeSnapshot

export interface VanityRuntimeServices<T, Axes extends VanityAxisDefinitions = VanityAxisDefinitions> {
  /** Create a live runtime controller for the consolidated system. */
  readonly runtime: VanityRuntimeControllerFactory<T, Axes>
  /**
   * Build an SSR/hydration seed with the live runtime's exact validation and
   * semantic-address model, without creating or querying a DOM element.
   *
   * @example
   * ```ts
   * const seed = ds.snapshotFrom(rt => rt.t.color.hue.$set(275))
   * ```
   */
  readonly snapshotFrom: VanitySnapshotFrom<T, Axes>
  /** Reconcile an unknown snapshot against the runtime contract. */
  readonly reconcileRuntimeSnapshot: (snapshot: unknown, options?: VanityRuntimeOptions) => VanityRuntimeReconciliation
  /** Project an unknown snapshot into root-keyed custom-property styles. */
  readonly runtimeStyle: (snapshot: unknown, options?: VanityRuntimeOptions) => VanityRuntimeStyles
  /** Project an unknown snapshot into root-keyed attributes and styles. */
  readonly runtimeProps: (snapshot: unknown, options?: VanityRuntimeOptions) => VanityRuntimeProps
}

/** Finalize a JSON-safe draft with a deterministic semantic schema ID. */
export function sealRuntimeContract(draft: VanityRuntimeContractDraft): VanityRuntimeContract {
  const semantic = serializeStableString({
    protocol: draft.protocol,
    prefix: draft.prefix,
    root: draft.root,
    axisOrder: draft.axisOrder,
    axes: draft.axes,
    roots: draft.roots,
    tokens: draft.tokens.filter(token => token.mutable && token.baseSlot).map(token => ({
      token: token.token,
      name: token.name,
      rootPath: token.rootPath,
      root: token.root,
      type: token.type,
      validation: token.validation,
      branches: token.branches.map(branch => branch.address),
    })),
  })
  return freezeRuntimeContract({
    ...draft,
    system: `vanity-runtime-2-${hashRuntimeIdentity(semantic)}`,
  })
}

function serializeStableString(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(serializeStableString).join(',')}]`
  if (isPlainObject(value))
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${serializeStableString(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function hashRuntimeIdentity(value: string): string {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function freezeRuntimeContract<T>(value: T): T {
  if ((Array.isArray(value) || isPlainObject(value)) && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as object))
      freezeRuntimeContract(child)
  }
  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null)
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
