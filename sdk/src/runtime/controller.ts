/** Browser-safe runtime binding over pre-emitted mutable custom-property slots. */

import type {
  VanityCustomPropertyEntries,
  VanityCustomPropertyReference,
  VanityCustomPropertyTarget,
  VanityRuntimeInput,
} from '@mszr/vanity'
import type {
  VanityAxisControl,
  VanityAxisDefinitions,
} from '../system/axes'
import type {
  VanityInternalTokenBranchHandle as InternalBranchHandle,
  VanityInternalTokenHandle as InternalTokenHandle,
  VanityHandleMeta,
  VanityHandleRuntimeAddress,
  VanitySemanticTokenAddress,
} from '../tokens/handle'
import type {
  VanityStandardSchemaV1,
} from '../tokens/types'
import type {
  VanityRuntimeAxes,
  VanityRuntimeContract,
  VanityRuntimeController,
  VanityRuntimeControllerFactory,
  VanityRuntimeCycleOptions,
  VanityRuntimeDiagnostic,
  VanityRuntimeInspection,
  VanityRuntimeOptions,
  VanityRuntimeProps,
  VanityRuntimeQueryScope,
  VanityRuntimeReconciliation,
  VanityRuntimeRootContract,
  VanityRuntimeServices,
  VanityRuntimeSnapshot,
  VanityRuntimeSnapshotOverride,
  VanityRuntimeStyleDeclaration,
  VanityRuntimeStyles,
  VanityRuntimeTarget,
  VanityRuntimeTokenContract,
  VanityRuntimeTokens,
  VanitySnapshotFrom,
} from './contract'
import type { getTokenRangeError } from './range'
import { setOwn } from '../collections'
import {
  createHandle,
  getRuntimeAddress,
} from '../tokens/handle'
import { isDevelopmentMode, resolveRuntimeValue, serializeRuntimeValue } from './acceptance'
import {
  createVanityRuntimeError,
  VANITY_RUNTIME_SNAPSHOT_VERSION,
  VanityRuntimeError,
} from './contract'
import { serializeRuntimeCssText } from './value'

interface RuntimeSchemaStore {
  readonly [id: string]: VanityStandardSchemaV1 | undefined
}

interface RuntimeOverride extends VanityRuntimeSnapshotOverride {
  readonly value: string
}

interface RuntimeProjection {
  readonly overrides: readonly RuntimeOverride[]
  readonly modes: Readonly<Record<string, string>>
}

interface RuntimeReconciliation {
  readonly result: VanityRuntimeReconciliation
  readonly projection: RuntimeProjection
}

interface RuntimeRootState {
  readonly contract: VanityRuntimeRootContract
  targets: VanityRuntimeTarget[]
  resolved: boolean
  bound: boolean
}

interface RuntimeState {
  readonly contract: VanityRuntimeContract
  readonly roots: Map<string, RuntimeRootState>
  readonly within?: VanityRuntimeQueryScope | VanityRuntimeTarget
  readonly overrides: Map<string, RuntimeOverride>
  readonly modes: Map<string, string>
  readonly diagnostics: VanityRuntimeDiagnostic[]
  readonly options: VanityRuntimeOptions
  readonly memory: boolean
  readonly compareRange?: typeof getTokenRangeError
  active: boolean
}

const BOUND_RUNTIMES = new WeakMap<object, Map<string, RuntimeState>>()

/**
 * Write one serialized value to any custom property or resolved Vanity token.
 *
 * `tokenOrProperty` accepts `'--brand'`, `{ name: '--brand' }`,
 * `{ $name: '--brand' }`, or the token handle itself.
 *
 * @param target Element or style declaration that owns the write.
 * @param tokenOrProperty A `'--name'`, `{ name }`, `{ $name }`, or token handle.
 * @param val String, number, Vanity value, or compatible token value to serialize.
 * @example
 * `setCustomProperty(element, ds.t.color.brand, ds.oklch(0.6, 0.2, 264))`
 */
export function setCustomProperty(
  target: VanityCustomPropertyTarget,
  tokenOrProperty: VanityCustomPropertyReference,
  val: VanityRuntimeInput,
): void {
  getRuntimeStyleDeclaration(target).setProperty(getRuntimeCustomPropertyName(tokenOrProperty), serializeRuntimeValue(val))
}

/**
 * Write several serialized custom-property or token values in one call.
 *
 * @example
 * `setCustomProperties(element, { '--space': '1rem', '--opacity': 0.8 })`
 */
export function setCustomProperties(
  target: VanityCustomPropertyTarget,
  entries: VanityCustomPropertyEntries,
): void {
  if (Array.isArray(entries)) {
    for (const [tokenOrProperty, val] of entries)
      setCustomProperty(target, tokenOrProperty, val)
    return
  }
  for (const [tokenOrProperty, val] of Object.entries(entries))
    setCustomProperty(target, tokenOrProperty as `--${string}`, val)
}

export function createRuntimeServices<T, Axes extends VanityAxisDefinitions = VanityAxisDefinitions>(
  contract: VanityRuntimeContract,
  embeddedSchemas: RuntimeSchemaStore = {},
  embeddedControls: Readonly<Record<string, VanityAxisControl<any>>> = {},
  compareRange?: typeof getTokenRangeError,
): VanityRuntimeServices<T, Axes> {
  const reconcile = (snapshot: unknown, options: VanityRuntimeOptions = {}) =>
    reconcileSnapshot(contract, snapshot, mergeSchemas(embeddedSchemas, options.validators), options, compareRange).result
  const runtimeStyle = (snapshot: unknown, options: VanityRuntimeOptions = {}) => {
    const result = reconcileSnapshot(contract, snapshot, mergeSchemas(embeddedSchemas, options.validators), options, compareRange)
    return projectStyles(contract, result.projection)
  }
  const runtimeProps = (snapshot: unknown, options: VanityRuntimeOptions = {}) => {
    const result = reconcileSnapshot(contract, snapshot, mergeSchemas(embeddedSchemas, options.validators), options, compareRange)
    return projectProps(contract, result.projection)
  }
  return {
    runtime: ((options: VanityRuntimeOptions = {}) => {
      assertRuntimeOptions(options)
      return bindRuntime<T, Axes>(
        contract,
        { ...options, controls: { ...embeddedControls, ...options.controls } },
        mergeSchemas(embeddedSchemas, options.validators),
        compareRange,
      )
    }) as VanityRuntimeControllerFactory<T, Axes>,
    snapshotFrom: ((configure: (runtime: VanityRuntimeController<T, Axes>) => void, options: VanityRuntimeOptions = {}) => {
      if (typeof configure !== 'function') {
        throwRuntimeDiagnostic({
          code: 'VANITY_RUNTIME_INVALID_OPTIONS',
          message: 'snapshotFrom() needs a callback that configures the seed runtime',
          path: ['snapshotFrom'],
          fix: 'pass a callback such as snapshotFrom(runtime => runtime.t.color.$set(...))',
        })
      }

      const runtime = bindRuntime<T, Axes>(
        contract,
        { ...options, controls: { ...embeddedControls, ...options.controls } },
        mergeSchemas(embeddedSchemas, options.validators),
        compareRange,
        true,
      )
      configure(runtime)
      return runtime.snapshot()
    }) as VanitySnapshotFrom<T, Axes>,
    reconcileRuntimeSnapshot: reconcile,
    runtimeStyle,
    runtimeProps,
  }
}

