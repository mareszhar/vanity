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

export type VanityRuntimeInput<Type extends VanityCssDataType = VanityCssDataType>
  = VanityTokenFallback<Type>

export interface VanityRuntimeStyleDeclaration {
  readonly setProperty: (name: string, value: string, priority?: string) => void
  readonly removeProperty: (name: string) => string
  readonly getPropertyValue?: (name: string) => string
}

/** Structural by design: HTML/SVG elements and test/framework adapters qualify. */
export interface VanityRuntimeTarget {
  readonly style: VanityRuntimeStyleDeclaration
  readonly setAttribute: (name: string, value: string) => void
  readonly removeAttribute: (name: string) => void
  readonly getAttribute?: (name: string) => string | null
  readonly matches?: (selector: string) => boolean
  readonly contains?: (other: any) => boolean
  readonly ownerDocument?: {
    readonly querySelector: (selector: string) => unknown
    readonly querySelectorAll?: (selector: string) => ArrayLike<unknown> | Iterable<unknown>
    readonly documentElement?: unknown
  } | null
}

/** A document, shadow root, element, or framework adapter that can resolve declared roots. */
export interface VanityRuntimeQueryScope {
  readonly querySelectorAll: (selector: string) => ArrayLike<unknown> | Iterable<unknown>
  readonly querySelector?: (selector: string) => unknown
  readonly documentElement?: unknown
}

export type VanityCustomPropertyReference
  = `--${string}`
    | { readonly $name: `--${string}` }
    | { readonly name: `--${string}` }

export type VanityCustomPropertyTarget
  = VanityRuntimeStyleDeclaration
    | { readonly style: VanityRuntimeStyleDeclaration }

export type VanityCustomPropertyEntries
  = Readonly<Record<`--${string}`, VanityRuntimeInput>>
    | readonly (readonly [VanityCustomPropertyReference, VanityRuntimeInput])[]

export interface VanityRuntimeValidationContract {
  readonly id: string
  readonly runtime: false | 'dev' | 'always'
  readonly onInvalid: 'throw' | 'fallback' | 'omit'
  readonly fallback?: string
}

export interface VanityRuntimeBranchContract {
  readonly address: Exclude<VanitySemanticTokenAddress, { readonly kind: 'base' }>
  readonly slot?: string
  readonly value?: string | number
}

export interface VanityRuntimeTokenContract {
  readonly token: readonly string[]
  readonly name: `--${string}`
  /** Semantic owner used by the runtime and SSR projections. */
  readonly rootPath: string
  /** Declared selector for the owner; retained for diagnostics/introspection. */
  readonly root: string
  readonly scopes?: readonly string[]
  readonly type: VanityCssDataType
  readonly reference: 'val' | 'var'
  readonly emit: boolean
  readonly mutable: boolean
  readonly value?: string | number
  readonly description?: string
  readonly deprecated?: string
  readonly metadata?: VanityHandleMeta['metadata']
  readonly validation?: VanityRuntimeValidationContract
  readonly baseSlot?: string
  readonly branches: readonly VanityRuntimeBranchContract[]
}

export interface VanityRuntimeRootContract {
  /** `'$system'` or the mounted module path that declared this root. */
  readonly path: string
  readonly selector: string
  readonly scopes?: readonly string[]
  /** Axes whose emitted token declarations are carried by this root. */
  readonly axes: readonly string[]
}

export interface VanityRuntimeAxisContract {
  readonly defaultMode?: string
  readonly modes: readonly string[]
  readonly attribute?: {
    readonly name: string
    /** null selects a triggerless default by removing the shared attribute. */
    readonly values: Readonly<Record<string, string | null>>
  }
  readonly control?: {
    readonly id: string
    readonly projections?: Readonly<Record<string, {
      readonly style?: Readonly<Record<`--${string}`, string>>
      readonly attributes?: Readonly<Record<string, string>>
    }>>
  }
}

export interface VanityRuntimeContract {
  readonly protocol: typeof VANITY_RUNTIME_CONTRACT_PROTOCOL
  readonly system: string
  readonly prefix: string
  readonly root: string
  readonly axisOrder: readonly string[]
  readonly axes: Readonly<Record<string, VanityRuntimeAxisContract>>
  readonly roots: readonly VanityRuntimeRootContract[]
  readonly tokens: readonly VanityRuntimeTokenContract[]
}

export type VanityRuntimeContractDraft = Omit<VanityRuntimeContract, 'system'>

export interface VanityRuntimeSnapshotOverride {
  readonly token: readonly string[]
  readonly address: VanitySemanticTokenAddress
  readonly val: string
}

export interface VanityRuntimeSnapshotV1 {
  readonly version: typeof VANITY_RUNTIME_SNAPSHOT_VERSION
  readonly system: string
  readonly overrides: readonly VanityRuntimeSnapshotOverride[]
  readonly modes: Readonly<Record<string, string>>
}

