/** Token and branch handles shared across build and application contexts. */

import type { VanityCssDataType } from '../values/types'
import { serializeCssText } from '../values/types'

export type VanityHandleReference = 'val' | 'var'
type VanityHandleMetadataValue = string | number | boolean | null | readonly VanityHandleMetadataValue[] | { readonly [key: string]: VanityHandleMetadataValue }
type VanityHandleMetadata = Readonly<Record<string, VanityHandleMetadataValue>>

export const VANITY_HANDLE = Symbol.for('vanity.tokenHandle')
export const VANITY_BRANCH_HANDLE = Symbol.for('vanity.tokenBranchHandle')
export const VANITY_RUNTIME_ADDRESS = Symbol.for('vanity.runtimeAddress')

// Restored handles may be hoisted above module constants by an SSR bundler.
// Function declarations remain callable there; Symbol.for preserves identity.
function getVanityHandleSymbol(): symbol {
  return Symbol.for('vanity.tokenHandle')
}

function getVanityBranchHandleSymbol(): symbol {
  return Symbol.for('vanity.tokenBranchHandle')
}

function getVanityRuntimeAddressSymbol(): symbol {
  return Symbol.for('vanity.runtimeAddress')
}

function getCaseBranchesSymbol(): symbol {
  return Symbol.for('vanity.caseBranches')
}

export type VanitySemanticTokenAddress
  = { readonly kind: 'base' }
    | { readonly kind: 'axis', readonly axis: string, readonly mode: string }
    | { readonly kind: 'case', readonly when: Readonly<Record<string, string>> }

/** Internal cross-context identity. Private slot names never enter snapshots. */
export interface VanityHandleRuntimeAddress {
  readonly system: string
  readonly token: readonly string[]
  readonly address: VanitySemanticTokenAddress
  readonly slot: string
}

export interface VanityHandleMeta {
  /** The emitted custom-property name, e.g. `--vanity-color-brand`. */
  name: string
  /** The dot path in the graph, e.g. `color.brand`. */
  path: string
  /** Canonical default projection; low-level restored handles may omit it and stay var-referenced. */
  reference?: VanityHandleReference
  emit?: boolean
  mutable?: boolean
  type?: VanityCssDataType
  /** The authored/resolved expression. Undefined is a deliberate no-default reservation. */
  value?: string | number
  description?: string
  deprecated?: string
  metadata?: VanityHandleMetadata
  register?: unknown
  validate?: unknown
  runtime?: VanityHandleRuntimeAddress
  axes?: Readonly<Record<string, Readonly<Record<string, {
    value?: string | number
    description?: string
    metadata?: VanityHandleMetadata
    runtime?: VanityHandleRuntimeAddress
  }>>>>
  cases?: readonly {
    when: Readonly<Record<string, string>>
    value?: string | number
    description?: string
    metadata?: VanityHandleMetadata
    runtime?: VanityHandleRuntimeAddress
  }[]
}

export interface VanityInternalTokenBranchHandle {
  (): string
  readonly [VANITY_BRANCH_HANDLE]: true
  readonly [VANITY_RUNTIME_ADDRESS]?: VanityHandleRuntimeAddress
  $val?: string | number
  $description?: string
  $metadata?: VanityHandleMetadata
  toString: () => string
}

export interface VanityInternalTokenHandle {
  (): string
  readonly [VANITY_HANDLE]: true
  readonly [VANITY_RUNTIME_ADDRESS]?: VanityHandleRuntimeAddress
  readonly $name: `--${string}`
  $val?: string | number
  readonly $var: (fallback?: unknown) => `var(--${string})` | `var(--${string}, ${string})`
  readonly $path: string
  readonly $type: VanityCssDataType
  readonly $reference: VanityHandleReference
  readonly $emit: boolean
  readonly $mutable: boolean
  /** Apply this token as a declaration named by its final path segment. */
  readonly $dec: Readonly<Record<string, VanityInternalTokenHandle>>
  $description?: string
  $deprecated?: string
  $metadata?: VanityHandleMetadata
  readonly $register?: unknown
  readonly $validate?: unknown
  $axes: Record<string, Record<string, VanityInternalTokenBranchHandle>>
  $case: (when: Readonly<Record<string, string>>) => VanityInternalTokenBranchHandle
  toString: () => string
}

/**
 * Handles stay functions so the substrate can serialize them. Canonical
 * fields use getters over mutable restoration state; all non-$ metadata stays
 * behind a private symbol and is read through the accessors below.
 */