function assertRuntimeOptions(options: unknown): asserts options is VanityRuntimeOptions {
  if (isRuntimeTarget(options)) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_INVALID_OPTIONS',
      message: 'ds.runtime() resolves declared roots; use runtime({ within: element }) or runtime().bindRoot(path, element)',
      path: ['within'],
      fix: 'pass the target as runtime({ within }) or bind it with runtime().bindRoot(path, element)',
    })
  }
  if (!isPlainObject(options)) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_INVALID_OPTIONS',
      message: 'ds.runtime() accepts only an options object; selector strings are not accepted',
      path: ['options'],
      fix: 'pass an options object, for example runtime({ within: document })',
    })
  }
}

/** Generated application-module restoration target for `ds.runtime()`. */
export function restoreRuntimeControllerFactory<T, Axes extends VanityAxisDefinitions = VanityAxisDefinitions>(
  contract: VanityRuntimeContract,
  compareRange?: typeof getTokenRangeError,
): VanityRuntimeControllerFactory<T, Axes> {
  return createRuntimeServices<T, Axes>(contract, {}, {}, compareRange).runtime
}

/** Restore `snapshotFrom()` from compiler-projected runtime data: `restoreSnapshotFrom(contract)`. */
export function restoreSnapshotFrom<T, Axes extends VanityAxisDefinitions = VanityAxisDefinitions>(
  contract: VanityRuntimeContract,
  compareRange?: typeof getTokenRangeError,
): VanitySnapshotFrom<T, Axes> {
  return createRuntimeServices<T, Axes>(contract, {}, {}, compareRange).snapshotFrom
}

/** Restore runtime snapshot reconciliation from projected data: `restoreRuntimeReconciler(contract)`. */
export function restoreRuntimeReconciler(contract: VanityRuntimeContract, compareRange?: typeof getTokenRangeError): VanityRuntimeServices<unknown>['reconcileRuntimeSnapshot'] {
  return createRuntimeServices(contract, {}, {}, compareRange).reconcileRuntimeSnapshot
}

/** Restore runtime inline-style projection from projected data: `restoreRuntimeStyle(contract)`. */
export function restoreRuntimeStyle(contract: VanityRuntimeContract, compareRange?: typeof getTokenRangeError): VanityRuntimeServices<unknown>['runtimeStyle'] {
  return createRuntimeServices(contract, {}, {}, compareRange).runtimeStyle
}

/** Restore runtime prop projection from projected data: `restoreRuntimeProps(contract)`. */
export function restoreRuntimeProps(contract: VanityRuntimeContract, compareRange?: typeof getTokenRangeError): VanityRuntimeServices<unknown>['runtimeProps'] {
  return createRuntimeServices(contract, {}, {}, compareRange).runtimeProps
}

function bindRuntime<T, Axes extends VanityAxisDefinitions>(
  contract: VanityRuntimeContract,
  options: VanityRuntimeOptions,
  schemas: RuntimeSchemaStore,
  compareRange?: typeof getTokenRangeError,
  memory = false,
): VanityRuntimeController<T, Axes> {
  const family = `${contract.prefix}\0${contract.root}`
  const scope = memory ? undefined : getResolutionScope(options)
  const bindings = scope === undefined
    ? undefined
    : BOUND_RUNTIMES.get(scope) ?? new Map<string, RuntimeState>()
  const prior = bindings?.get(family)
  const effectiveOptions = options.initial === undefined && prior
    ? { ...options, initial: getRuntimeSnapshot(prior.contract, prior) }
    : options
  if (prior)
    prior.active = false
  const state: RuntimeState = {
    contract,
    roots: new Map(contract.roots.map(root => [root.path, {
      contract: root,
      targets: memory ? [createMemoryRuntimeTarget()] : [],
      resolved: memory,
      bound: memory,
    }])),
    ...(scope === undefined ? {} : { within: scope as VanityRuntimeQueryScope | VanityRuntimeTarget }),
    overrides: new Map(),
    modes: new Map(),
    diagnostics: [],
    options: effectiveOptions,
    memory,
    compareRange,
    active: true,
  }
  if (bindings && scope) {
    bindings.set(family, state)
    BOUND_RUNTIMES.set(scope, bindings)
  }

  if (effectiveOptions.initial !== undefined) {
    const initial = reconcileSnapshot(contract, effectiveOptions.initial, schemas, effectiveOptions, compareRange)
    state.diagnostics.push(...initial.result.diagnostics)
    restoreRuntimeState(contract, state, initial.projection)
  }
  return createRuntimeController<T, Axes>(contract, state, schemas)
}

function createMemoryRuntimeTarget(): VanityRuntimeTarget {
  const values = new Map<string, string>()
  const attributes = new Map<string, string>()

  return {
    style: {
      setProperty(name, value) {
        values.set(name, value)
      },
      removeProperty(name) {
        const previous = values.get(name) ?? ''
        values.delete(name)
        return previous
      },
      getPropertyValue(name) {
        return values.get(name) ?? ''
      },
    },
    setAttribute(name, value) {
      attributes.set(name, value)
    },
    removeAttribute(name) {
      attributes.delete(name)
    },
    getAttribute(name) {
      return attributes.get(name) ?? null
    },
  }
}

type RuntimeMutation
  = {
    readonly kind: 'set'
    readonly token: VanityRuntimeTokenContract
    readonly runtime: VanityHandleRuntimeAddress
    readonly value: string
    readonly override: RuntimeOverride
  }
  | {
    readonly kind: 'unset'
    readonly token: VanityRuntimeTokenContract
    readonly runtime: VanityHandleRuntimeAddress
  }
  | {
    readonly kind: 'mode'
    readonly axis: string
    readonly mode: string
    readonly name?: string
    readonly value?: string | null
  }

