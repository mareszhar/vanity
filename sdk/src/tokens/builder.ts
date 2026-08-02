/** Phase 5's unified additive token builder and system-bound `tdef` facade. */

import type { VanityAxisDefinitions, VanityAxisModeName, VanityAxisRegistry } from '../system/axes'
import type { VanityCondition } from '../system/conditions'
import type { VanityCssDataType, VanityDataTypeOf } from '../values/types'
import type {
  VanityAdditiveGraph,
  VanityCanonicalTokens,
  VanityConfiguredToken,
  VanityConfiguredTokenShape,
  VanityConfigWithAxisDerivations,
  VanityDefaultTokenPolicy,
  VanityDerived,
  VanityDerivedResult,
  VanityGraphInput,
  VanityLeafInput,
  VanityTokenConfig,
  VanityTokenDefinition,
  VanityTokenFactory,
  VanityTokenHandleAny,
  VanityTokenPolicy,
} from './types'
import { isVanityValue } from '../values/types'
import { isColorValue, isContrastValue } from './color'
import { isConfiguredToken } from './config'
import {
  definePortableTokenModule,
  finalizeTokenModule,
  identifyTokenModule,
  isTokenBuilder,
  prefixTokenModule,
  rootTokenModule,
  VANITY_MODULE_TOKEN_REF,
} from './graph'

export const VANITY_UNIFIED_TOKEN_BUILDER = Symbol.for('vanity.unifiedTokenBuilder')

type GraphOfBuilder<Builder>
  = Builder extends VanityTokenDefinition<infer Graph, any> ? Graph : never

type GraphsOfBuilders<
  Builders extends readonly VanityTokenDefinition<any, any>[],
  Result extends object = Record<never, never>,
> = Builders extends readonly [
  infer Head extends VanityTokenDefinition<any, any>,
  ...infer Tail extends readonly VanityTokenDefinition<any, any>[],
]
  ? GraphsOfBuilders<Tail, VanityAdditiveGraph<Result, GraphOfBuilder<Head>>>
  : Result

type BulkChild<Producer, Key extends PropertyKey>
  = Producer extends (mode: infer Mode) => infer Tree
    ? Key extends keyof Tree ? (mode: Mode) => Tree[Key] : never
    : never

type BulkChildren<Bulk extends object, Key extends PropertyKey> = {
  readonly [Axis in keyof Bulk as BulkChild<Bulk[Axis], Key> extends never ? never : Axis]:
  BulkChild<Bulk[Axis], Key>
}

type BulkAxisValues<Bulk extends object> = {
  readonly [Axis in keyof Bulk]:
  Bulk[Axis] extends (mode: infer Mode extends string) => infer Value
    ? Readonly<Record<Mode, AxisResult<Value>>>
    : never
}

type WithBulkAxes<Config extends object, Bulk extends object> = Omit<Config, 'axes'> & {
  readonly axes:
    (Config extends { readonly axes: infer Existing extends object } ? Existing : Record<never, never>)
    & BulkAxisValues<Bulk>
}

type ApplyBulkAxes<Input, Bulk extends object>
  = keyof Bulk extends never ? Input
    : Input extends VanityConfiguredTokenShape<infer Config, infer Type>
      ? VanityConfiguredTokenShape<WithBulkAxes<Config, Bulk>, Type>
      : never

type LocalBulk<Input>
  = Input extends { readonly $axes: infer Bulk extends object } ? Bulk : Record<never, never>

type VanityTokenTreeNode<Input, Bulk extends object>
  = Input extends VanityTokenDefinition<infer Graph, any> ? Graph
    : Input extends VanityLeafInput ? ApplyBulkAxes<Input, Bulk>
      : Input extends object ? {
        readonly [Key in keyof Input as Key extends `$${string}` ? never : Key]:
        VanityTokenTreeNode<Input[Key], BulkChildren<Bulk & LocalBulk<Input>, Key>>
      }
        : never

export type VanityTokenTreeGraph<Input> = VanityTokenTreeNode<Input, Record<never, never>>

type VanityBulkAxisCallbacks<Axes extends VanityAxisDefinitions>
  = [keyof Axes] extends [never] ? never : Partial<{
    readonly [Axis in keyof Axes]:
    (mode: VanityAxisModeName<Axes[Axis]>) => object
  }>

/**
 * Broad recursive contextual surface for object-literal seeds. The generic
 * `Seed` beside it retains the exact authored graph; this side supplies
 * callback parameter types before inference has discovered that graph.
 */
