/** System-defined environmental axes and their root-anchored condition IR. */

import type { VanityCondition, VanityConditionArm, VanityConditionInput } from './conditions'
import { checkQuery, checkSelector } from '../css/validation'
import { VanityError } from '../diagnostics'
import { convertToKebab } from '../tokens/names'
import { getSchemeConditionArms } from './conditions'

/** Smallest DOM or query scope at which an axis condition can be selected. */
export type VanityAxisLocality = 'element' | 'root' | 'subtree' | 'document' | 'absolute'
/** Mechanism used to select an axis mode in emitted CSS or at runtime. */
export type VanityAxisMechanism = 'selector' | 'media' | 'supports' | 'container' | 'scope' | 'native'

export interface VanityAxisTriggerArm extends VanityConditionArm {
  /** CSS/runtime mechanism that selects this mode. */
  readonly mechanism: Exclude<VanityAxisMechanism, 'native'>
  /** Smallest scope at which this arm is meaningful. */
  readonly locality: Exclude<VanityAxisLocality, 'element'>
  /** Deterministic tie-break priority for overlapping arms. */
  readonly priority: number
  /** Output placement used for the generated condition. */
  readonly placement: 'root' | 'ancestor' | 'descendant' | 'absolute' | 'query'
  /** Mark an arm that degrades from its preferred condition mechanism. */
  readonly degraded?: true
  /** Query-free DOM mutation that selects this mode on a bound runtime root. */
  readonly runtime?: {
    readonly kind: 'attribute'
    readonly name: string
    readonly value: string | null
  }
}

export const VANITY_AXIS_TRIGGER = Symbol.for('vanity.axisTrigger')
export const VANITY_RUNTIME_ACTIVATABLE = Symbol.for('vanity.runtimeActivatable')

export interface VanityAxisTrigger<Activatable extends boolean = false> {
  readonly [VANITY_AXIS_TRIGGER]: true
  /** Type-only/runtime metadata: this trigger can be pinned without parsing selectors. */
  readonly [VANITY_RUNTIME_ACTIVATABLE]: Activatable
  /** Condition arms that select this axis mode. */
  readonly arms: readonly VanityAxisTriggerArm[]
}

export const VANITY_DEFAULT_MODE = Symbol.for('vanity.defaultAxisMode')

export interface VanityDefaultAxisMode<Activatable extends boolean = true> extends VanityAxisTrigger<Activatable> {
  readonly [VANITY_DEFAULT_MODE]: true
}

export type VanityAxisModeInput = VanityAxisTrigger<boolean> | VanityDefaultAxisMode<boolean>

/** Minimal root adapter supplied to a custom axis control. */
export interface VanityAxisControlRoot {
  /** Set the control attribute for a selected mode. */
  readonly setAttribute: (name: string, value: string) => void
  /** Remove the control attribute when selecting a triggerless mode. */
  readonly removeAttribute: (name: string) => void
  /** Read the current control attribute when available. */
  readonly getAttribute?: (name: string) => string | null
}

/** Query-free controller for an axis whose mode must be activated imperatively. */
export interface VanityAxisControl<Mode extends string = string> {
  /** Stable id carried by portable runtime metadata and bound in app/SSR code. */
  readonly id: string
  /** Read the currently selected mode from a bound root. */
  readonly read: (root: VanityAxisControlRoot) => Mode | undefined
  /** Activate one mode on a bound root. */
  readonly activate: (root: VanityAxisControlRoot, mode: Mode) => void
  /** Optional data-only SSR projection for the effects of `activate`. */
  readonly project?: (mode: Mode) => {
    readonly style?: Readonly<Record<`--${string}`, string>>
    readonly attributes?: Readonly<Record<string, string>>
  }
}

/** Native `light-dark()` policy and fallback behavior for a scheme axis. */
export interface VanityNativeSchemePolicy {
  /** Discriminator identifying this as a scheme policy. */
  readonly kind: 'scheme'
  /** Element-local preserves nested used `color-scheme`; root computes once at the token root. */
  readonly locality: 'element' | 'root'
  /** Explicit acknowledgement when an element-local target lacks native `light-dark()`. */
  readonly fallback: 'diagnose' | 'document'
  /** Light scheme name exposed to the browser. */
  readonly light: string
  /** Dark scheme name exposed to the browser. */
  readonly dark: string
}