function createRuntimeController<T, Axes extends VanityAxisDefinitions>(
  contract: VanityRuntimeContract,
  state: RuntimeState,
  schemas: RuntimeSchemaStore,
  queued?: RuntimeMutation[],
): VanityRuntimeController<T, Axes> {
  const emit = (mutation: RuntimeMutation): void => {
    if (queued)
      queued.push(mutation)
    else
      applyMutations(state, [mutation])
  }
  const t = createRuntimeTree(contract, state, schemas, emit) as VanityRuntimeTokens<T>
  const axes = createRuntimeAxes<Axes>(contract, state, emit)

  const controller = {
    t,
    axes,
    get diagnostics() {
      return Object.freeze([...state.diagnostics])
    },
    refreshRoots(path?: string) {
      assertActive(state)
      if (path === undefined) {
        for (const root of state.roots.values()) {
          resolveRuntimeRoot(state, root, true)
          applyStateToRoot(state, root)
        }
        return
      }
      const root = getRuntimeRoot(state, path)
      resolveRuntimeRoot(state, root, true)
      applyStateToRoot(state, root)
    },
    bindRoot(path: string, element: VanityRuntimeTarget) {
      assertActive(state)
      assertRuntimeTarget(element)
      const root = getRuntimeRoot(state, path)
      root.targets = [element]
      root.resolved = true
      root.bound = true
      applyStateToRoot(state, root)
    },
    transaction(configure: (runtime: VanityRuntimeController<T, Axes>) => void) {
      assertActive(state)
      if (typeof configure !== 'function') {
        throwRuntimeDiagnostic({
          code: 'VANITY_RUNTIME_INVALID_OPTIONS',
          message: 'runtime.transaction() needs a callback',
          path: ['transaction'],
          fix: 'pass a callback that performs the runtime operations',
        })
      }
      const mutations: RuntimeMutation[] = []
      configure(createRuntimeController<T, Axes>(contract, state, schemas, mutations))
      applyMutations(state, mutations)
    },
    hydrate(input: unknown) {
      assertActive(state)
      const result = reconcileSnapshot(contract, input, schemas, state.options, state.compareRange)
      state.diagnostics.push(...result.result.diagnostics)
      restoreRuntimeState(contract, state, result.projection)
      return result.result
    },
    snapshot: () => getRuntimeSnapshot(contract, state),
    inspect: () => inspectRuntime(contract, state),
  }
  return Object.freeze(controller) as unknown as VanityRuntimeController<T, Axes>
}

function createRuntimeAxes<Axes extends VanityAxisDefinitions>(
  contract: VanityRuntimeContract,
  state: RuntimeState,
  emit: (mutation: RuntimeMutation) => void,
): VanityRuntimeAxes<Axes> {
  const tree: Record<string, unknown> = {}
  for (const axis of contract.axisOrder) {
    const definition = contract.axes[axis]!
    const switchTo = (mode: string): void => emit(prepareMode(contract, state, axis, mode))
    const actions: Record<string, unknown> = {
      $switchTo: switchTo,
      $current: () => getCurrentMode(contract, state, axis),
      $cycle: (options: VanityRuntimeCycleOptions<string> = {}) => {
        const modes = definition.modes.filter(mode =>
          definition.control !== undefined || Object.hasOwn(definition.attribute?.values ?? {}, mode))
          .filter(mode => !options.exclude?.includes(mode))
        if (modes.length === 0) {
          throwRuntimeDiagnostic({
            code: 'VANITY_RUNTIME_UNSELECTABLE_AXIS',
            message: `runtime axis '${axis}' has no activatable modes left to cycle`,
            axis,
            fix: 'leave at least one activatable mode in the cycle or remove it from exclude',
          })
        }
        const current = getCurrentMode(contract, state, axis)
        const next = current === undefined
          ? (definition.defaultMode && modes.includes(definition.defaultMode) ? definition.defaultMode : modes[0]!)
          : modes[(modes.indexOf(current) + 1) % modes.length] ?? modes[0]!
        switchTo(next)
      },
    }
    for (const mode of definition.modes) {
      if (definition.control !== undefined || Object.hasOwn(definition.attribute?.values ?? {}, mode))
        setOwn(actions, mode, Object.freeze({ $activate: () => switchTo(mode) }))
    }
    setOwn(tree, axis, Object.freeze(actions))
  }
  return Object.freeze(tree) as VanityRuntimeAxes<Axes>
}

function prepareMode(
  contract: VanityRuntimeContract,
  state: RuntimeState,
  axis: string,
  mode: string,
): RuntimeMutation {
  assertActive(state)
  const definition = contract.axes[axis]
  if (!definition) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_UNKNOWN_AXIS',
      message: `runtime has no axis '${axis}'`,
      axis,
      fix: 'use one of the axes declared by the system runtime contract',
    })
  }
  if (!definition.modes.includes(mode)) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_UNKNOWN_MODE',
      message: `runtime axis '${axis}' has no mode '${mode}'`,
      axis,
      mode,
      fix: `use one of the declared modes: ${definition.modes.join(', ')}`,
    })
  }
  const value = definition.attribute && Object.hasOwn(definition.attribute.values, mode) ? definition.attribute.values[mode] : undefined
  if ((!definition.attribute || value === undefined) && !definition.control) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_UNSELECTABLE_AXIS',
      message: `runtime axis '${axis}' cannot activate mode '${mode}'`,
      axis,
      mode,
      fix: 'declare an attribute mapping or provide the control implementation for this axis',
    })
  }
  if (definition.control && !state.options.controls?.[definition.control.id]) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_UNSELECTABLE_AXIS',
      message: `runtime axis '${axis}' needs control '${definition.control.id}' in runtime({ controls })`,
      axis,
      mode,
      fix: `provide controls: { ${definition.control.id}: ... } when creating the runtime`,
    })
  }
  return {
    kind: 'mode',
    axis,
    mode,
    ...(definition.attribute === undefined || value === undefined
      ? {}
      : { name: definition.attribute.name, value }),
  }
}

function getCurrentMode(
  contract: VanityRuntimeContract,
  state: RuntimeState,
  axis: string,
): string | undefined {
  assertActive(state)
  const definition = contract.axes[axis]
  if (!definition) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_UNKNOWN_AXIS',
      message: `runtime has no axis '${axis}'`,
      axis,
      fix: 'use one of the axes declared by the system runtime contract',
    })
  }
  const control = definition.control && state.options.controls?.[definition.control.id]
  if (!definition.attribute && !control)
    return undefined
  if (state.memory)
    return state.modes.get(axis)

  const readings: { root: string, mode: string | undefined }[] = []
  for (const root of getRootsForAxis(state, axis)) {
    const targets = getTargetsForRoot(state, root, false)
    for (const [index, target] of targets.entries()) {
      const mode = control
        ? control.read(target)
        : Object.entries(definition.attribute!.values)
          .find(([, expected]) => expected === (target.getAttribute?.(definition.attribute!.name) ?? null))?.[0]
      const knownMode = mode === undefined || definition.modes.includes(mode) ? mode : undefined
      if (mode !== undefined && knownMode === undefined && (state.options.dev ?? isDevelopmentMode())) {
        appendRuntimeDiagnostic(state, {
          code: 'VANITY_RUNTIME_UNKNOWN_MODE',
          message: `runtime control for axis '${axis}' read unknown mode '${mode}' at '${root.contract.path}'`,
          axis,
          mode,
          rootPath: root.contract.path,
        })
      }
      readings.push({
        root: targets.length === 1 ? root.contract.path : `${root.contract.path}[${index}]`,
        mode: knownMode,
      })
    }
  }
  if (readings.length === 0)
    return undefined
  const first = readings[0]!.mode
  if (readings.every(reading => reading.mode === first))
    return first
  if (state.options.dev ?? isDevelopmentMode()) {
    appendRuntimeDiagnostic(state, {
      code: 'VANITY_RUNTIME_MODE_DISAGREEMENT',
      message: `runtime axis '${axis}' disagrees across roots: ${readings.map(reading => `${reading.root}=${reading.mode ?? 'unknown'}`).join(', ')}`,
      axis,
    })
  }
  return undefined
}