export interface VanityTokenTreeContext<
  Axes extends VanityAxisDefinitions,
> {
  readonly [name: string]:
    | VanityLeafInput
    | VanityTokenDefinition<any, any>
    | VanityUnifiedTokenBuilder<any, any, any>
    | VanityTokenTreeContext<Axes>
    | VanityBulkAxisCallbacks<Axes>
    | undefined
  readonly $axes?: VanityBulkAxisCallbacks<Axes>
}

export interface VanityPortableTokenTreeContext {
  readonly [name: string]:
    | VanityPortableTokenInput
    | VanityTokenDefinition<any, any>
    | VanityPortableTokenTreeContext
}

/**
 * Reverse-mapped vocabulary guard. `$axes` is the sole metadata key accepted
 * by the unified tree language; all other `$` names fail at their own field.
 */
export type VanityTokenTreeInputGuard<
  Input extends object,
  Axes extends VanityAxisDefinitions,
> = {
  readonly [Key in keyof Input]:
  Key extends '$axes' ? unknown
    : Key extends `$${string}` ? never
      : Input[Key] extends VanityLeafInput | VanityTokenDefinition<any, any> | VanityUnifiedTokenBuilder<any, any, any> ? unknown
        : Input[Key] extends object ? VanityTokenTreeInputGuard<Input[Key], Axes>
          : unknown
}

type NamedTokenNode<Input>
  = Input extends VanityConfiguredTokenShape ? Input
    : Input extends VanityTokenConfig
      ? VanityConfiguredTokenShape<Input, VanityDataTypeOf<Input extends { readonly val: infer Val } ? Val : unknown>>
      : Input extends VanityLeafInput ? Input
        : Input extends VanityDerivedResult ? VanityDerived<Input>
          : never

type NamedDerivedTokenNode<Input>
  = Input extends VanityDerivedResult ? VanityDerived<Input> : never

type MarkDerivedTree<Input>
  = Input extends VanityDerivedResult ? VanityDerived<Input>
    : Input extends object ? {
      readonly [Key in keyof Input as Key extends `$${string}` ? never : Key]: MarkDerivedTree<Input[Key]>
    }
      : never

type VanityNamedTokenInput = VanityLeafInput | VanityDerivedResult | VanityTokenConfig

type VanityPortableTokenInput
  = | string
    | number
    | null
    | import('../values/types').VanityCssValue
    | import('./types').VanityAuthoredColor
    | import('./types').VanityContrast<any>
    | VanityTokenHandleAny

type VanityBuilderTokenInput<Bound extends boolean>
  = Bound extends true ? VanityNamedTokenInput : VanityPortableTokenInput

type VanityPortableStageGuard<Input>
  = Input extends VanityPortableTokenInput ? unknown
    : Input extends object ? {
      readonly [Key in keyof Input as Key extends `$${string}` ? never : Key]:
      VanityPortableStageGuard<Input[Key]>
    }
      : never

type AdditiveName<Graph extends object, Name extends string>
  = Name extends `$${string}` ? never
    : Name extends keyof Graph ? never : Name

type AxisValues<Axis>
  = Readonly<Partial<Record<VanityAxisModeName<Axis>, VanityDerivedResult | null>>>

type AxisResult<Input>
  = Input extends (...args: any[]) => infer Result ? Result : Input

type LowerAxisValues<Input extends object> = {
  readonly [Mode in keyof Input]: AxisResult<Input[Mode]>
}

type WithAxis<
  Config extends object,
  Axis extends string,
  Values extends object,
> = Omit<Config, 'axes'> & {
  readonly axes:
    (Config extends { readonly axes: infer Existing extends object } ? Existing : Record<never, never>)
    & Record<Axis, LowerAxisValues<Values>>
}

type ExistingAxisValues<Config extends object, Axis extends string>
  = Config extends { readonly axes: infer Configured extends object }
    ? Axis extends keyof Configured
      ? Configured[Axis] extends object ? Readonly<Configured[Axis]> : Record<never, never>
      : Record<never, never>
    : Record<never, never>

type AxisPatchValues<Axis, Config extends object, AxisName extends string> = Readonly<Partial<Record<
  VanityAxisModeName<Axis>,
  | VanityDerivedResult
  | null
  | ((modes: ExistingAxisValues<Config, AxisName>) => VanityDerivedResult | null)
>>>

type AxisDefault<Axis>
  = Axis extends { readonly defaultMode?: infer Mode extends string } ? Mode : never