/** Configure normalized modes, precedence, derivations, and runtime behavior for an axis. */
export interface VanityAxisConfig<
  Modes extends Readonly<Record<string, VanityAxisModeInput>>,
  Derive extends Partial<Record<keyof Modes & string, (
    modes: Readonly<Record<keyof Modes & string, any>>,
  ) => unknown>> = Record<never, never>,
  Control extends VanityAxisControl<keyof Modes & string> | undefined = undefined,
> {
  /** Named modes and their condition arms. */
  readonly modes: Modes
  /** The base relationship; `defaultMode()` is equivalent and may carry a trigger. */
  readonly default?: keyof Modes & string
  /** Tie-breaker for overlapping mode arms; must list every mode exactly once. */
  readonly modeOrder?: readonly (keyof Modes & string)[]
  /** Missing mode values may be derived from authored sibling values at token-finalization time. */
  readonly derive?: Derive
  /** Query-free runtime behavior when condition metadata cannot activate the axis. */
  /** Register a query-free control for this axis. */
  readonly control?: Control
  /** Preserve native `light-dark()` behavior and its fallback policy. */
  readonly native?: VanityNativeSchemePolicy
  /** Human-readable axis description. */
  readonly description?: string
}

/** Configure an axis before its condition inputs are normalized into triggers. */
export interface VanityOpenAxisConfig<
  Modes extends Readonly<Record<string, VanityConditionInput | VanityAxisTrigger>>,
  Control extends VanityAxisControl<keyof Modes & string> | undefined = undefined,
> {
  /** Named mode inputs for the axis. */
  readonly modes: Modes
  /** Mode selected when no more specific arm applies. */
  readonly default?: keyof Modes & string
  /** Explicit precedence order for overlapping mode arms. */
  readonly modeOrder?: readonly (keyof Modes & string)[]
  /** Human-readable axis description. */
  readonly description?: string
  /** Query-free runtime controller for this axis. */
  readonly control?: Control
}

export type VanityOpenAxisModes<Modes extends Readonly<Record<string, unknown>>> = {
  readonly [Mode in keyof Modes & string]: Modes[Mode] extends VanityAxisTrigger<infer Activatable>
    ? VanityAxisTrigger<Activatable>
    : Modes[Mode] extends VanityCondition<infer Compiled, infer Activatable>
      ? VanityAxisTrigger<Compiled extends '&' | 'systemRoot' | 'moduleRoot' ? true : Activatable>
      : Modes[Mode] extends '&' ? VanityAxisTrigger<true> : VanityAxisTrigger<false>
}

export const VANITY_AXIS_DEFINITION = Symbol.for('vanity.axisDefinition')

export interface VanityAxisDefinition<
  Modes extends Readonly<Record<string, VanityAxisModeInput>> = Readonly<Record<string, VanityAxisModeInput>>,
  Derive extends Partial<Record<keyof Modes & string, (
    modes: Readonly<Record<keyof Modes & string, any>>,
  ) => unknown>> = Record<never, never>,
> {
  readonly [VANITY_AXIS_DEFINITION]: true
  /** Normalized mode definitions. */
  readonly modes: Modes
  /** Selected default mode. */
  readonly defaultMode?: keyof Modes & string
  /** Deterministic mode precedence. */
  readonly modeOrder: readonly (keyof Modes & string)[]
  /** Value derivations for missing mode values. */
  readonly derive: Readonly<Derive>
  /** Query-free runtime controller, when one is configured. */
  readonly control?: VanityAxisControl<any>
  /** Native scheme metadata, when this is a scheme axis. */
  readonly native?: VanityNativeSchemePolicy
  /** Human-readable axis description. */
  readonly description?: string
}

export type VanityAxisDefinitions = Readonly<Record<string, VanityAxisDefinition<any, any>>>
export type VanityAxisName<Axes extends VanityAxisDefinitions> = keyof Axes & string
export type VanityAxisModeName<Axis> = Axis extends { readonly modes: infer Modes } ? keyof Modes & string : never

/** Ordered normalized axis definitions used by token resolution and runtime metadata. */
export interface VanityAxisRegistry<Axes extends VanityAxisDefinitions = VanityAxisDefinitions> {
  /** Axis definitions keyed by their public names. */
  readonly definitions: Axes
  /** Deterministic axis order used for generated output. */
  readonly order: readonly VanityAxisName<Axes>[]
}