function inspectRuntime(contract: VanityRuntimeContract, state: RuntimeState): VanityRuntimeInspection {
  const snapshot = getRuntimeSnapshot(contract, state)
  return Object.freeze({
    system: contract.system,
    root: contract.root,
    active: state.active,
    roots: Object.freeze([...state.roots.values()].map(root => Object.freeze({
      path: root.contract.path,
      selector: root.contract.selector,
      status: root.bound && !state.memory
        ? 'bound' as const
        : !root.resolved
            ? 'unresolved' as const
            : root.targets.length === 0
              ? 'missing' as const
              : root.targets.length === 1
                ? 'resolved' as const
                : 'ambiguous' as const,
      matches: root.targets.length,
      axes: root.contract.axes,
    }))),
    modes: snapshot.modes,
    overrides: Object.freeze(snapshot.overrides.flatMap((override) => {
      const token = getTokenByPath(contract, override.token)
      if (!token)
        return []
      const slot = getTokenSlot(token, override.address)
      if (!slot)
        return []
      const owner = state.roots.get(token.rootPath)
      const applied = owner?.targets.length === 1
        ? owner.targets[0]!.style.getPropertyValue?.(slot)
        : undefined
      return [Object.freeze({
        token: override.token,
        address: override.address,
        val: state.overrides.get(recordKey(override.token, override.address))!.value,
        name: token.name,
        slot: slot as `--${string}`,
        tokenRootPath: token.rootPath,
        tokenRoot: token.root,
        ...(applied === undefined ? {} : { applied }),
      })]
    })),
    diagnostics: Object.freeze([...state.diagnostics]),
  })
}

function createRuntimeTree(
  contract: VanityRuntimeContract,
  state: RuntimeState,
  schemas: RuntimeSchemaStore,
  emit: (mutation: RuntimeMutation) => void,
): object {
  const tree: Record<string, unknown> = {}
  for (const token of contract.tokens) {
    const axes: Record<string, Record<string, VanityHandleMeta['axes'] extends infer _ ? any : never>> = {}
    const cases: any[] = []
    for (const branch of token.branches) {
      const branchMeta = {
        ...(branch.value === undefined ? {} : { value: branch.value }),
        ...(token.mutable && branch.slot
          ? {
              runtime: createRuntimeMeta(contract, token, branch.address, branch.slot),
            }
          : {}),
      }
      if (branch.address.kind === 'axis') {
        if (!Object.hasOwn(axes, branch.address.axis))
          setOwn(axes, branch.address.axis, {})
        setOwn(axes[branch.address.axis]!, branch.address.mode, branchMeta)
      }
      else {
        cases.push({ when: branch.address.when, ...branchMeta })
      }
    }
    const handle = createHandle({
      name: token.name,
      path: token.token.join('.'),
      reference: token.reference,
      emit: token.emit,
      mutable: token.mutable,
      type: token.type,
      ...(token.value === undefined ? {} : { value: token.value }),
      ...(token.description === undefined ? {} : { description: token.description }),
      ...(token.deprecated === undefined ? {} : { deprecated: token.deprecated }),
      ...(token.metadata === undefined ? {} : { metadata: token.metadata }),
      ...(token.validation === undefined ? {} : { validate: token.validation }),
      ...(token.mutable && token.baseSlot
        ? {
            runtime: createRuntimeMeta(contract, token, { kind: 'base' }, token.baseSlot),
          }
        : {}),
      ...(Object.keys(axes).length === 0 ? {} : { axes }),
      ...(cases.length === 0 ? {} : { cases }),
    }, { serializeFallback: serializeRuntimeCssText })
    decorateMutableHandle(handle, contract, state, schemas, emit)
    for (const modes of Object.values(handle.$axes)) {
      for (const branch of Object.values(modes))
        decorateMutableBranch(branch, contract, state, schemas, emit)
    }
    for (const branch of token.branches) {
      if (branch.address.kind === 'case')
        decorateMutableBranch(handle.$case(branch.address.when), contract, state, schemas, emit)
    }
    setPath(tree, token.token, handle)
  }
  return freezeDeep(tree)
}

function decorateMutableHandle(
  handle: InternalTokenHandle,
  contract: VanityRuntimeContract,
  state: RuntimeState,
  schemas: RuntimeSchemaStore,
  emit: (mutation: RuntimeMutation) => void,
): void {
  const runtime = getRuntimeAddress(handle)
  if (!runtime)
    return
  defineAction(handle, '$set', (input: unknown) => emit(prepareOverride(contract, state, schemas, runtime, input)))
  defineAction(handle, '$unset', () => emit(prepareUnset(contract, state, runtime)))
}

function decorateMutableBranch(
  handle: InternalBranchHandle,
  contract: VanityRuntimeContract,
  state: RuntimeState,
  schemas: RuntimeSchemaStore,
  emit: (mutation: RuntimeMutation) => void,
): void {
  const runtime = getRuntimeAddress(handle)
  if (!runtime)
    return
  defineAction(handle, '$set', (input: unknown) => emit(prepareOverride(contract, state, schemas, runtime, input)))
  defineAction(handle, '$unset', () => emit(prepareUnset(contract, state, runtime)))
}

function prepareOverride(
  contract: VanityRuntimeContract,
  state: RuntimeState,
  schemas: RuntimeSchemaStore,
  runtime: VanityHandleRuntimeAddress,
  input: unknown,
): RuntimeMutation {
  assertActive(state)
  const token = getTokenByPath(contract, runtime.token)
  if (!token || !token.mutable) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_IMMUTABLE_TOKEN',
      message: `${runtime.token.join('.')} is not a mutable token in this runtime`,
      token: runtime.token,
      fix: 'set only a token declared with mutable: true',
    })
  }
  const slot = getTokenSlot(token, runtime.address)
  if (!slot) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_UNKNOWN_ADDRESS',
      message: `${formatAddress(runtime.token, runtime.address)} is not an authored runtime address`,
      token: runtime.token,
      address: runtime.address,
      fix: 'set the base or branch address emitted by this runtime contract',
    })
  }
  const accepted = resolveRuntimeValue(token, input, schemas, state.options, state.compareRange)
  if (accepted === undefined) {
    return {
      kind: 'unset',
      token,
      runtime,
    }
  }
  const override: RuntimeOverride = { token: token.token, address: runtime.address, val: accepted.input, value: accepted.value }
  return { kind: 'set', token, runtime, value: accepted.value, override }
}

function prepareUnset(
  contract: VanityRuntimeContract,
  state: RuntimeState,
  runtime: VanityHandleRuntimeAddress,
): RuntimeMutation {
  assertActive(state)
  const token = getTokenByPath(contract, runtime.token)
  if (!token || !token.mutable || !getTokenSlot(token, runtime.address)) {
    throwRuntimeDiagnostic({
      code: !token || !token.mutable ? 'VANITY_RUNTIME_IMMUTABLE_TOKEN' : 'VANITY_RUNTIME_UNKNOWN_ADDRESS',
      message: `${formatAddress(runtime.token, runtime.address)} is not an authored mutable runtime address`,
      token: runtime.token,
      address: runtime.address,
      fix: 'unset a base or branch address emitted for a mutable token by this runtime contract',
    })
  }
  return { kind: 'unset', token, runtime }
}