type WithAxisDefault<Modes, Axis, Val>
  = Modes extends object
    ? AxisDefault<Axis> extends infer Mode extends string
      ? [Mode] extends [never] ? Modes
          : Mode extends keyof Modes ? Modes : Modes & Readonly<Record<Mode, Val>>
      : Modes
    : Modes

type WithAxisDefaults<
  Config extends object,
  Axes extends VanityAxisDefinitions,
> = Config extends { readonly val: infer Val, readonly axes: infer ConfiguredAxes extends object } ? Omit<Config, 'axes'> & {
  readonly axes: {
    readonly [Axis in keyof ConfiguredAxes]: Axis extends keyof Axes
      ? WithAxisDefault<ConfiguredAxes[Axis], Axes[Axis], Val>
      : ConfiguredAxes[Axis]
  }
}
  : Config

type FinalizeTdefConfig<
  Config extends object,
  Axes extends VanityAxisDefinitions,
> = WithAxisDefaults<
  VanityConfigWithAxisDerivations<WithInferredDefaultVal<NormalizeTdefAxes<Config, Axes>, Axes>, Axes>,
  Axes
>

type TdefAxisInput<Axis>
  = AxisValues<Axis>
    | ((mode: VanityAxisModeName<Axis>) => VanityDerivedResult | null)

type VanityTdefConfig<Axes extends VanityAxisDefinitions>
  = Omit<VanityTokenConfig, 'axes' | 'cases'> & {
    readonly axes?: {
      readonly [Axis in keyof Axes]?: TdefAxisInput<Axes[Axis]>
    }
    readonly cases?: readonly {
      readonly when: Partial<{ readonly [Axis in keyof Axes]: VanityAxisModeName<Axes[Axis]> }>
      readonly val: VanityDerivedResult | null
    }[]
  }

type TdefAxesGuard<Configured, Axes extends VanityAxisDefinitions>
  = Configured extends object ? {
    readonly [Axis in keyof Configured]: Axis extends keyof Axes
      ? Configured[Axis] extends (...args: any[]) => any ? Configured[Axis]
        : Configured[Axis] extends object ? {
          readonly [Mode in keyof Configured[Axis]]: Mode extends VanityAxisModeName<Axes[Axis]>
            ? Configured[Axis][Mode]
            : never
        }
          : never
      : never
  } : never

type TdefVocabularyGuard<Config, Axes extends VanityAxisDefinitions>
  = Config extends { readonly axes: infer Configured }
    ? { readonly axes: TdefAxesGuard<Configured, Axes> }
    : unknown

type NormalizeTdefAxes<Config extends object, Axes extends VanityAxisDefinitions>
  = Config extends { readonly axes: infer Configured extends object } ? Omit<Config, 'axes'> & {
    readonly axes: {
      readonly [Axis in keyof Configured]: Axis extends keyof Axes
        ? Configured[Axis] extends (...args: any[]) => infer Result
          ? Readonly<Record<VanityAxisModeName<Axes[Axis]>, Result>>
          : Configured[Axis]
        : Configured[Axis]
    }
  }
    : Config

type DefaultCandidates<Config extends object, Axes extends VanityAxisDefinitions>
  = Config extends { readonly axes: infer Configured extends object } ? {
    readonly [Axis in keyof Configured & keyof Axes]:
    AxisDefault<Axes[Axis]> extends infer Mode extends string
      ? Mode extends keyof Configured[Axis] ? Exclude<Configured[Axis][Mode], null> : never
      : never
  }[keyof Configured & keyof Axes]
    : never

type WithInferredDefaultVal<Config extends object, Axes extends VanityAxisDefinitions>
  = Config extends { readonly val: unknown } ? Config
    : [DefaultCandidates<Config, Axes>] extends [never] ? Config
        : Config & { readonly val: DefaultCandidates<Config, Axes> }

type TdefConfiguredType<Config extends object>
  = Config extends { readonly val: infer Val } ? VanityDataTypeOf<Val>
    : Config extends { readonly axes: infer Configured extends object }
      ? VanityDataTypeOf<Exclude<Configured[keyof Configured] extends infer Modes
        ? Modes extends object ? Modes[keyof Modes] : never
        : never, null>>
      : 'unknown'

export type VanityTokenAxisMethods<
  Config extends object,
  Type extends VanityCssDataType,
  Axes extends VanityAxisDefinitions,