/** Stable, JSON-safe environmental contract projected into inspection manifests. */
export interface VanityAxisRegistryDescription {
  readonly order: readonly string[]
  readonly definitions: Readonly<Record<string, {
    readonly defaultMode?: string
    readonly modeOrder: readonly string[]
    readonly description?: string
    readonly control?: { readonly id: string }
    readonly native?: VanityNativeSchemePolicy
    readonly modes: Readonly<Record<string, {
      readonly derived: boolean
      readonly arms: readonly {
        readonly when: string
        readonly mechanism: Exclude<VanityAxisMechanism, 'native'>
        readonly locality: Exclude<VanityAxisLocality, 'element'>
        readonly placement: VanityAxisTriggerArm['placement']
        readonly priority: number
        readonly scopes?: readonly string[]
        readonly degraded?: true
        readonly runtime?: VanityAxisTriggerArm['runtime']
      }[]
    }>>
  }>>
}

/** Placement and precedence options for a condition-backed axis mode. */
export interface VanityAxisConditionOptions {
  /** Place the condition relative to the axis root. */
  readonly on?: 'root' | 'ancestor' | 'descendant'
  /** Deterministic precedence when condition arms overlap. */
  readonly priority?: number
}

/** Precedence option for an absolute axis condition. */
export interface VanityAbsoluteAxisConditionOptions {
  /** Deterministic precedence when absolute arms overlap. */
  readonly priority?: number
}

/** Configure the locality, fallback, and description of a scheme axis. */
export interface VanitySchemeAxisOptions {
  /** Apply native scheme changes to each element or the token root. */
  readonly locality?: 'element' | 'root'
  /** Choose whether a missing native capability is diagnosed or documented. */
  readonly fallback?: 'diagnose' | 'document'
  /** Human-readable explanation shown in introspection. */
  readonly description?: string
}

export interface VanityAxisAuthoringHelpers {
  readonly axis: <
    const Modes extends Readonly<Record<string, VanityAxisModeInput>>,
    const Derive extends Partial<Record<keyof Modes & string, (
      modes: Readonly<Record<keyof Modes & string, any>>,
    ) => unknown>> = Record<never, never>,
    const Control extends VanityAxisControl<keyof Modes & string> | undefined = undefined,
  >(
    config: VanityAxisConfig<Modes, Derive, Control> & {
      readonly derive?: Derive & Partial<Record<keyof Modes & string, (
        modes: Readonly<Record<keyof Modes & string, any>>,
      ) => unknown>>
    },
  ) => VanityAxisDefinition<Modes, Derive>
    & (Control extends VanityAxisControl<any> ? { readonly control: Control } : object)
  readonly defaultMode: {
    (): VanityDefaultAxisMode<true>
    <Trigger extends VanityConditionInput | VanityAxisTrigger<boolean>>(
      trigger: Trigger,
    ): VanityDefaultAxisMode<Trigger extends VanityAxisTrigger<infer Activatable> ? Activatable : false>
  }
  readonly condition: (
    input: VanityConditionInput,
    options?: VanityAxisConditionOptions,
  ) => VanityAxisTrigger
  readonly absoluteCondition: (
    selector: string,
    options?: VanityAbsoluteAxisConditionOptions,
  ) => VanityAxisTrigger
  readonly data: <const Options extends VanityAxisConditionOptions | undefined = undefined>(
    attribute: string,
    value?: string,
    options?: Options,
  ) => VanityAxisTrigger<Options extends { readonly on: 'ancestor' | 'descendant' } ? false : true>
  readonly schemeIs: (mode: 'light' | 'dark') => VanityAxisTrigger<true>
  readonly scheme: (options?: VanitySchemeAxisOptions) => VanityAxisDefinition<{
    readonly light: VanityAxisTrigger<true>
    readonly dark: VanityAxisTrigger<true>
  }>
}

type TupleDuplicates<Values extends readonly string[], Seen extends string = never>
  = Values extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
    ? Head extends Seen ? Head | TupleDuplicates<Tail, Seen> : TupleDuplicates<Tail, Seen | Head>
    : never

export type VanityAxisOrderGuard<
  Axes extends VanityAxisDefinitions,
  Order extends readonly VanityAxisName<Axes>[],
> = Exclude<VanityAxisName<Axes>, Order[number]> extends never
  ? TupleDuplicates<Order> extends never ? Order : never
  : never

export type VanityAxisOrderRestGuard<
  Axes extends VanityAxisDefinitions,
  First extends VanityAxisName<Axes>,
  Rest extends readonly VanityAxisName<Axes>[],
> = VanityAxisOrderGuard<Axes, readonly [First, ...Rest]> extends never ? never : Rest