function applyMutations(state: RuntimeState, mutations: readonly RuntimeMutation[]): void {
  assertActive(state)
  const targets = new Map<RuntimeMutation, readonly VanityRuntimeTarget[]>()
  for (const mutation of mutations) {
    if (mutation.kind === 'set' || mutation.kind === 'unset') {
      const root = getRuntimeRoot(state, mutation.token.rootPath)
      targets.set(mutation, getTargetsForRoot(state, root, true))
    }
    else {
      const resolved = getRootsForAxis(state, mutation.axis)
        .flatMap(root => [...getTargetsForRoot(state, root, false)])
      targets.set(mutation, resolved)
    }
  }

  for (const mutation of mutations) {
    const resolved = targets.get(mutation)!
    if (mutation.kind === 'set') {
      writeStyle(resolved[0]!.style, mutation.runtime.slot, mutation.value)
      state.overrides.set(recordKey(mutation.token.token, mutation.runtime.address), mutation.override)
    }
    else if (mutation.kind === 'unset') {
      removeStyle(resolved[0]!.style, mutation.runtime.slot)
      state.overrides.delete(recordKey(mutation.token.token, mutation.runtime.address))
    }
    else {
      if (state.memory) {
        state.modes.set(mutation.axis, mutation.mode)
        continue
      }
      for (const target of resolved) {
        const definition = state.contract.axes[mutation.axis]!
        const control = definition.control && state.options.controls?.[definition.control.id]
        if (control) {
          control.activate(target, mutation.mode)
        }
        else if (mutation.name !== undefined && mutation.value === null) {
          removeAttribute(target, mutation.name)
        }
        else if (mutation.name !== undefined && typeof mutation.value === 'string') {
          writeAttribute(target, mutation.name, mutation.value)
        }
        else {
          throwRuntimeDiagnostic({
            code: 'VANITY_RUNTIME_UNSELECTABLE_AXIS',
            message: `runtime axis '${mutation.axis}' needs control '${definition.control?.id}' in runtime({ controls })`,
            axis: mutation.axis,
            mode: mutation.mode,
            fix: `provide controls: { ${definition.control?.id ?? 'axis'}: ... } when creating the runtime`,
          })
        }
      }
      state.modes.set(mutation.axis, mutation.mode)
    }
  }
}

function applyStateToRoot(state: RuntimeState, root: RuntimeRootState): void {
  const snapshot = getRuntimeSnapshot(state.contract, state)
  const props = projectProps(state.contract, { overrides: [...state.overrides.values()], modes: snapshot.modes })[root.contract.path]!
  const targets = getTargetsForRoot(state, root, Object.keys(props.style).length > 0)
  const [styleTarget] = targets
  if (styleTarget) {
    for (const [name, value] of Object.entries(props.style))
      writeStyle(styleTarget.style, name, value)
  }
  for (const [axis, mode] of Object.entries(snapshot.modes)) {
    if (!root.contract.axes.includes(axis))
      continue
    const definition = state.contract.axes[axis]!
    const control = definition.control && state.options.controls?.[definition.control.id]
    const value = definition.attribute?.values[mode]
    for (const target of targets) {
      if (control)
        control.activate(target, mode)
      else if (definition.attribute && value === null)
        removeAttribute(target, definition.attribute.name)
      else if (definition.attribute && typeof value === 'string')
        writeAttribute(target, definition.attribute.name, value)
    }
  }
}

function reconcileSnapshot(
  contract: VanityRuntimeContract,
  input: unknown,
  schemas: RuntimeSchemaStore,
  options: VanityRuntimeOptions,
  compareRange?: typeof getTokenRangeError,
): RuntimeReconciliation {
  const diagnostics: VanityRuntimeDiagnostic[] = []
  let source: VanityRuntimeSnapshot
  try {
    source = parseSnapshot(input)
  }
  catch (error) {
    if (!(error instanceof VanityRuntimeError))
      throw error
    diagnostics.push(error.diagnostic)
    const snapshot = createEmptySnapshot(contract)
    return { result: { snapshot, diagnostics: Object.freeze(diagnostics) }, projection: { overrides: [], modes: snapshot.modes } }
  }
  if (source.system !== contract.system) {
    diagnostics.push({
      code: 'VANITY_RUNTIME_SCHEMA_MISMATCH',
      message: `snapshot '${source.system}' differs from current runtime '${contract.system}'; reconciling semantic addresses`,
    })
  }

  const overrides = new Map<string, RuntimeOverride>()
  for (const entry of source.overrides) {
    if (!isSnapshotOverride(entry)) {
      diagnostics.push({ code: 'VANITY_RUNTIME_UNKNOWN_ADDRESS', message: 'skipped a malformed runtime override record' })
      continue
    }
    const token = getTokenByPath(contract, entry.token)
    if (!token) {
      diagnostics.push({
        code: 'VANITY_RUNTIME_UNKNOWN_TOKEN',
        message: `snapshot token '${entry.token.join('.')}' no longer exists`,
        token: entry.token,
        address: entry.address,
      })
      continue
    }
    if (!token.mutable) {
      diagnostics.push({
        code: 'VANITY_RUNTIME_IMMUTABLE_TOKEN',
        message: `snapshot token '${entry.token.join('.')}' is no longer mutable`,
        token: entry.token,
        address: entry.address,
      })
      continue
    }
    if (!getTokenSlot(token, entry.address)) {
      diagnostics.push({
        code: 'VANITY_RUNTIME_UNKNOWN_ADDRESS',
        message: `snapshot address '${formatAddress(entry.token, entry.address)}' is no longer authored`,
        token: entry.token,
        address: entry.address,
      })
      continue
    }
    let accepted: ReturnType<typeof resolveRuntimeValue>
    try {
      accepted = resolveRuntimeValue(token, entry.val, schemas, { ...options, dev: options.dev ?? false }, compareRange)
    }
    catch (error) {
      diagnostics.push({
        code: 'VANITY_RUNTIME_INVALID_VALUE',
        message: `${formatAddress(entry.token, entry.address)} was skipped: ${getErrorMessage(error)}`,
        token: entry.token,
        address: entry.address,
      })
      continue
    }
    if (accepted === undefined) {
      diagnostics.push({
        code: 'VANITY_RUNTIME_INVALID_VALUE',
        message: `${formatAddress(entry.token, entry.address)} was omitted by its validation policy`,
        token: entry.token,
        address: entry.address,
      })
      continue
    }
    const normalized = { token: token.token, address: normalizeAddress(entry.address, contract.axisOrder), val: accepted.input, value: accepted.value }
    overrides.set(recordKey(normalized.token, normalized.address), normalized)
  }

  const modes: Record<string, string> = {}
  for (const [axis, mode] of Object.entries(source.modes)) {
    const definition = Object.hasOwn(contract.axes, axis) ? contract.axes[axis] : undefined
    if (!definition || !definition.modes.includes(mode)) {
      diagnostics.push({
        code: 'VANITY_RUNTIME_UNKNOWN_MODE',
        message: `snapshot mode '${axis}.${mode}' no longer exists`,
        axis,
        mode,
      })
      continue
    }
    if ((!definition.attribute || !Object.hasOwn(definition.attribute.values, mode)) && !definition.control) {
      diagnostics.push({
        code: 'VANITY_RUNTIME_UNSELECTABLE_AXIS',
        message: `snapshot mode '${axis}.${mode}' has no runtime root attribute mapping`,
        axis,
        mode,
      })
      continue
    }
    setOwn(modes, axis, mode)
  }

  const snapshot: VanityRuntimeSnapshot = Object.freeze({
    version: VANITY_RUNTIME_SNAPSHOT_VERSION,
    system: contract.system,
    overrides: Object.freeze(sortOverrides([...overrides.values()].map(({ value: _value, ...entry }) => entry), contract.axisOrder)),
    modes: Object.freeze(sortRecord(modes, contract.axisOrder)),
  })
  return Object.freeze({
    result: Object.freeze({ snapshot, diagnostics: Object.freeze(diagnostics) }),
    projection: { overrides: sortOverrides([...overrides.values()], contract.axisOrder), modes: snapshot.modes },
  })
}