> = {
  readonly [Axis in keyof Axes & string]: {
    <const Values extends AxisPatchValues<Axes[Axis], Config, Axis>>(
      values: Values,
    ): VanityTokenDefinitionValue<FinalizeTdefConfig<WithAxis<Config, Axis, Values>, Axes>, Type, Axes>
    <const Result>(
      values: (mode: VanityAxisModeName<Axes[Axis]>) => Result,
    ): VanityTokenDefinitionValue<
      FinalizeTdefConfig<
        WithAxis<Config, Axis, Record<VanityAxisModeName<Axes[Axis]>, Result>>,
        Axes
      >,
      Type,
      Axes
    >
  }
}

export type VanityTokenDefinitionValue<
  Config extends object = VanityTokenConfig,
  Type extends VanityCssDataType = VanityCssDataType,
  Axes extends VanityAxisDefinitions = Record<never, never>,
> = VanityConfiguredTokenShape<Config, Type> & VanityTokenAxisMethods<Config, Type, Axes>

type TdefResult<
  Config extends object,
  Axes extends VanityAxisDefinitions,
> = VanityTokenDefinitionValue<
  FinalizeTdefConfig<Config, Axes>,
  TdefConfiguredType<FinalizeTdefConfig<Config, Axes>>,
  Axes
>

interface TypedTdef<
  Type extends VanityCssDataType,
  Axes extends VanityAxisDefinitions,
> {
  (): VanityTokenDefinitionValue<Record<never, never> & VanityTokenConfig<never>, Type, Axes>
  <const Config extends Omit<VanityTdefConfig<Axes>, 'val'>>(
    config: Config & NoInfer<TdefVocabularyGuard<Config, Axes>>,
  ): VanityTokenDefinitionValue<FinalizeTdefConfig<Config, Axes>, Type, Axes>
}

export interface VanityTdefFactory<
  Axes extends VanityAxisDefinitions = Record<never, never>,
> {
  <const Config extends VanityTdefConfig<Axes>>(
    config: Config & NoInfer<TdefVocabularyGuard<Config, Axes>>,
  ): TdefResult<Config, Axes>
  readonly unknown: TypedTdef<'unknown', Axes>
  readonly number: TypedTdef<'number', Axes>
  readonly integer: TypedTdef<'integer', Axes>
  readonly percentage: TypedTdef<'percentage', Axes>
  readonly numberPercentage: TypedTdef<'number-percentage', Axes>
  readonly length: TypedTdef<'length', Axes>
  readonly lengthPercentage: TypedTdef<'length-percentage', Axes>
  readonly angle: TypedTdef<'angle', Axes>
  readonly time: TypedTdef<'time', Axes>
  readonly frequency: TypedTdef<'frequency', Axes>
  readonly resolution: TypedTdef<'resolution', Axes>
  readonly flex: TypedTdef<'flex', Axes>
  readonly color: TypedTdef<'color', Axes>
  readonly image: TypedTdef<'image', Axes>
  readonly position: TypedTdef<'position', Axes>
  readonly easingFunction: TypedTdef<'easing-function', Axes>
  readonly transformFunction: TypedTdef<'transform-function', Axes>
  readonly transformList: TypedTdef<'transform-list', Axes>
  readonly customIdent: TypedTdef<'custom-ident', Axes>
  readonly dashedIdent: TypedTdef<'dashed-ident', Axes>
  readonly string: TypedTdef<'string', Axes>
  readonly url: TypedTdef<'url', Axes>
}

const TYPED_FACTORY_NAMES = [
  'unknown',
  'number',
  'integer',
  'percentage',
  'numberPercentage',
  'length',
  'lengthPercentage',
  'angle',
  'time',
  'frequency',
  'resolution',
  'flex',
  'color',
  'image',
  'position',
  'easingFunction',
  'transformFunction',
  'transformList',
  'customIdent',
  'dashedIdent',
  'string',
  'url',
] as const

export interface VanityUnifiedTokenBuilder<
  Graph extends object = Record<never, never>,
  Policy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
  Axes extends VanityAxisDefinitions = Record<never, never>,
  Bound extends boolean = true,