export const EMPTY_AXIS_REGISTRY: VanityAxisRegistry<Record<never, never>> = Object.freeze({
  definitions: Object.freeze({}),
  order: Object.freeze([]),
})

export function defineAxis<
  const Modes extends Readonly<Record<string, VanityAxisModeInput>>,
  const Derive extends Partial<Record<keyof Modes & string, (
    modes: Readonly<Record<keyof Modes & string, any>>,
  ) => unknown>> = Record<never, never>,
  const Control extends VanityAxisControl<keyof Modes & string> | undefined = undefined,
>(
  config: VanityAxisConfig<Modes, Derive, Control> & {
    readonly derive?: Derive & Partial<Record<keyof Modes & string, (
      modes: Readonly<Record<keyof Modes & string, any>>,
    ) => unknown>>
  },
): VanityAxisDefinition<Modes, Derive>
  & (Control extends VanityAxisControl<any> ? { readonly control: Control } : object) {
  if (!isPlainObject(config) || !isPlainObject(config.modes)) {
    throwAxisError(
      'axis() needs a plain modes object',
      'axis.modes',
      'pass modes as an object whose values are condition() or defaultMode() helpers',
    )
  }

  const names = Object.keys(config.modes)
  if (names.length === 0) {
    throwAxisError(
      'an axis needs at least one mode',
      'axis.modes',
      'declare at least one named mode in the modes object',
    )
  }

  let markedDefault: string | undefined
  const modes: Record<string, VanityAxisModeInput> = {}
  for (const [name, mode] of Object.entries(config.modes)) {
    if (!isAxisTrigger(mode)) {
      throwAxisError(
        `axis mode '${name}' needs a condition helper or defaultMode()`,
        ['axis', 'modes', name],
        'use a condition helper or defaultMode() for this mode',
      )
    }
    if (Object.hasOwn(mode, VANITY_DEFAULT_MODE)) {
      if (markedDefault !== undefined) {
        throwAxisError(
          `axis modes '${markedDefault}' and '${name}' are both marked as the default`,
          ['axis', 'modes', name],
          `keep only one defaultMode(); remove it from '${name}' or '${markedDefault}'`,
        )
      }
      markedDefault = name
    }
    modes[name] = mode
  }

  const configuredDefault = config.default
  if (configuredDefault !== undefined && !names.includes(configuredDefault)) {
    throwAxisError(
      `axis default '${configuredDefault}' is not one of: ${names.join(', ')}`,
      'axis.default',
      `set default to one of the declared modes: ${names.join(', ')}`,
    )
  }
  if (configuredDefault !== undefined && markedDefault !== undefined && configuredDefault !== markedDefault) {
    throwAxisError(
      `axis default '${configuredDefault}' conflicts with defaultMode() on '${markedDefault}'`,
      'axis.default',
      `make default and defaultMode() select the same mode, '${markedDefault}'`,
    )
  }

  const modeOrder = config.modeOrder === undefined ? names : [...config.modeOrder]
  assertExactOrder('axis modeOrder', names, modeOrder)

  const armOwners = new Map<string, string>()
  for (const mode of names) {
    for (const arm of modes[mode]!.arms) {
      const address = JSON.stringify({
        media: arm.media,
        supports: arm.supports,
        container: arm.container,
        selector: arm.selector,
        scopes: arm.scopes,
        priority: arm.priority,
      })
      const owner = armOwners.get(address)
      if (owner !== undefined) {
        throwAxisError(
          `axis modes '${owner}' and '${mode}' declare the same trigger at the same priority`,
          ['axis', 'modes', mode],
          'use distinct conditions or an explicit priority to make overlap intentional',
        )
      }
      armOwners.set(address, mode)
    }
  }

  for (const mode of Object.keys(config.derive ?? {})) {
    if (!names.includes(mode)) {
      throwAxisError(
        `axis derives unknown mode '${mode}'`,
        ['axis', 'derive', mode],
        `remove the derivation or add '${mode}' to modes`,
      )
    }
    if (typeof config.derive![mode] !== 'function') {
      throwAxisError(
        `axis derivation for '${mode}' must be a function`,
        ['axis', 'derive', mode],
        'provide a callback that derives the mode value',
      )
    }
  }

  if (config.native?.kind === 'scheme') {
    if (!names.includes(config.native.light) || !names.includes(config.native.dark)) {
      throwAxisError(
        'native scheme modes must exist in the axis',
        'axis.native',
        'declare both native.light and native.dark in modes',
      )
    }
  }

  return Object.freeze({
    [VANITY_AXIS_DEFINITION]: true as const,
    modes: Object.freeze(modes) as Modes,
    ...((configuredDefault ?? markedDefault) === undefined ? {} : { defaultMode: configuredDefault ?? markedDefault }),
    modeOrder: Object.freeze(modeOrder) as readonly (keyof Modes & string)[],
    derive: Object.freeze({ ...(config.derive ?? {}) }),
    ...(config.control === undefined ? {} : { control: config.control }),
    ...(config.native === undefined ? {} : { native: Object.freeze({ ...config.native }) }),
    ...(config.description === undefined ? {} : { description: config.description }),
  }) as unknown as VanityAxisDefinition<Modes, Derive>
  & (Control extends VanityAxisControl<any> ? { readonly control: Control } : object)
}