function parseSnapshot(input: unknown): VanityRuntimeSnapshot {
  if (!isPlainObject(input) || input.version !== VANITY_RUNTIME_SNAPSHOT_VERSION) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_SCHEMA_MISMATCH',
      message: `unsupported runtime snapshot version ${isPlainObject(input) ? String(input.version) : 'unreadable'}; expected version ${VANITY_RUNTIME_SNAPSHOT_VERSION}`,
      path: ['snapshot', 'version'],
      fix: `provide a runtime snapshot with version ${VANITY_RUNTIME_SNAPSHOT_VERSION}`,
    })
  }
  if (typeof input.system !== 'string' || !Array.isArray(input.overrides) || !isPlainObject(input.modes)) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_SCHEMA_MISMATCH',
      message: 'runtime snapshot v2 is unreadable: expected system, overrides, and modes fields',
      path: ['snapshot'],
      fix: 'provide system, overrides, and modes fields using the runtime snapshot protocol',
    })
  }
  for (const mode of Object.values(input.modes)) {
    if (typeof mode !== 'string') {
      throwRuntimeDiagnostic({
        code: 'VANITY_RUNTIME_SCHEMA_MISMATCH',
        message: 'runtime snapshot v2 modes must be strings',
        path: ['snapshot', 'modes'],
        fix: 'serialize each active axis mode as a string',
      })
    }
  }
  return input as unknown as VanityRuntimeSnapshot
}

function isSnapshotOverride(input: unknown): input is VanityRuntimeSnapshotOverride {
  return isPlainObject(input)
    && Array.isArray(input.token)
    && input.token.length > 0
    && input.token.every(part => typeof part === 'string' && part.length > 0)
    && isSemanticAddress(input.address)
    && ((typeof input.val === 'string' && input.val.trim().length > 0) || (typeof input.val === 'number' && Number.isFinite(input.val)))
}

function isSemanticAddress(input: unknown): input is VanitySemanticTokenAddress {
  if (!isPlainObject(input))
    return false
  if (input.kind === 'base')
    return true
  if (input.kind === 'axis')
    return typeof input.axis === 'string' && typeof input.mode === 'string'
  if (input.kind === 'case')
    return isPlainObject(input.when) && Object.values(input.when).every(value => typeof value === 'string')
  return false
}

function projectStyles(
  contract: VanityRuntimeContract,
  snapshot: RuntimeProjection,
): VanityRuntimeStyles {
  const styles = Object.fromEntries(contract.roots.map(root => [
    root.path,
    {} as Record<`--${string}`, string>,
  ])) as Record<string, Record<`--${string}`, string>>
  for (const entry of snapshot.overrides) {
    const token = getTokenByPath(contract, entry.token)
    const slot = token && getTokenSlot(token, entry.address)
    if (token && slot)
      styles[token.rootPath]![slot as `--${string}`] = entry.value
  }
  for (const [axis, mode] of Object.entries(snapshot.modes)) {
    const projected = contract.axes[axis]?.control?.projections?.[mode]?.style
    if (!projected)
      continue
    for (const root of contract.roots) {
      if (root.axes.includes(axis))
        Object.assign(styles[root.path]!, projected)
    }
  }
  return Object.freeze(Object.fromEntries(
    contract.roots.map(root => [root.path, Object.freeze(styles[root.path]!)]),
  ))
}

function projectAttributesForRoot(
  contract: VanityRuntimeContract,
  snapshot: RuntimeProjection,
  root: VanityRuntimeRootContract,
): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {}
  for (const [axis, mode] of Object.entries(snapshot.modes)) {
    if (!root.axes.includes(axis))
      continue
    const adapter = contract.axes[axis]?.attribute
    const value = adapter && Object.hasOwn(adapter.values, mode) ? adapter.values[mode] : undefined
    if (adapter && value !== undefined && value !== null)
      attributes[adapter.name] = value
    Object.assign(attributes, contract.axes[axis]?.control?.projections?.[mode]?.attributes)
  }
  return Object.freeze(attributes)
}

function projectProps(
  contract: VanityRuntimeContract,
  snapshot: RuntimeProjection,
): VanityRuntimeProps {
  const styles = projectStyles(contract, snapshot)
  return Object.freeze(Object.fromEntries(contract.roots.map(root => [
    root.path,
    Object.freeze({
      style: styles[root.path]!,
      attributes: projectAttributesForRoot(contract, snapshot, root),
    }),
  ])))
}

function restoreRuntimeState(contract: VanityRuntimeContract, state: RuntimeState, snapshot: RuntimeProjection): void {
  const props = projectProps(contract, snapshot)
  const targets = new Map<string, readonly VanityRuntimeTarget[]>()
  for (const root of contract.roots) {
    const rootProps = props[root.path]!
    const needsUniqueOwner = Object.keys(rootProps.style).length > 0
    targets.set(root.path, getTargetsForRoot(state, getRuntimeRoot(state, root.path), needsUniqueOwner))
  }

  for (const previous of state.overrides.values()) {
    const token = getTokenByPath(contract, previous.token)
    const slot = token && getTokenSlot(token, previous.address)
    if (token && slot && !snapshot.overrides.some(entry =>
      recordKey(entry.token, entry.address) === recordKey(previous.token, previous.address))) {
      const [target] = targets.get(token.rootPath) ?? []
      if (target)
        removeStyle(target.style, slot)
    }
  }

  for (const entry of snapshot.overrides) {
    const token = getTokenByPath(contract, entry.token)!
    const slot = getTokenSlot(token, entry.address)!
    writeStyle(targets.get(token.rootPath)![0]!.style, slot, entry.value)
  }
  for (const [axis] of state.modes) {
    if (Object.hasOwn(snapshot.modes, axis))
      continue
    const adapter = contract.axes[axis]?.attribute
    if (!adapter)
      continue
    for (const root of getRootsForAxis(state, axis)) {
      for (const target of targets.get(root.contract.path) ?? [])
        removeAttribute(target, adapter.name)
    }
  }
  for (const [axis, mode] of Object.entries(snapshot.modes)) {
    const definition = contract.axes[axis]!
    const adapter = definition.attribute
    const value = adapter?.values[mode]
    const control = definition.control && state.options.controls?.[definition.control.id]
    if (definition.control && !control) {
      throwRuntimeDiagnostic({
        code: 'VANITY_RUNTIME_UNSELECTABLE_AXIS',
        message: `runtime axis '${axis}' needs control '${definition.control.id}' in runtime({ controls })`,
        axis,
        mode,
        fix: `provide controls: { ${definition.control.id}: ... } when creating the runtime`,
      })
    }
    for (const root of getRootsForAxis(state, axis)) {
      for (const target of targets.get(root.contract.path) ?? []) {
        if (control)
          control.activate(target, mode)
        else if (adapter && value === null)
          removeAttribute(target, adapter.name)
        else if (adapter && value !== undefined)
          writeAttribute(target, adapter.name, value!)
      }
    }
  }
  state.overrides.clear()
  snapshot.overrides.forEach(entry =>
    state.overrides.set(recordKey(entry.token, entry.address), entry))
  state.modes.clear()
  Object.entries(snapshot.modes).forEach(([axis, mode]) => state.modes.set(axis, mode))
}