> extends VanityTokenDefinition<Graph, Policy> {
  readonly [VANITY_UNIFIED_TOKEN_BUILDER]: true
  /** Lazy module-relative handles. Direct aliases rebind at every mount. */
  readonly refs: VanityCanonicalTokens<Graph, 'module', Policy>
  readonly add: {
    <const Name extends string, const Input extends VanityBuilderTokenInput<Bound>>(
      name: AdditiveName<Graph, Name>,
      input: Input,
    ): VanityUnifiedTokenBuilder<
      Graph & Record<Name, NamedTokenNode<Input>>,
      Policy,
      Axes,
      Bound
    >
    <const Name extends string, const Result extends VanityBuilderTokenInput<Bound>>(
      name: AdditiveName<Graph, Name>,
      factory: (m: VanityCanonicalTokens<Graph, 'module', Policy>) => Result,
    ): VanityUnifiedTokenBuilder<
      Graph & Record<Name, NamedDerivedTokenNode<Result>>,
      Policy,
      Axes,
      Bound
    >
    <const Stage extends object>(
      factory: (m: VanityCanonicalTokens<Graph, 'module', Policy>) =>
      Stage & (Bound extends true ? unknown : VanityPortableStageGuard<Stage>),
    ): VanityUnifiedTokenBuilder<
      VanityAdditiveGraph<Graph, MarkDerivedTree<Stage>>,
      Policy,
      Axes,
      Bound
    >
    <const Builder extends VanityTokenDefinition<any, Policy>>(
      builder: Builder,
    ): VanityUnifiedTokenBuilder<
      VanityAdditiveGraph<Graph, GraphOfBuilder<Builder>>,
      Policy,
      Axes,
      Bound
    >
    <const Builders extends readonly VanityTokenDefinition<any, Policy>[]>(
      builders: Builders,
    ): VanityUnifiedTokenBuilder<
      VanityAdditiveGraph<Graph, GraphsOfBuilders<Builders>>,
      Policy,
      Axes,
      Bound
    >
    <const Stage extends VanityTokenTreeContext<Axes>>(
      stage: Stage & VanityTokenTreeInputGuard<Stage, Axes>,
    ): VanityUnifiedTokenBuilder<
      VanityAdditiveGraph<Graph, VanityTokenTreeGraph<Stage>>,
      Policy,
      Axes,
      Bound
    >
  }
  readonly root: (root: string | VanityCondition) =>
  VanityUnifiedTokenBuilder<Graph, Policy, Axes, Bound>
}

export type VanityPortableTokenBuilder<Graph extends object = Record<never, never>>
  = VanityUnifiedTokenBuilder<Graph, VanityDefaultTokenPolicy, Record<never, never>, false>

interface BuilderRuntimeContext {
  readonly module: object
  readonly defineModule: (seed: VanityGraphInput) => object
  readonly tdef?: VanityTokenFactory<any>
  readonly axes?: VanityAxisRegistry<any>
  readonly preview: (module: object) => object
}

interface RuntimeFacade {
  readonly [VANITY_UNIFIED_TOKEN_BUILDER]: true
  readonly module: object
  readonly context: BuilderRuntimeContext
  readonly id: symbol
  readonly refs: object
  readonly add: (...args: unknown[]) => RuntimeFacade
  readonly root: (root: string | VanityCondition) => RuntimeFacade
}

/** Portable builder: plain values, callbacks, handoff, roots, and lazy refs. */
export function defineTokens<
  const Seed extends VanityPortableTokenTreeContext = Record<never, never>,
>(
  seed?: Seed & VanityTokenTreeInputGuard<Seed, Record<never, never>>,
): VanityPortableTokenBuilder<VanityTokenTreeGraph<Seed>> {
  const id = Symbol('vanity.tokenModule')
  const defineModule = (graph: VanityGraphInput) => definePortableTokenModule(graph)
  const prepared = prepareSeed(seed ?? {}, undefined, undefined)
  let module: any = identifyTokenModule(defineModule(prepared.graph), id)
  for (const mount of prepared.mounts)
    module = module.compose(prefixTokenModule(mount.module, mount.path))
  return facade({
    module,
    defineModule,
    preview: value => finalizeTokenModule(value, { prefix: 'module', emitCss: false }),
  }, id) as unknown as VanityPortableTokenBuilder<VanityTokenTreeGraph<Seed>>
}

/** @internal */
export function defineSystemTokens<
  Policy extends VanityTokenPolicy,
  Axes extends VanityAxisDefinitions,
  const Seed extends VanityTokenTreeContext<Axes>,