/** Standalone axis-definition constructor for already-normalized mode triggers. */
export const axis = defineAxis

export function defaultMode(): VanityDefaultAxisMode<true>
export function defaultMode<Trigger extends VanityConditionInput | VanityAxisTrigger<boolean>>(
  trigger: Trigger,
): VanityDefaultAxisMode<Trigger extends VanityAxisTrigger<infer Activatable> ? Activatable : false>
export function defaultMode(trigger?: VanityConditionInput | VanityAxisTrigger<boolean>): VanityDefaultAxisMode<boolean> {
  const normalized = trigger === undefined
    ? createTrigger([], true)
    : isAxisTrigger(trigger) ? trigger : createAxisCondition(trigger)
  return Object.freeze({
    [VANITY_AXIS_TRIGGER]: true as const,
    [VANITY_RUNTIME_ACTIVATABLE]: normalized[VANITY_RUNTIME_ACTIVATABLE],
    [VANITY_DEFAULT_MODE]: true as const,
    arms: normalized.arms,
  })
}

export function createAxisCondition(
  input: VanityConditionInput,
  options: VanityAxisConditionOptions = {},
): VanityAxisTrigger {
  const condition = typeof input === 'string' ? parseCondition(input) : input
  const priority = normalizePriority(options.priority)
  return createTrigger(condition.arms.map((arm) => {
    const query = queryMechanism(arm)
    if (query) {
      return Object.freeze({
        ...arm,
        mechanism: query,
        locality: query === 'scope' ? 'subtree' as const : 'document' as const,
        priority,
        placement: 'query' as const,
      })
    }

    const inferredPlacement = inferPlacement(arm.selector!)
    if (options.on !== undefined && arm.selector!.includes('&') && options.on !== inferredPlacement) {
      throwAxisError(
        `axis condition '${arm.selector}' is anchored as '${inferredPlacement}' but declares on: '${options.on}'`,
        'axis.condition.on',
        `remove on or set it to '${inferredPlacement}'`,
      )
    }
    const placement = options.on ?? inferredPlacement
    const selector = placeSelector(arm.selector!, placement)
    const locality = placement === 'descendant' ? 'subtree' : 'root'
    return Object.freeze({
      ...arm,
      selector,
      mechanism: 'selector' as const,
      locality,
      priority,
      placement,
    })
  }))
}

export function createAbsoluteAxisCondition(
  selector: string,
  options: VanityAbsoluteAxisConditionOptions = {},
): VanityAxisTrigger {
  if (selector.includes('&') || checkSelector(selector)) {
    throwAxisError(
      `createAbsoluteAxisCondition('${selector}') needs a valid absolute selector without '&'`,
      'axis.condition.selector',
      'pass a valid absolute selector without \'&\'',
    )
  }
  return createTrigger([Object.freeze({
    selector,
    mechanism: 'selector' as const,
    locality: 'absolute' as const,
    priority: normalizePriority(options.priority),
    placement: 'absolute' as const,
  })])
}

export function createAxisData<const Options extends VanityAxisConditionOptions | undefined = undefined>(
  attribute: string,
  value?: string,
  options?: Options,
): VanityAxisTrigger<Options extends { readonly on: 'ancestor' | 'descendant' } ? false : true>
export function createAxisData(
  attribute: string,
  value?: string,
  options: VanityAxisConditionOptions = {},
): VanityAxisTrigger<boolean> {
  const name = `data-${convertToKebab(attribute)}`
  const selector = value === undefined ? `[${name}]` : `[${name}='${value}']`
  const on = options.on ?? 'root'
  const trigger = createAxisCondition(selector, { ...options, on })
  if (on !== 'root')
    return trigger
  return createTrigger(trigger.arms.map(arm => Object.freeze({
    ...arm,
    runtime: Object.freeze({ kind: 'attribute' as const, name, value: value ?? '' }),
  })), true)
}