function getRuntimeSnapshot(contract: VanityRuntimeContract, state: RuntimeState): VanityRuntimeSnapshot {
  return Object.freeze({
    version: VANITY_RUNTIME_SNAPSHOT_VERSION,
    system: contract.system,
    overrides: Object.freeze(sortOverrides([...state.overrides.values()].map(({ value: _value, ...entry }) => entry), contract.axisOrder)),
    modes: Object.freeze(sortRecord(Object.fromEntries(state.modes), contract.axisOrder)),
  })
}

function createEmptySnapshot(contract: VanityRuntimeContract): VanityRuntimeSnapshot {
  return Object.freeze({ version: VANITY_RUNTIME_SNAPSHOT_VERSION, system: contract.system, overrides: Object.freeze([]), modes: Object.freeze({}) })
}

function createRuntimeMeta(
  contract: VanityRuntimeContract,
  token: VanityRuntimeTokenContract,
  address: VanitySemanticTokenAddress,
  slot: string,
): VanityHandleRuntimeAddress {
  return freezeDeep({ system: contract.system, token: token.token, address, slot })
}

function getTokenSlot(token: VanityRuntimeTokenContract, address: VanitySemanticTokenAddress): string | undefined {
  if (address.kind === 'base')
    return token.baseSlot
  return token.branches.find(branch => isSameTokenAddress(branch.address, address))?.slot
}

function isSameTokenAddress(left: VanitySemanticTokenAddress, right: VanitySemanticTokenAddress): boolean {
  if (left.kind !== right.kind)
    return false
  if (left.kind === 'base')
    return true
  if (left.kind === 'axis' && right.kind === 'axis')
    return left.axis === right.axis && left.mode === right.mode
  return left.kind === 'case' && right.kind === 'case'
    && serializeStableString(sortRecord(left.when)) === serializeStableString(sortRecord(right.when))
}

const tokenIndexes = new WeakMap<VanityRuntimeContract, ReadonlyMap<string, VanityRuntimeTokenContract>>()

function getTokenByPath(contract: VanityRuntimeContract, token: readonly string[]): VanityRuntimeTokenContract | undefined {
  let index = tokenIndexes.get(contract)
  if (index === undefined) {
    index = new Map(contract.tokens.map(entry => [entry.token.join('.'), entry]))
    tokenIndexes.set(contract, index)
  }
  return index.get(token.join('.'))
}

function recordKey(token: readonly string[], address: VanitySemanticTokenAddress): string {
  return `${token.join('.')}\0${getAddressKey(address)}`
}

function getAddressKey(address: VanitySemanticTokenAddress, axisOrder: readonly string[] = []): string {
  if (address.kind === 'base')
    return '0:base'
  if (address.kind === 'axis')
    return `1:axis:${address.axis}:${address.mode}`
  return `2:case:${Object.entries(sortRecord(address.when, axisOrder)).map(([axis, mode]) => `${axis}:${mode}`).join('|')}`
}

function normalizeAddress(address: VanitySemanticTokenAddress, axisOrder: readonly string[]): VanitySemanticTokenAddress {
  return address.kind === 'case'
    ? { kind: 'case', when: Object.freeze(sortRecord(address.when, axisOrder)) }
    : address
}

function sortOverrides<Entry extends VanityRuntimeSnapshotOverride>(entries: Entry[], axisOrder: readonly string[]): Entry[] {
  return entries.sort((left, right) => {
    const token = left.token.join('.').localeCompare(right.token.join('.'))
    return token || getAddressKey(left.address, axisOrder).localeCompare(getAddressKey(right.address, axisOrder))
  })
}

function sortRecord<T>(record: Readonly<Record<string, T>>, preferred: readonly string[] = []): Record<string, T> {
  const rank = new Map(preferred.map((key, index) => [key, index]))
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => {
    const a = rank.get(left) ?? Number.MAX_SAFE_INTEGER
    const b = rank.get(right) ?? Number.MAX_SAFE_INTEGER
    return a - b || left.localeCompare(right)
  }))
}

function formatAddress(token: readonly string[], address: VanitySemanticTokenAddress): string {
  if (address.kind === 'base')
    return token.join('.')
  if (address.kind === 'axis')
    return `${token.join('.')}.$axes.${address.axis}.${address.mode}`
  return `${token.join('.')}.$case(${JSON.stringify(address.when)})`
}

function getResolutionScope(options: VanityRuntimeOptions): object | undefined {
  if (options.within !== undefined) {
    if ((typeof options.within !== 'object' && typeof options.within !== 'function') || options.within === null) {
      throwRuntimeDiagnostic({
        code: 'VANITY_RUNTIME_INVALID_TARGET',
        message: 'runtime({ within }) needs a document, shadow root, element, or query adapter',
        path: ['within'],
        fix: 'pass a document, shadow root, element, or query adapter with the required lookup methods',
      })
    }
    return options.within
  }
  const document = (globalThis as { document?: object }).document
  return document
}

function getRuntimeRoot(state: RuntimeState, path: string): RuntimeRootState {
  const root = state.roots.get(path)
  if (!root) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_ROOT_NOT_FOUND',
      message: `runtime has no root '${path}'; expected '$system' or one of: ${[...state.roots.keys()].filter(key => key !== '$system').join(', ') || '(none)'}`,
      rootPath: path,
      fix: `use '$system' or one of the declared runtime roots`,
    })
  }
  return root
}

function getRootsForAxis(state: RuntimeState, axis: string): RuntimeRootState[] {
  return [...state.roots.values()].filter(root => root.contract.axes.includes(axis))
}