export function createHandle(meta: VanityHandleMeta): VanityInternalTokenHandle {
  const state: VanityHandleMeta = {
    ...meta,
    reference: meta.reference ?? 'var',
    emit: meta.emit ?? true,
    mutable: meta.mutable ?? false,
    type: meta.type ?? 'unknown',
  }
  const variable = `var(${meta.name})` as `var(--${string})`
  const axes: Record<string, Record<string, VanityInternalTokenBranchHandle>> = {}
  const cases = new Map<string, VanityInternalTokenBranchHandle>()

  const render = () => state.reference === 'val' && state.value !== undefined
    ? String(state.value)
    : variable
  const handle = (() => render()) as VanityInternalTokenHandle

  Object.defineProperty(handle, getVanityHandleSymbol(), { value: true })
  Object.defineProperty(handle, handleMetadataSymbol(), { value: state })
  if (meta.runtime)
    Object.defineProperty(handle, getVanityRuntimeAddressSymbol(), { configurable: true, value: meta.runtime })

  defineGetter(handle, '$name', () => state.name as `--${string}`)
  defineMutable(handle, '$val', () => state.value, value => state.value = value)
  defineGetter(handle, '$var', () => (fallback?: unknown) => {
    if (fallback === undefined)
      return variable
    const serialized = serializeFallback(fallback)
    return `var(${state.name}, ${serialized})` as `var(--${string}, ${string})`
  })
  defineGetter(handle, '$path', () => state.path)
  defineGetter(handle, '$type', () => state.type!)
  defineGetter(handle, '$reference', () => state.reference!)
  defineGetter(handle, '$emit', () => state.emit!)
  defineGetter(handle, '$mutable', () => state.mutable!)
  Object.defineProperty(handle, '$dec', {
    configurable: true,
    enumerable: false,
    get: () => Object.freeze({
      [state.path.split('.').at(-1) ?? state.path]: handle,
    }),
  })
  defineMutable(handle, '$description', () => state.description, value => state.description = value)
  defineMutable(handle, '$deprecated', () => state.deprecated, value => state.deprecated = value)
  defineMutable(handle, '$metadata', () => state.metadata, value => state.metadata = value)
  defineGetter(handle, '$register', () => state.register)
  defineGetter(handle, '$validate', () => state.validate)
  defineGetter(handle, '$axes', () => axes)
  defineGetter(handle, '$case', () => (when: Readonly<Record<string, string>>) => {
    const branch = cases.get(addressKey(when))
    if (!branch)
      throw new TypeError(`[vanity] ${state.path} has no authored case for ${JSON.stringify(when)}`)
    return branch
  })
  defineGetter(handle, 'toString', () => render)

  if (meta.axes || meta.cases) {
    attachCaseBranches(handle)
    for (const [axis, modes] of Object.entries(meta.axes ?? {})) {
      for (const [mode, branch] of Object.entries(modes))
        attachAxisBranch(handle, axis, mode, createBranchHandle(branch.value, branch))
    }
    for (const branch of meta.cases ?? [])
      attachCaseBranch(handle, branch.when, createBranchHandle(branch.value, branch))
  }

  return handle
}

export function updateHandle(handle: VanityInternalTokenHandle, update: Partial<VanityHandleMeta>): void {
  if ('value' in update)
    handle.$val = update.value
  if ('description' in update)
    handle.$description = update.description
  if ('deprecated' in update)
    handle.$deprecated = update.deprecated
  if ('metadata' in update)
    handle.$metadata = update.metadata
}

/** Read the private metadata used by graph and runtime internals. */
export function readHandleMeta(handle: VanityInternalTokenHandle): VanityHandleMeta {
  const meta = (handle as unknown as Record<symbol, VanityHandleMeta | undefined>)[handleMetadataSymbol()]
  if (!meta)
    throw new TypeError('[vanity] value is not a canonical token handle')
  return meta
}

export function readHandleName(handle: VanityInternalTokenHandle): string {
  return readHandleMeta(handle).name
}

export function readHandlePath(handle: VanityInternalTokenHandle): string {
  return readHandleMeta(handle).path
}

export function readHandleReference(handle: VanityInternalTokenHandle): VanityHandleReference {
  return readHandleMeta(handle).reference ?? 'var'
}

export function readHandleEmit(handle: VanityInternalTokenHandle): boolean {
  return readHandleMeta(handle).emit ?? true
}

export function readHandleMutable(handle: VanityInternalTokenHandle): boolean {
  return readHandleMeta(handle).mutable ?? false
}

export function readHandleValue(handle: VanityInternalTokenHandle): string | number | undefined {
  return readHandleMeta(handle).value
}

export function readHandleVar(handle: VanityInternalTokenHandle): `var(--${string})` {
  return `var(${readHandleName(handle)})` as `var(--${string})`
}

export function readHandleType(handle: VanityInternalTokenHandle): VanityCssDataType {
  return readHandleMeta(handle).type ?? 'unknown'
}

export function readHandleDescription(handle: VanityInternalTokenHandle): string | undefined {
  return readHandleMeta(handle).description
}