function createAxisSchemeTrigger(mode: 'light' | 'dark'): VanityAxisTrigger<true> {
  const [explicit, preferred] = getSchemeConditionArms(mode)

  return createTrigger([
    Object.freeze({
      ...preferred,
      mechanism: 'media' as const,
      locality: 'document' as const,
      priority: 0,
      placement: 'query' as const,
    }),
    Object.freeze({
      ...explicit,
      mechanism: 'selector' as const,
      locality: 'root' as const,
      priority: 100,
      placement: 'root' as const,
      runtime: Object.freeze({ kind: 'attribute' as const, name: 'data-scheme', value: mode }),
    }),
  ], true)
}

function createSchemeAxis(options: VanitySchemeAxisOptions = {}): VanityAxisDefinition<{
  readonly light: VanityAxisTrigger<true>
  readonly dark: VanityAxisTrigger<true>
}> {
  const locality = options.locality ?? 'element'
  return defineAxis({
    modes: { light: createAxisSchemeTrigger('light'), dark: createAxisSchemeTrigger('dark') },
    default: 'light',
    modeOrder: ['light', 'dark'],
    native: {
      kind: 'scheme',
      locality,
      fallback: options.fallback ?? 'diagnose',
      light: 'light',
      dark: 'dark',
    },
    ...(options.description === undefined ? {} : { description: options.description }),
  })
}

/** Explicit guarded color-scheme axis; no behavior is inferred from its mount name. */
export const colorSchemes = createSchemeAxis

/** Normalize the direct public `addAxis(name, config)` form against its mount identity. */
export function defineOpenAxis<
  const Name extends string,
  const Modes extends Readonly<Record<string, VanityConditionInput | VanityAxisTrigger>>,
  const Control extends VanityAxisControl<keyof Modes & string> | undefined = undefined,
>(
  name: Name,
  config: VanityOpenAxisConfig<Modes, Control>,
): VanityAxisDefinition<VanityOpenAxisModes<Modes>>
  & (Control extends VanityAxisControl<any> ? { readonly control: Control } : object) {
  if (name.startsWith('$')) {
    throwAxisError(
      `axis name '${name}' cannot begin with '$'`,
      ['axes', name],
      'choose an axis name that does not begin with \'$\'',
    )
  }
  const modes = Object.fromEntries(Object.entries(config.modes).map(([mode, input]) => {
    if (mode.startsWith('$')) {
      throwAxisError(
        `axis mode '${mode}' cannot begin with '$'`,
        ['axes', name, 'modes', mode],
        'choose a mode name that does not begin with \'$\'',
      )
    }
    return [mode, isAxisTrigger(input)
      ? input
      : triggerForOpenCondition(name, mode, typeof input === 'string' ? { arms: [{ selector: input }] } : input)]
  }))
  return defineAxis({
    modes,
    ...(config.default === undefined ? {} : { default: config.default }),
    ...(config.modeOrder === undefined ? {} : { modeOrder: config.modeOrder }),
    ...(config.description === undefined ? {} : { description: config.description }),
    ...(config.control === undefined ? {} : { control: config.control }),
  }) as VanityAxisDefinition<VanityOpenAxisModes<Modes>>
  & (Control extends VanityAxisControl<any> ? { readonly control: Control } : object)
}

export function normalizeAxisAdditions<const Axes extends VanityAxisDefinitions>(
  existing: VanityAxisRegistry<any>,
  additions: Axes,
): VanityAxisRegistry<VanityAxisDefinitions & Axes> {
  if (!isPlainObject(additions)) {
    throwAxisError(
      'axes() callback must return a plain axis record',
      'axes',
      'return an object keyed by axis name',
    )
  }

  const merged: Record<string, VanityAxisDefinition> = { ...existing.definitions }
  const order = [...existing.order]
  for (const [name, definition] of Object.entries(additions)) {
    if (isIntegerIndex(name)) {
      throwAxisError(
        `axis name '${name}' is integer-like`,
        ['axes', name],
        'use a semantic non-integer name so declaration order stays stable',
      )
    }
    if (Object.hasOwn(merged, name)) {
      throwAxisError(
        `axis '${name}' is already defined on this system`,
        ['axes', name],
        'use augmentAxis() or overwriteAxis() for an existing axis',
      )
    }
    if (!isAxisDefinition(definition)) {
      throwAxisError(
        `axis '${name}' must be created with axis() or scheme()`,
        ['axes', name],
        'create the axis definition with axis() or colorSchemes()',
      )
    }
    merged[name] = definition
    order.push(name)
  }

  return Object.freeze({
    definitions: Object.freeze(merged),
    order: Object.freeze(order),
  }) as VanityAxisRegistry<VanityAxisDefinitions & Axes>
}