>(
  context: {
    readonly defineModule: (seed: VanityGraphInput) => object
    readonly tdef: VanityTokenFactory<Axes>
    readonly axes: VanityAxisRegistry<Axes>
    readonly preview: (module: object) => object
  },
  seed?: Seed & VanityTokenTreeContext<Axes> & VanityTokenTreeInputGuard<Seed, Axes>,
): VanityUnifiedTokenBuilder<VanityTokenTreeGraph<Seed>, Policy, Axes> {
  const id = Symbol('vanity.tokenModule')
  const prepared = prepareSeed(seed ?? {}, context.tdef, context.axes)
  let module: any = identifyTokenModule(context.defineModule(prepared.graph), id)
  for (const mount of prepared.mounts)
    module = module.compose(prefixTokenModule(mount.module, mount.path))
  return facade({ ...context, module }, id) as unknown as VanityUnifiedTokenBuilder<VanityTokenTreeGraph<Seed>, Policy, Axes>
}

/** @internal */
export function unwrapUnifiedTokenBuilder(value: unknown): object | undefined {
  return isUnifiedTokenBuilder(value) ? (value as unknown as RuntimeFacade).module : undefined
}

/** @internal */
export function isUnifiedTokenBuilder(value: unknown): value is VanityUnifiedTokenBuilder {
  return typeof value === 'object' && value !== null
    && (value as Partial<RuntimeFacade>)[VANITY_UNIFIED_TOKEN_BUILDER] === true
}

/** @internal */
export function createTdefFacade<Axes extends VanityAxisDefinitions>(
  token: VanityTokenFactory<Axes>,
  axes: VanityAxisRegistry<Axes>,
): VanityTdefFactory<Axes> {
  const wrap = (configured: VanityConfiguredToken): VanityTokenDefinitionValue<any, any, Axes> =>
    new Proxy(configured, {
      get(target, key, receiver) {
        if (typeof key !== 'string' || !(key in axes.definitions))
          return Reflect.get(target, key, receiver)
        return (input: unknown) => {
          const definition = axes.definitions[key]!
          const current = { ...((target.config as VanityTokenConfig).axes?.[key] ?? {}) }
          const additions: Record<string, unknown> = {}
          if (typeof input === 'function') {
            for (const mode of definition.modeOrder)
              additions[mode] = input(mode)
          }
          else {
            for (const [mode, value] of Object.entries(input as object)) {
              additions[mode] = typeof value === 'function'
                ? value(Object.freeze({ ...current, ...additions }))
                : value
            }
          }
          return wrap((token as any)({
            ...target.config,
            axes: {
              ...(target.config as VanityTokenConfig).axes,
              [key]: { ...current, ...additions },
            },
          }))
        }
      },
    }) as VanityTokenDefinitionValue<any, any, Axes>

  const target = ((config: VanityTokenConfig) => wrap((token as any)(normalizeAxisCallbacks(config, axes)))) as VanityTdefFactory<Axes>
  for (const name of TYPED_FACTORY_NAMES) {
    const typed = (token as any)[name] as (config?: object) => VanityConfiguredToken
    Object.defineProperty(target, name, {
      enumerable: true,
      value: (config: object = {}) => wrap(typed(normalizeAxisCallbacks(config as VanityTokenConfig, axes))),
    })
  }
  return Object.freeze(target) as unknown as VanityTdefFactory<Axes>
}