export function readHandleDeprecated(handle: VanityInternalTokenHandle): string | undefined {
  return readHandleMeta(handle).deprecated
}

function handleMetadataSymbol(): symbol {
  return Symbol.for('vanity.tokenHandle.meta')
}

export function createBranchHandle(value?: string | number, meta: {
  description?: string
  metadata?: VanityHandleMetadata
  runtime?: VanityHandleRuntimeAddress
} = {}): VanityInternalTokenBranchHandle {
  const state = { value, ...meta }
  const render = () => state.value === undefined ? '' : String(state.value)
  const handle = (() => render()) as VanityInternalTokenBranchHandle
  Object.defineProperty(handle, getVanityBranchHandleSymbol(), { value: true })
  if (meta.runtime)
    Object.defineProperty(handle, getVanityRuntimeAddressSymbol(), { configurable: true, value: meta.runtime })
  defineMutable(handle, '$val', () => state.value, next => state.value = next)
  defineMutable(handle, '$description', () => state.description, next => state.description = next)
  defineMutable(handle, '$metadata', () => state.metadata, next => state.metadata = next)
  defineGetter(handle, 'toString', () => render)
  return handle
}

export function attachAxisBranch(
  handle: VanityInternalTokenHandle,
  axis: string,
  mode: string,
  branch: VanityInternalTokenBranchHandle,
): void {
  const axes = handle.$axes
  axes[axis] ??= {}
  axes[axis]![mode] = branch
}

export function attachCaseBranch(
  handle: VanityInternalTokenHandle,
  when: Readonly<Record<string, string>>,
  branch: VanityInternalTokenBranchHandle,
): void {
  // `$case` closes over this map; storing it on a non-enumerable symbol keeps
  // private runtime addresses out of the public token tree.
  const symbol = getCaseBranchesSymbol()
  const owner = handle as VanityInternalTokenHandle & Record<symbol, Map<string, VanityInternalTokenBranchHandle> | undefined>
  let cases = owner[symbol]
  if (!cases) {
    cases = new Map()
    Object.defineProperty(owner, symbol, { value: cases })
  }
  cases.set(addressKey(when), branch)
}

/** Called immediately after creation so `$case` and attachment share storage. */
export function attachCaseBranches(handle: VanityInternalTokenHandle): void {
  const symbol = getCaseBranchesSymbol()
  const owner = handle as VanityInternalTokenHandle & Record<symbol, Map<string, VanityInternalTokenBranchHandle> | undefined>
  const cases = owner[symbol] ?? new Map<string, VanityInternalTokenBranchHandle>()
  if (!owner[symbol])
    Object.defineProperty(owner, symbol, { value: cases })
  Object.defineProperty(handle, '$case', {
    configurable: true,
    get: () => (when: Readonly<Record<string, string>>) => {
      const branch = cases.get(addressKey(when))
      if (!branch)
        throw new TypeError(`[vanity] ${readHandlePath(handle)} has no authored case for ${JSON.stringify(when)}`)
      return branch
    },
  })
}

export function isHandle(value: unknown): value is VanityInternalTokenHandle {
  return typeof value === 'function'
    && (value as unknown as Record<symbol, unknown>)[getVanityHandleSymbol()] === true
}

export function isBranchHandle(value: unknown): value is VanityInternalTokenBranchHandle {
  return typeof value === 'function'
    && (value as unknown as Record<symbol, unknown>)[getVanityBranchHandleSymbol()] === true
}

export function runtimeAddressOf(value: unknown): VanityHandleRuntimeAddress | undefined {
  if (!isHandle(value) && !isBranchHandle(value))
    return undefined
  return (value as unknown as Record<symbol, VanityHandleRuntimeAddress | undefined>)[getVanityRuntimeAddressSymbol()]
}

export function setRuntimeAddress(
  value: VanityInternalTokenHandle | VanityInternalTokenBranchHandle,
  runtime: VanityHandleRuntimeAddress,
): void {
  Object.defineProperty(value, getVanityRuntimeAddressSymbol(), { configurable: true, value: runtime })
}

function serializeFallback(value: unknown): string {
  if (isHandle(value) || isBranchHandle(value))
    return String(value)
  return serializeCssText(value as Parameters<typeof serializeCssText>[0])
}

function addressKey(when: Readonly<Record<string, string>>): string {
  return Object.entries(when).sort(([left], [right]) => left.localeCompare(right)).map(([axis, mode]) => `${axis}\0${mode}`).join('\x01')
}

function defineGetter<T extends object, Key extends PropertyKey>(target: T, key: Key, get: () => unknown): void {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, get })
}

function defineMutable<T extends object, Key extends PropertyKey>(
  target: T,
  key: Key,
  get: () => unknown,
  set: (value: any) => void,
): void {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, get, set })
}