export function reorderAxes<Axes extends VanityAxisDefinitions>(
  registry: VanityAxisRegistry<Axes>,
  order: readonly VanityAxisName<Axes>[],
): VanityAxisRegistry<Axes> {
  assertExactOrder('axisOrder()', registry.order, order)
  return Object.freeze({ definitions: registry.definitions, order: Object.freeze([...order]) })
}

export function describeAxisRegistry(registry: VanityAxisRegistry<any>): VanityAxisRegistryDescription {
  return {
    order: [...registry.order],
    definitions: Object.fromEntries(registry.order.map((axis) => {
      const definition = registry.definitions[axis]!
      return [axis, {
        ...(definition.defaultMode === undefined ? {} : { defaultMode: definition.defaultMode }),
        modeOrder: [...definition.modeOrder],
        ...(definition.description === undefined ? {} : { description: definition.description }),
        ...(definition.control === undefined ? {} : { control: { id: definition.control.id } }),
        ...(definition.native === undefined ? {} : { native: { ...definition.native } }),
        modes: Object.fromEntries(definition.modeOrder.map((mode: string) => [mode, {
          derived: Object.hasOwn(definition.derive, mode),
          arms: definition.modes[mode]!.arms.map((arm: VanityAxisTriggerArm) => ({
            when: describeArm(arm),
            mechanism: arm.mechanism,
            locality: arm.locality,
            placement: arm.placement,
            priority: arm.priority,
            ...(arm.scopes === undefined ? {} : { scopes: arm.scopes }),
            ...(arm.degraded === undefined ? {} : { degraded: true as const }),
            ...(arm.runtime === undefined ? {} : { runtime: arm.runtime }),
          })),
        }])),
      }]
    })),
  }
}

function describeArm(arm: VanityAxisTriggerArm): string {
  return [
    arm.anchor === undefined ? undefined : `@${arm.anchor}`,
    ...(arm.scopes ?? []).map(scope => `@scope ${scope}`),
    arm.media === undefined ? undefined : `@media ${arm.media}`,
    arm.supports === undefined ? undefined : `@supports ${arm.supports}`,
    arm.container === undefined ? undefined : `@container ${arm.container}`,
    arm.selector,
  ].filter((part): part is string => part !== undefined).join(' ')
}

export function isAxisDefinition(value: unknown): value is VanityAxisDefinition {
  return typeof value === 'object' && value !== null
    && (value as Partial<VanityAxisDefinition>)[VANITY_AXIS_DEFINITION] === true
}

function isAxisTrigger(value: unknown): value is VanityAxisTrigger {
  return typeof value === 'object' && value !== null
    && (value as Partial<VanityAxisTrigger>)[VANITY_AXIS_TRIGGER] === true
}

function createTrigger<const Activatable extends boolean = false>(
  arms: readonly VanityAxisTriggerArm[],
  activatable: Activatable = false as Activatable,
): VanityAxisTrigger<Activatable> {
  return Object.freeze({
    [VANITY_AXIS_TRIGGER]: true as const,
    [VANITY_RUNTIME_ACTIVATABLE]: activatable,
    arms: Object.freeze([...arms]),
  })
}

function parseCondition(input: string): VanityCondition {
  for (const [prefix, key] of [['@media ', 'media'], ['@supports ', 'supports'], ['@container ', 'container']] as const) {
    if (input.startsWith(prefix)) {
      const query = input.slice(prefix.length).trim()
      const reason = checkQuery(key, query)
      if (reason) {
        throwAxisError(
          `axis condition '${input}' does not parse: ${reason}`,
          'axis.condition',
          'fix the query syntax before using it as an axis mode trigger',
        )
      }
      return { arms: [{ [key]: query }] }
    }
  }
  if (checkSelector(input)) {
    throwAxisError(
      `axis condition '${input}' is not a valid selector`,
      'axis.condition',
      'provide a valid selector or a typed axis condition input',
    )
  }
  return { arms: [{ selector: input }] }
}