function facade(context: BuilderRuntimeContext, id = Symbol('vanity.tokenModule')): RuntimeFacade {
  let cachedRefs: object | undefined
  const next = (module: object) => facade({
    ...context,
    module: identifyTokenModule(module, id) as object,
  }, id)
  const target: Omit<RuntimeFacade, 'refs'> & { readonly refs?: object } = {
    [VANITY_UNIFIED_TOKEN_BUILDER]: true,
    module: context.module,
    context,
    id,
    add(...args: unknown[]) {
      const [first, second] = args
      if (Array.isArray(first) && args.length === 1) {
        return first.reduce((builder, module) => builder.add(module), target as RuntimeFacade)
      }
      if (isUnifiedTokenBuilder(first) || (args.length === 1 && isTokenBuilder(first))) {
        const mounted = unwrapUnifiedTokenBuilder(first) ?? first as object
        return next((context.module as any).compose(mounted))
      }
      if (args.length === 1 && first && typeof first === 'object') {
        const prepared = prepareSeed(first, context.tdef, context.axes)
        let addition = context.defineModule(prepared.graph)
        for (const mount of prepared.mounts)
          addition = (addition as any).compose(prefixTokenModule(mount.module, mount.path))
        return next((context.module as any).compose(addition))
      }
      if (typeof first === 'function' && args.length === 1) {
        return next((context.module as any).derive((m: Record<string, unknown>) => {
          const result = first(m)
          return prepareSeed(result as object, context.tdef, context.axes).graph
        }))
      }
      if (typeof first !== 'string' || args.length !== 2)
        throw new TypeError('[vanity] add() needs (name, value/callback), a tree/callback, or one or more token builders')
      if (first.startsWith('$'))
        throw new TypeError(`[vanity] token name '${first}' cannot begin with '$'`)
      const moduleRef = moduleRefOf(second)
      if (moduleRef?.module === id) {
        return next((context.module as any).derive((m: Record<string, unknown>) => ({
          [first]: readPath(m, moduleRef.path),
        })))
      }
      if (typeof second === 'function' && !isConfiguredToken(second)) {
        return next((context.module as any).derive((m: Record<string, unknown>) => ({
          [first]: normalizeNamedToken(
            (second as (...args: any[]) => unknown)(m),
            context.tdef,
          ),
        })))
      }
      const addition = context.defineModule({
        [first]: normalizeNamedToken(second, context.tdef),
      } as VanityGraphInput)
      return next((context.module as any).compose(addition))
    },
    root(root: string | VanityCondition) {
      if (typeof root === 'string')
        return next(rootTokenModule(context.module, root) as object)
      const ast = root.ast
      if (ast?.kind === 'anchor') {
        if (ast.anchor === 'system-root')
          return next(rootTokenModule(context.module, { systemRoot: true }) as object)
        throw new TypeError(
          `[vanity] ${ast.anchor === 'module-root' ? 'moduleRoot' : 'thisMode'} `
          + 'has no enclosing root in this token-module position',
        )
      }
      if (ast?.kind === 'scope') {
        const scopes = root.arms.flatMap(arm => arm.scopes ?? [])
        return next(rootTokenModule(context.module, {
          root: ':scope',
          scopes,
          runtimeRoot: ast.start,
        }) as object)
      }
      const selectors = root.arms.flatMap(arm =>
        arm.media === undefined && arm.supports === undefined && arm.container === undefined
        && (arm.scopes?.length ?? 0) === 0 && arm.selector !== undefined
          ? [arm.selector]
          : [],
      )
      if (selectors.length !== 1)
        throw new TypeError('[vanity] a token module root needs one concrete selector, systemRoot, or scope()')
      return next(rootTokenModule(context.module, selectors[0]!) as object)
    },
  }
  Object.defineProperty(target, 'refs', {
    enumerable: true,
    get() {
      if (cachedRefs === undefined) {
        cachedRefs = context.preview(context.module)
        brandModuleRefs(cachedRefs, id)
      }
      return cachedRefs
    },
  })
  const surface = Object.freeze(target) as RuntimeFacade
  return surface
}

function normalizeNamedToken(value: unknown, tdef: VanityTokenFactory<any> | undefined): unknown {
  if (isConfiguredToken(value)) {
    if (!tdef)
      throw new TypeError('[vanity] portable defineTokens() cannot use system-bound tdef(); use open.defineTokens()')
    throw new TypeError('[vanity] add(name, config) accepts the raw config; remove the unnecessary tdef() wrapper')
  }
  if (!tdef && isRawTokenConfig(value))
    throw new TypeError('[vanity] portable defineTokens() accepts plain values and callbacks; use open.defineTokens() for token traits')
  if (tdef && isRawTokenConfig(value))
    return (tdef as any)(value)
  return value
}

function prepareSeed(
  input: object,
  tdef: VanityTokenFactory<any> | undefined,
  axes: VanityAxisRegistry<any> | undefined,
): {
  readonly graph: VanityGraphInput
  readonly mounts: readonly { readonly path: readonly string[], readonly module: object }[]
} {
  const mounts: { path: readonly string[], module: object }[] = []
  const visit = (group: object, path: readonly string[]): Record<string, unknown> => {
    const result: Record<string, unknown> = {}
    for (const [name, value] of Object.entries(group)) {
      if (name === '$axes')
        continue
      if (name.startsWith('$'))
        throw new TypeError(`[vanity] token name '${[...path, name].join('.')}' cannot begin with '$'`)
      if (isUnifiedTokenBuilder(value)) {
        mounts.push({ path: [...path, name], module: unwrapUnifiedTokenBuilder(value)! })
        continue
      }
      if (!tdef && isConfiguredToken(value))
        throw new TypeError('[vanity] portable defineTokens() cannot use system-bound tdef(); use open.defineTokens()')
      if (isPlainGroup(value))
        result[name] = visit(value, [...path, name])
      else
        result[name] = value
    }
    const bulk = (group as { readonly $axes?: unknown }).$axes
    if (bulk !== undefined) {
      if (!tdef || !axes)
        throw new TypeError('[vanity] $axes requires the system-bound defineTokens() builder')
      applyBulkAxes(result, bulk, tdef, axes, path)
    }
    return result
  }
  return { graph: visit(input, []) as VanityGraphInput, mounts }
}