export type VanityRuntimeDiagnosticCode
  = | 'VANITY_RUNTIME_SCHEMA_MISMATCH'
    | 'VANITY_RUNTIME_UNKNOWN_TOKEN'
    | 'VANITY_RUNTIME_UNKNOWN_ADDRESS'
    | 'VANITY_RUNTIME_IMMUTABLE_TOKEN'
    | 'VANITY_RUNTIME_INVALID_VALUE'
    | 'VANITY_RUNTIME_UNKNOWN_MODE'
    | 'VANITY_RUNTIME_UNSELECTABLE_AXIS'
    | 'VANITY_RUNTIME_ROOT_NOT_FOUND'
    | 'VANITY_RUNTIME_AMBIGUOUS_ROOT'
    | 'VANITY_RUNTIME_MODE_DISAGREEMENT'

export interface VanityRuntimeDiagnostic {
  readonly code: VanityRuntimeDiagnosticCode
  readonly message: string
  readonly token?: readonly string[]
  readonly address?: VanitySemanticTokenAddress
  readonly axis?: string
  readonly mode?: string
  readonly rootPath?: string
}

export interface VanityRuntimeReconciliation {
  readonly snapshot: VanityRuntimeSnapshotV1
  readonly diagnostics: readonly VanityRuntimeDiagnostic[]
}

export interface VanityRuntimeRootProps {
  readonly style: Readonly<Record<`--${string}`, string>>
  readonly attributes: Readonly<Record<string, string>>
}

export type VanityRuntimeProps = Readonly<Record<string, VanityRuntimeRootProps>>
export type VanityRuntimeStyles = Readonly<Record<string, Readonly<Record<`--${string}`, string>>>>

export interface VanityRuntimeInspection {
  readonly system: string
  readonly root: string
  readonly active: boolean
  readonly roots: readonly {
    readonly path: string
    readonly selector: string
    readonly status: 'unresolved' | 'missing' | 'resolved' | 'ambiguous' | 'bound'
    readonly matches: number
    readonly axes: readonly string[]
  }[]
  readonly modes: Readonly<Record<string, string>>
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
  readonly diagnostics: readonly VanityRuntimeDiagnostic[]
}

export interface VanityRuntimeOptions {
  /** Resolve the system's declared selectors within this document/subtree. */
  readonly within?: VanityRuntimeQueryScope | VanityRuntimeTarget
  readonly initial?: unknown
  /** Application-runtime Standard Schema implementations keyed by token.validate.id. */
  readonly validators?: Readonly<Record<string, VanityStandardSchemaV1>>
  /** Application-runtime implementations for portable custom axis control ids. */
  readonly controls?: Readonly<Record<string, VanityAxisControl<any>>>
  /** Explicit dev signal for `runtime: 'dev'`; inferred when omitted. */
  readonly dev?: boolean
}

export interface VanityRuntimeMutableActions<Type extends VanityCssDataType = VanityCssDataType> {
  readonly $set: (input: VanityRuntimeInput<Type>) => void
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

export interface VanityRuntimeCycleOptions<Mode extends string> {
  readonly exclude?: readonly Mode[]
}

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

interface VanityRuntimeControllerCore<T, Axes extends VanityAxisDefinitions> {
  readonly t: VanityRuntimeTokens<T>
  readonly axes: VanityRuntimeAxes<Axes>
  readonly diagnostics: readonly VanityRuntimeDiagnostic[]
  readonly refreshRoots: (path?: '$system' | string) => void
  readonly bindRoot: (path: '$system' | string, element: VanityRuntimeTarget) => void
  readonly transaction: (configure: (runtime: VanityRuntimeController<T, Axes>) => void) => void
  readonly hydrate: (snapshot: unknown) => VanityRuntimeReconciliation
  readonly snapshot: () => VanityRuntimeSnapshotV1
  /** Inspect semantic overrides together with the concrete slots they write. */
  readonly inspect: () => VanityRuntimeInspection
}

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

export type VanitySnapshotFrom<T, Axes extends VanityAxisDefinitions = VanityAxisDefinitions> = (
  /**
   * Apply the same semantic token and mode operations available on a live
   * runtime. The controller is backed only by memory and never resolves DOM.
   */
  configure: (runtime: VanityRuntimeController<T, Axes>) => void,
  options?: VanityRuntimeOptions,
) => VanityRuntimeSnapshotV1

export interface VanityRuntimeServices<T, Axes extends VanityAxisDefinitions = VanityAxisDefinitions> {
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
  readonly reconcileRuntimeSnapshot: (snapshot: unknown, options?: VanityRuntimeOptions) => VanityRuntimeReconciliation
  readonly runtimeStyle: (snapshot: unknown, options?: VanityRuntimeOptions) => VanityRuntimeStyles
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