function getTargetsForRoot(
  state: RuntimeState,
  root: RuntimeRootState,
  unique: boolean,
): readonly VanityRuntimeTarget[] {
  resolveRuntimeRoot(state, root)
  if (!unique)
    return root.targets
  if (root.targets.length === 1)
    return root.targets
  const diagnostic: VanityRuntimeDiagnostic = root.targets.length === 0
    ? {
        code: 'VANITY_RUNTIME_ROOT_NOT_FOUND',
        message: `runtime root '${root.contract.path}' (${root.contract.selector}) was not found; mount it and call refreshRoots('${root.contract.path}') or bindRoot('${root.contract.path}', element)`,
        rootPath: root.contract.path,
      }
    : {
        code: 'VANITY_RUNTIME_AMBIGUOUS_ROOT',
        message: `runtime root '${root.contract.path}' (${root.contract.selector}) matched ${root.targets.length} elements; use runtime({ within }) or bindRoot('${root.contract.path}', element)`,
        rootPath: root.contract.path,
      }
  appendRuntimeDiagnostic(state, diagnostic)
  throw createVanityRuntimeError({
    ...diagnostic,
    fix: diagnostic.code === 'VANITY_RUNTIME_ROOT_NOT_FOUND'
      ? `mount the root and call refreshRoots('${root.contract.path}') or bindRoot('${root.contract.path}', element)`
      : 'narrow runtime({ within }) to one matching root or bind the intended root explicitly',
  })
}

function resolveRuntimeRoot(state: RuntimeState, root: RuntimeRootState, force = false): void {
  if (root.bound || (root.resolved && !force))
    return
  if (state.memory)
    return
  const scope = state.within ?? getResolutionScope(state.options)
  if (!scope) {
    root.targets = []
    root.resolved = true
    return
  }

  const matches: VanityRuntimeTarget[] = []
  const candidate = scope as Partial<VanityRuntimeTarget & VanityRuntimeQueryScope>
  if (typeof candidate.matches === 'function' && candidate.matches(root.contract.selector))
    matches.push(candidate as VanityRuntimeTarget)
  if (root.contract.selector === ':root' && candidate.documentElement !== undefined
    && isRuntimeTarget(candidate.documentElement)) {
    matches.push(candidate.documentElement)
  }
  if (typeof candidate.querySelectorAll === 'function') {
    const queried = candidate.querySelectorAll(root.contract.selector)
    for (const value of Array.from(queried as ArrayLike<unknown>)) {
      if (isRuntimeTarget(value) && !matches.includes(value))
        matches.push(value)
    }
  }
  else if (typeof candidate.querySelector === 'function') {
    const value = candidate.querySelector(root.contract.selector)
    if (isRuntimeTarget(value) && !matches.includes(value))
      matches.push(value)
  }
  root.targets = matches
  root.resolved = true
}

function assertRuntimeTarget(value: unknown): asserts value is VanityRuntimeTarget {
  if (!isRuntimeTarget(value)) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_INVALID_TARGET',
      message: 'bindRoot() needs one concrete HTML/SVG inline-style target; selector strings are not accepted',
      path: ['bindRoot', 'element'],
      fix: 'pass an element or adapter with style, setAttribute, and removeAttribute methods',
    })
  }
}

function isRuntimeTarget(value: unknown): value is VanityRuntimeTarget {
  return (typeof value === 'object' || typeof value === 'function') && value !== null
    && isStyleDeclaration((value as VanityRuntimeTarget).style)
    && typeof (value as VanityRuntimeTarget).setAttribute === 'function'
    && typeof (value as VanityRuntimeTarget).removeAttribute === 'function'
}

function appendRuntimeDiagnostic(state: RuntimeState, diagnostic: VanityRuntimeDiagnostic): void {
  if (!state.diagnostics.some(current =>
    current.code === diagnostic.code
    && current.message === diagnostic.message)) {
    state.diagnostics.push(Object.freeze(diagnostic))
  }
}

function writeStyle(style: VanityRuntimeStyleDeclaration, name: string, value: string): void {
  if (style.getPropertyValue?.(name) !== value)
    style.setProperty(name, value)
}

function removeStyle(style: VanityRuntimeStyleDeclaration, name: string): void {
  if (!style.getPropertyValue || style.getPropertyValue(name) !== '')
    style.removeProperty(name)
}

function writeAttribute(target: VanityRuntimeTarget, name: string, value: string): void {
  if (target.getAttribute?.(name) !== value)
    target.setAttribute(name, value)
}

function removeAttribute(target: VanityRuntimeTarget, name: string): void {
  if (!target.getAttribute || target.getAttribute(name) !== null)
    target.removeAttribute(name)
}

function assertActive(state: RuntimeState): void {
  if (!state.active) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_INVALID_TARGET',
      message: 'this runtime binding was superseded on the same root; use the current ds.runtime() instance after HMR/rebind',
      path: ['runtime'],
      fix: 'create or use the current ds.runtime() instance for this root',
    })
  }
}

function getRuntimeStyleDeclaration(target: VanityCustomPropertyTarget): VanityRuntimeStyleDeclaration {
  if (isStyleDeclaration(target))
    return target
  if ((typeof target === 'object' || typeof target === 'function') && target !== null
    && 'style' in target && isStyleDeclaration(target.style)) {
    return target.style
  }
  throwRuntimeDiagnostic({
    code: 'VANITY_RUNTIME_INVALID_TARGET',
    message: 'custom-property writes need an explicit element or CSSStyleDeclaration-like target',
    path: ['target'],
    fix: 'pass a style declaration or an element/adapter with a style declaration',
  })
}

function isStyleDeclaration(value: unknown): value is VanityRuntimeStyleDeclaration {
  return (typeof value === 'object' || typeof value === 'function') && value !== null
    && typeof (value as VanityRuntimeStyleDeclaration).setProperty === 'function'
    && typeof (value as VanityRuntimeStyleDeclaration).removeProperty === 'function'
}

function getRuntimeCustomPropertyName(property: VanityCustomPropertyReference): `--${string}` {
  const name = typeof property === 'string' ? property : '$name' in property ? property.$name : property.name
  if (!/^--(?:[-_a-z\u0080-\uFFFF]|\\.)[-\w\u0080-\uFFFF\\.]*$/i.test(name)) {
    throwRuntimeDiagnostic({
      code: 'VANITY_RUNTIME_INVALID_VALUE',
      message: `'${name}' is not a valid CSS custom-property name`,
      path: ['property'],
      fix: 'use a CSS custom-property name beginning with --',
    })
  }
  return name
}

function mergeSchemas(
  embedded: RuntimeSchemaStore,
  supplied: Readonly<Record<string, VanityStandardSchemaV1>> | undefined,
): RuntimeSchemaStore {
  return supplied === undefined ? embedded : { ...embedded, ...supplied }
}

function setPath(tree: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let target = tree
  for (let index = 0; index < path.length; index++) {
    const key = path[index]!
    if (index === path.length - 1) {
      target[key] = value
    }
    else {
      if (!isPlainObject(target[key]))
        target[key] = {}
      target = target[key] as Record<string, unknown>
    }
  }
}

function throwRuntimeDiagnostic(diagnostic: VanityRuntimeDiagnostic): never {
  throw createVanityRuntimeError(diagnostic)
}

function defineAction(target: object, name: string, value: (...args: any[]) => unknown): void {
  Object.defineProperty(target, name, { enumerable: true, configurable: true, value })
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (typeof value !== 'object' || value === null)
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function serializeStableString(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(serializeStableString).join(',')}]`
  if (isPlainObject(value))
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${serializeStableString(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function freezeDeep<T>(value: T): T {
  if ((Array.isArray(value) || isPlainObject(value)) && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as object))
      freezeDeep(child)
  }
  return value
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