function applyBulkAxes(
  group: Record<string, unknown>,
  bulk: unknown,
  tdef: VanityTokenFactory<any>,
  axes: VanityAxisRegistry<any>,
  path: readonly string[],
): void {
  if (!bulk || typeof bulk !== 'object')
    throw new TypeError(`[vanity] ${[...path, '$axes'].join('.')} must be keyed by axis`)
  for (const [axis, producer] of Object.entries(bulk)) {
    const definition = axes.definitions[axis]
    if (!definition)
      throw new TypeError(`[vanity] $axes references unknown axis '${axis}'`)
    if (typeof producer !== 'function')
      throw new TypeError(`[vanity] $axes.${axis} must be a callback over the mode name`)
    for (const mode of definition.modeOrder) {
      const values = producer(mode)
      if (!values || typeof values !== 'object')
        throw new TypeError(`[vanity] $axes.${axis}('${mode}') must return a token-shaped value tree`)
      applyBulkMode(group, values, axis, mode, tdef, [])
    }
  }
}

function applyBulkMode(
  target: Record<string, unknown>,
  values: object,
  axis: string,
  mode: string,
  tdef: VanityTokenFactory<any>,
  path: readonly string[],
): void {
  for (const [name, value] of Object.entries(values)) {
    const current = target[name]
    if (isPlainGroup(value)) {
      if (!isPlainGroup(current))
        throw new TypeError(`[vanity] $axes cannot find token group '${[...path, name].join('.')}'`)
      applyBulkMode(current, value, axis, mode, tdef, [...path, name])
      continue
    }
    if (!isConfiguredToken(current))
      throw new TypeError(`[vanity] $axes token '${[...path, name].join('.')}' must use tdef() so traits stay explicit`)
    target[name] = (tdef as any)({
      ...current.config,
      axes: {
        ...(current.config as VanityTokenConfig).axes,
        [axis]: {
          ...(current.config as VanityTokenConfig).axes?.[axis],
          [mode]: value,
        },
      },
    })
  }
}

function normalizeAxisCallbacks(
  config: VanityTokenConfig,
  axes: VanityAxisRegistry<any> | undefined,
): VanityTokenConfig {
  if (!config.axes || !axes)
    return config
  const normalized: Record<string, Record<string, unknown | null>> = {}
  for (const [axis, input] of Object.entries(config.axes) as [string, any][]) {
    const definition = axes.definitions[axis]
    if (!definition)
      throw new TypeError(`[vanity] tdef() references unknown axis '${axis}'`)
    normalized[axis] = typeof input === 'function'
      ? Object.fromEntries(definition.modeOrder.map((mode: string) => [mode, input(mode)]))
      : { ...input }
  }
  return { ...config, axes: normalized }
}

function isRawTokenConfig(value: unknown): value is VanityTokenConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  return Object.keys(value).some(key => [
    'val',
    'reference',
    'emit',
    'mutable',
    'register',
    'axes',
    'cases',
    'description',
    'deprecated',
    'metadata',
    'validate',
  ].includes(key))
}

function isPlainGroup(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
    && !Array.isArray(value)
    && !isVanityValue(value)
    && !isColorValue(value)
    && !isContrastValue(value)
    && !isConfiguredToken(value)
    && !isUnifiedTokenBuilder(value)
    && !('type' in value)
}

function brandModuleRefs(value: object, module: symbol): void {
  for (const child of Object.values(value)) {
    if ((typeof child === 'object' || typeof child === 'function') && child !== null) {
      if (typeof child === 'function' && '$path' in child) {
        Object.defineProperty(child, VANITY_MODULE_TOKEN_REF, {
          value: Object.freeze({ module, path: String((child as any).$path).split('.') }),
        })
      }
      else {
        brandModuleRefs(child as object, module)
      }
    }
  }
}

function moduleRefOf(value: unknown): { readonly module: symbol, readonly path: readonly string[] } | undefined {
  if (typeof value !== 'function')
    return undefined
  return (value as any)[VANITY_MODULE_TOKEN_REF]
}

function readPath(tree: Record<string, unknown>, path: readonly string[]): unknown {
  let value: unknown = tree
  for (const name of path)
    value = (value as Record<string, unknown>)[name]
  return value
}