function queryMechanism(arm: VanityConditionArm): 'media' | 'supports' | 'container' | 'scope' | undefined {
  if ((arm.scopes?.length ?? 0) > 0)
    return 'scope'
  if (arm.media !== undefined)
    return 'media'
  if (arm.supports !== undefined)
    return 'supports'
  if (arm.container !== undefined)
    return 'container'
  return undefined
}

function triggerForOpenCondition(
  axis: string,
  mode: string,
  input: VanityCondition<string, boolean>,
): VanityAxisTrigger<boolean> {
  const arms: VanityAxisTriggerArm[] = []
  for (const arm of input.arms) {
    if (arm.anchor !== 'this-mode') {
      const normalized = createAxisCondition({ arms: [arm] }).arms
      if (arm.selector === '&') {
        const name = `data-${convertToKebab(axis)}`
        arms.push(...normalized.map(candidate => Object.freeze({
          ...candidate,
          runtime: Object.freeze({ kind: 'attribute' as const, name, value: null }),
        })))
      }
      else {
        arms.push(...normalized)
      }
      continue
    }
    const bases = createAxisData(axis, mode).arms
    for (const base of bases) {
      const { runtime: baseRuntime, ...baseWithoutRuntime } = base
      const pureThisMode = arm.media === undefined
        && arm.supports === undefined
        && arm.container === undefined
        && (arm.scopes?.length ?? 0) === 0
        && arm.runtime === undefined
        && (arm.selector === undefined || arm.selector === '&')
      arms.push(Object.freeze({
        ...(pureThisMode ? base : baseWithoutRuntime),
        ...(pureThisMode && baseRuntime !== undefined ? { runtime: baseRuntime } : {}),
        ...(arm.media === undefined ? {} : { media: arm.media }),
        ...(arm.supports === undefined ? {} : { supports: arm.supports }),
        ...(arm.container === undefined ? {} : { container: arm.container }),
        ...(arm.scopes === undefined ? {} : { scopes: arm.scopes }),
        selector: arm.selector === undefined || arm.selector === '&'
          ? base.selector
          : arm.selector.replaceAll('&', base.selector!),
      }))
    }
  }
  return createTrigger(arms, arms.some(arm => arm.runtime !== undefined))
}

function inferPlacement(selector: string): 'root' | 'ancestor' | 'descendant' {
  if (selector.includes('&')) {
    const before = selector.slice(0, selector.indexOf('&')).trim()
    const authoredAfter = selector.slice(selector.indexOf('&') + 1)
    const after = authoredAfter.trimStart()
    if (before.length > 0)
      return 'ancestor'
    if (/^\s/.test(authoredAfter) || after.startsWith('>') || after.startsWith('+') || after.startsWith('~'))
      return 'descendant'
  }
  return 'root'
}

function placeSelector(selector: string, placement: 'root' | 'ancestor' | 'descendant'): string {
  if (selector.includes('&'))
    return selector
  if (placement === 'ancestor')
    return `${selector} &`
  if (placement === 'descendant')
    return `& ${selector}`
  return `&${selector}`
}

function normalizePriority(priority: number | undefined): number {
  const value = priority ?? 0
  if (!Number.isFinite(value)) {
    throwAxisError(
      'axis condition priority must be a finite number',
      'axis.condition.priority',
      'provide a finite numeric priority',
    )
  }
  return value
}

function assertExactOrder(label: string, expected: readonly string[], actual: readonly string[]): void {
  const duplicates = actual.filter((value, index) => actual.indexOf(value) !== index)
  const missing = expected.filter(value => !actual.includes(value))
  const unknown = actual.filter(value => !expected.includes(value))
  if (duplicates.length || missing.length || unknown.length) {
    throwAxisError(
      `${label} must list every name exactly once`
      + `${missing.length ? `; missing: ${missing.join(', ')}` : ''}`
      + `${duplicates.length ? `; duplicate: ${[...new Set(duplicates)].join(', ')}` : ''}`
      + `${unknown.length ? `; unknown: ${unknown.join(', ')}` : ''}`,
      label,
      'include every declared name exactly once in the requested order',
    )
  }
}

function isIntegerIndex(value: string): boolean {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 && number < 2 ** 32 - 1 && String(number) === value
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (typeof value !== 'object' || value === null)
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function throwAxisError(
  message: string,
  path: string | readonly string[],
  fix: string,
): never {
  throw new VanityError({
    code: 'VANITY_SYSTEM_INVALID_AXIS',
    message,
    path,
    fix,
  })
}
