/** Canonical authoring environment: an engine defines one or more systems. */

import type { VanityCssFunction } from '../css/types'
import type { VanityEngineKernel } from '../internal/engineKernel'
import type { VanityDtcgCodec } from '../internal/interchange'
import type {
  VanityAxisAuthoringHelpers,
  VanityAxisDefinitions,
  VanityAxisName,
  VanityAxisOrderRestGuard,
  VanityAxisRegistry,
} from '../system/axes'
import type { VanityConditionInput } from '../system/conditions'
import type {
  VanityDefaultLayers,
  VanityEngineSystemOptions,
  VanitySystem,
  VanitySystemConditionName,
  VanitySystemContractMetadata,
  VanitySystemTokens,
} from '../system/createSystem'
import type {
  VanityDefaultTokenPolicy,
  VanityEngineRequirement,
  VanityGraphInput,
  VanityTokenFactory,
  VanityTokenModule,
  VanityTokenModuleOptions,
  VanityTokenPolicy,
  VanityTokenReference,
} from '../tokens/types'
import type { VanityCanonicalConstructors } from '../values/defaultEngine'
import type { VanityCssSupportTarget, VanityExtensionIdentity } from '../values/protocol'
import type { VanitySelfValue } from '../values/types'
import type { VanityLengthUnit } from '../values/units'
import { createEngineKernel } from '../internal/engineKernel'
import {
  axisAuthoringHelpers,
  axisSemanticPolicy,
  EMPTY_AXIS_REGISTRY,
  normalizeAxisAdditions,
  reorderAxes,
  VANITY_AXIS_DEFINITION,
} from '../system/axes'
import { aria, container, data, media, schemeIs, supports } from '../system/conditions'
import { createSystemContractForEngine, createSystemForEngine } from '../system/createSystem'
import { check } from '../tokens/checks'
import { createTokenFactory } from '../tokens/config'
import { defineTokenModule, finalizeTokenModule } from '../tokens/graph'
import { scale } from '../tokens/scale'
import { createCoreConstructors, VANITY_CORE_EXTENSION_IDENTITIES } from '../values/defaultEngine'
import { defineCssOperation, defineCssValue } from '../values/extensions'
import { VANITY_DEFAULT_CSS_SUPPORT } from '../values/protocol'
import {
  assertSystemNamespaceAvailable,
  VANITY_BUILTIN_CONSTRUCTOR_NAMES,
  VANITY_SYSTEM_MEMBERS,
  VANITY_SYSTEM_SURFACE_VERSION,
} from './reservations'

export type VanitySemanticPolicy
  = | string
    | number
    | boolean
    | null
    | readonly VanitySemanticPolicy[]
    | { readonly [key: string]: VanitySemanticPolicy }

export interface VanityEngineTokenPolicy<
  Reference extends VanityTokenReference = VanityTokenReference,
  Emit extends boolean = boolean,
> {
  readonly reference?: Reference
  readonly emit?: Emit
}

export interface VanityEngineOptions<
  DefaultLengthUnit extends VanityLengthUnit = 'px',
  Reference extends VanityTokenReference = 'var',
  Emit extends boolean = true,
> {
  readonly support?: VanityCssSupportTarget
  readonly length?: { readonly unitless?: DefaultLengthUnit }
  /** Defaults applied to shorthand and omitted fields in branded token config. */
  readonly tokens?: VanityEngineTokenPolicy<Reference, Emit>
  readonly color?: Readonly<Record<string, VanitySemanticPolicy>>
  readonly validation?: Readonly<Record<string, VanitySemanticPolicy>>
  /** Extension point for project policies whose semantics affect identity. */
  readonly policies?: Readonly<Record<string, VanitySemanticPolicy>>
}

export interface VanityEnginePlugin<
  Added extends object,
  RequiredConstructors extends object = VanityCanonicalConstructors<VanityLengthUnit>,
> extends VanityExtensionIdentity {
  /** Type-only carrier used to diagnose missing earlier namespaces at `.use()`. */
  readonly __vanityRequiredConstructors?: RequiredConstructors
  readonly setup: (engine: VanityEngine<RequiredConstructors, VanityTokenPolicy, VanityAxisDefinitions>) => Added
  /** Optional authored-DTCG bridges for opaque values owned by this plugin. */
  readonly dtcg?: readonly VanityDtcgCodec[]
}

type VanityEngineReserved<Constructors extends object> = keyof Constructors | keyof VanityEngineMethods<Constructors, VanityTokenPolicy, VanityAxisDefinitions> | typeof VANITY_SYSTEM_MEMBERS[number]
type VanityExtensionOutput<Constructors extends object, Added> = Added & {
  readonly [Key in Extract<keyof Added, VanityEngineReserved<Constructors>>]: never
}

interface VanityEngineCommonMethods<
  TokenPolicy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
  Axes extends VanityAxisDefinitions = Record<never, never>,
> {
  readonly signature: string
  readonly support: VanityCssSupportTarget
  readonly policies: Readonly<Record<string, unknown>>
  readonly extensions: readonly VanityExtensionIdentity[]
  readonly compatibleSignatures: readonly string[]
  readonly serialize: <Type extends import('../values/types').VanityCssDataType>(value: VanitySelfValue<Type>) => string
  readonly defineCssValue: typeof defineCssValue
  readonly defineCssOperation: typeof defineCssOperation
  readonly check: typeof check
  readonly scale: typeof scale
  readonly media: typeof media
  readonly container: typeof container
  readonly supports: typeof supports
  readonly data: typeof data
  readonly aria: typeof aria
  readonly schemeIs: typeof schemeIs
  readonly token: VanityTokenFactory<Axes>
  readonly defineTokens: <const T extends VanityGraphInput = Record<never, never>>(
    seed?: T,
    options?: VanityTokenModuleOptions,
  ) => VanityTokenModule<T, TokenPolicy>
  readonly compatibleWith: (other: Pick<VanityEngineMethods<object, VanityTokenPolicy, VanityAxisDefinitions>, 'signature'>) => boolean
}

export interface VanityEngineMethods<
  Constructors extends object,
  TokenPolicy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
  Axes extends VanityAxisDefinitions = Record<never, never>,
> extends VanityEngineCommonMethods<TokenPolicy, Axes> {
  readonly createSystem: <
    const T extends object,
    const C extends Record<string, VanityConditionInput> = Record<never, never>,
    const L extends readonly string[] = VanityDefaultLayers,
    P extends string = 'vanity',
    B extends boolean = true,
  >(
    options: VanityEngineSystemOptions<T, C, L, P, B, TokenPolicy>,
  ) => VanitySystem<VanitySystemTokens<T, P, TokenPolicy, true>, VanitySystemConditionName<C, B>, L[number], Constructors, Axes, VanityCssFunction<VanitySystemConditionName<C, B>, L[number]>>
  readonly axes: <const Added extends VanityAxisDefinitions>(
    factory: (
      context: Omit<VanityEngine<Constructors, TokenPolicy, Axes>, keyof VanityAxisAuthoringHelpers>
        & VanityAxisAuthoringHelpers,
    ) => Added & VanityAxisContributionGuard<Axes, Added>,
  ) => VanityEngine<Constructors, TokenPolicy, Axes & Added>
  readonly axisOrder: <
    const First extends VanityAxisName<Axes>,
    const Rest extends readonly VanityAxisName<Axes>[],
  >(
    first: First,
    ...rest: Rest & VanityAxisOrderRestGuard<Axes, First, Rest>
  ) => VanityEngine<Constructors, TokenPolicy, Axes>
  readonly use: {
    <const Plugin extends VanityEnginePluginShape>(
      plugin: Plugin & VanityEnginePluginCompatibility<Constructors, NonNullable<Plugin['__vanityRequiredConstructors']>>,
    ): VanityEngine<Constructors & ReturnType<Plugin['setup']>, TokenPolicy, Axes>
  }
  readonly extend: {
    <const Added extends object>(
      extension: (engine: VanityEngine<Constructors, TokenPolicy, Axes>) => VanityExtensionOutput<Constructors, Added>,
    ): VanityEngine<Constructors & Added, TokenPolicy, Axes>
    <const Added extends object>(
      identity: VanityExtensionIdentity,
      extension: (engine: VanityEngine<Constructors, TokenPolicy, Axes>) => VanityExtensionOutput<Constructors, Added>,
    ): VanityEngine<Constructors & Added, TokenPolicy, Axes>
  }
}

type VanityAxisContributionGuard<Current extends VanityAxisDefinitions, Added extends VanityAxisDefinitions> = {
  readonly [Name in keyof Added]: Name extends keyof Current ? never : Added[Name]
}

type VanityMissingEngineRequirement<Current extends object, Required extends object> = {
  [Name in keyof Required]: Name extends keyof Current
    ? Current[Name] extends Required[Name] ? never : Name
    : Name
}[keyof Required]

type VanityEnginePluginCompatibility<Current extends object, Required extends object>
  = string extends keyof Current | keyof Required
    ? unknown
    : [VanityMissingEngineRequirement<Current, Required>] extends [never]
        ? unknown
        : { readonly 'Plugin requires an unavailable engine namespace': VanityMissingEngineRequirement<Current, Required> }

interface VanityEnginePluginShape extends VanityExtensionIdentity {
  readonly __vanityRequiredConstructors?: object
  readonly setup: (...args: never[]) => object
  readonly dtcg?: readonly VanityDtcgCodec[]
}

export type VanityEngine<
  Constructors extends object,
  TokenPolicy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
  Axes extends VanityAxisDefinitions = Record<never, never>,
> = Readonly<Constructors> & VanityEngineMethods<Constructors, TokenPolicy, Axes>

/** Named zero-config/configured engine surface, kept compact in consumer declarations. */
export interface VanityCoreEngine<
  DefaultLengthUnit extends VanityLengthUnit = 'px',
  TokenPolicy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
  Axes extends VanityAxisDefinitions = Record<never, never>,
> extends VanityCanonicalConstructors<DefaultLengthUnit>, VanityEngineMethods<VanityCanonicalConstructors<DefaultLengthUnit>, TokenPolicy, Axes> {}

export const VANITY_ENGINE = Symbol.for('vanity.engine')

interface EnginePrivate<Constructors extends object> {
  readonly [VANITY_ENGINE]: {
    readonly kernel: VanityEngineKernel<Constructors>
    readonly requirement: VanityEngineRequirement
    readonly axes: VanityAxisRegistry<any>
    readonly dtcg: readonly VanityDtcgCodec[]
  }
}

const ENGINE_METHOD_NAMES = new Set<string>([
  'signature',
  'support',
  'policies',
  'extensions',
  'compatibleSignatures',
  'serialize',
  'defineCssValue',
  'defineCssOperation',
  'check',
  'scale',
  'media',
  'container',
  'supports',
  'data',
  'aria',
  'schemeIs',
  'token',
  'defineTokens',
  'createSystem',
  'axes',
  'axisOrder',
  'compatibleWith',
  'use',
  'extend',
  'tokenOverride',
])

export function defineEnginePlugin<
  const Added extends object,
  RequiredConstructors extends object = VanityCanonicalConstructors<VanityLengthUnit>,
>(plugin: VanityEnginePlugin<Added, RequiredConstructors>): VanityEnginePlugin<Added, RequiredConstructors> {
  validateIdentity(plugin)
  if (typeof plugin.setup !== 'function')
    throw new TypeError('[vanity] an engine plugin needs a setup(engine) function')
  const dtcg = normalizeDtcgCodecs(plugin.dtcg)
  return Object.freeze({ ...plugin, ...(dtcg === undefined ? {} : { dtcg }) })
}

export function createEngine(): VanityCoreEngine<'px', VanityDefaultTokenPolicy, Record<never, never>>
export function createEngine<
  const DefaultLengthUnit extends VanityLengthUnit,
  const Reference extends VanityTokenReference = 'var',
  const Emit extends boolean = true,
>(
  options: VanityEngineOptions<DefaultLengthUnit, Reference, Emit>,
): VanityCoreEngine<DefaultLengthUnit, VanityTokenPolicy<Reference, Emit>, Record<never, never>>
export function createEngine<
  const DefaultLengthUnit extends VanityLengthUnit = 'px',
  const Reference extends VanityTokenReference = 'var',
  const Emit extends boolean = true,
>(
  options: VanityEngineOptions<DefaultLengthUnit, Reference, Emit> = {},
): VanityCoreEngine<DefaultLengthUnit, VanityTokenPolicy<Reference, Emit>, Record<never, never>> {
  const defaultLengthUnit = options.length?.unitless ?? 'px' as DefaultLengthUnit
  const policies = {
    ...(options.policies ?? {}),
    systemSurface: {
      version: VANITY_SYSTEM_SURFACE_VERSION,
      members: VANITY_SYSTEM_MEMBERS,
      builtInConstructors: VANITY_BUILTIN_CONSTRUCTOR_NAMES,
    },
    length: { unitless: defaultLengthUnit },
    tokens: {
      reference: options.tokens?.reference ?? 'var',
      emit: options.tokens?.emit ?? true,
    },
    ...(options.color === undefined ? {} : { color: options.color }),
    ...(options.validation === undefined ? {} : { validation: options.validation }),
  }

  const kernel = createEngineKernel(createCoreConstructors(defaultLengthUnit), {
    support: options.support ?? VANITY_DEFAULT_CSS_SUPPORT,
    policies,
    extensions: VANITY_CORE_EXTENSION_IDENTITIES,
  })
  return materializeEngine(kernel)
}

export function enginePrivate<Constructors extends object, TokenPolicy extends VanityTokenPolicy>(
  engine: VanityEngine<Constructors, TokenPolicy, VanityAxisDefinitions>,
): EnginePrivate<Constructors>[typeof VANITY_ENGINE] {
  return (engine as VanityEngine<Constructors, TokenPolicy, VanityAxisDefinitions> & EnginePrivate<Constructors>)[VANITY_ENGINE]
}

/** Rebind an immutable engine to a revised system policy book. */
export function updateEnginePolicies<
  const Constructors extends object,
  const TokenPolicy extends VanityTokenPolicy,
  const Axes extends VanityAxisDefinitions,
>(
  engine: VanityEngine<Constructors, TokenPolicy, Axes>,
  input: {
    readonly policies: Readonly<Record<string, unknown>>
    readonly support?: VanityCssSupportTarget
  },
): VanityEngine<Constructors, TokenPolicy, Axes> {
  const { kernel, axes, dtcg } = enginePrivate(
    engine as unknown as VanityEngine<Constructors, TokenPolicy, VanityAxisDefinitions>,
  )
  const next = createEngineKernel(kernel.constructors, {
    support: input.support ?? kernel.support,
    policies: input.policies,
    extensions: kernel.extensions,
    ancestors: kernel.compatibleSignatures,
  })
  return materializeEngine(next, axes as VanityAxisRegistry<Axes>, dtcg)
}

/** Internal bridge from the Phase 4 open system into the proven domain finalizer. */
export function consolidateEngineSystem<
  const Constructors extends object,
  const TokenPolicy extends VanityTokenPolicy,
  const Axes extends VanityAxisDefinitions,
  const T extends object,
  const C extends Record<string, VanityConditionInput> = Record<never, never>,
  const L extends readonly string[] = VanityDefaultLayers,
  P extends string = 'vanity',
  B extends boolean = true,
>(
  engine: VanityEngine<Constructors, TokenPolicy, Axes>,
  options: VanityEngineSystemOptions<T, C, L, P, B, TokenPolicy>,
  metadata: VanitySystemContractMetadata = {},
): VanitySystem<
  VanitySystemTokens<T, P, TokenPolicy, true>,
  VanitySystemConditionName<C, B>,
  L[number],
  Constructors,
  Axes,
  VanityCssFunction<VanitySystemConditionName<C, B>, L[number]>
> {
  const { kernel, requirement, axes, dtcg } = enginePrivate(
    engine as unknown as VanityEngine<Constructors, TokenPolicy, VanityAxisDefinitions>,
  )
  const tokenPolicy = Object.freeze({
    reference: kernel.policies.tokens && typeof kernel.policies.tokens === 'object'
      && 'reference' in kernel.policies.tokens
      ? kernel.policies.tokens.reference as VanityTokenReference
      : 'var',
    emit: kernel.policies.tokens && typeof kernel.policies.tokens === 'object'
      && 'emit' in kernel.policies.tokens
      ? kernel.policies.tokens.emit as boolean
      : true,
  }) as TokenPolicy

  return createSystemContractForEngine<
    Constructors,
    TokenPolicy,
    Axes,
    VanityCssFunction<VanitySystemConditionName<C, B>, L[number]>,
    T,
    C,
    L,
    P,
    B
  >(
    { kernel, requirement, tokenPolicy, axes: axes as VanityAxisRegistry<Axes>, dtcg },
    options,
    metadata,
  )
}

/** User-plane Phase 4 overwrite bridge; plugins never receive this operation. */
export function overwriteEngineAxis<
  const Constructors extends object,
  const TokenPolicy extends VanityTokenPolicy,
  const Axes extends VanityAxisDefinitions,
  const Name extends keyof Axes & string,
  const Definition extends VanityAxisDefinitions[Name],
>(
  engine: VanityEngine<Constructors, TokenPolicy, Axes>,
  name: Name,
  definition: Definition,
): VanityEngine<Constructors, TokenPolicy, Omit<Axes, Name> & Record<Name, Definition>> {
  const { kernel, axes, dtcg } = enginePrivate(
    engine as unknown as VanityEngine<Constructors, TokenPolicy, VanityAxisDefinitions>,
  )
  if (!(name in axes.definitions))
    throw new TypeError(`[vanity] overwriteAxis() cannot replace unknown axis '${name}'; use addAxis()`)
  if (
    !definition
    || typeof definition !== 'object'
    || definition[VANITY_AXIS_DEFINITION] !== true
  ) {
    throw new TypeError(`[vanity] overwriteAxis() needs an axis definition created by axis() or scheme()`)
  }
  const existing = axes.definitions[name]!
  for (const mode of Object.keys(existing.modes)) {
    if (!(mode in definition.modes)) {
      throw new TypeError(
        `[vanity] overwriteAxis() cannot remove existing mode '${name}.${mode}'; overwrites may grow shape but never shrink it`,
      )
    }
  }
  const nextDefinitions = Object.freeze({ ...axes.definitions, [name]: definition })
  const nextAxes = Object.freeze({
    definitions: nextDefinitions,
    order: Object.freeze([...axes.order]),
  }) as VanityAxisRegistry<Omit<Axes, Name> & Record<Name, Definition>>
  return materializeEngine(
    kernelWithAxes(kernel, nextAxes),
    nextAxes,
    dtcg,
  )
}

/** Resolve logical open-system handles without emitting CSS or creating a system record. */
export function previewEngineTokens<
  const Constructors extends object,
  const TokenPolicy extends VanityTokenPolicy,
  const Axes extends VanityAxisDefinitions,
  const T extends object,
>(
  engine: VanityEngine<Constructors, TokenPolicy, Axes>,
  module: T,
): VanitySystemTokens<T, 'vanity-open', TokenPolicy, true> {
  const { kernel, axes, dtcg } = enginePrivate(
    engine as unknown as VanityEngine<Constructors, TokenPolicy, VanityAxisDefinitions>,
  )
  return finalizeTokenModule(module, {
    prefix: 'vanity-open',
    root: ':root',
    serializeValue: value => kernel.serializeValue(value),
    support: kernel.support,
    policies: kernel.policies,
    axes,
    dtcgCodecIds: new Set(dtcg.map(codec => codec.extension)),
    emitCss: false,
  }) as VanitySystemTokens<T, 'vanity-open', TokenPolicy, true>
}

function materializeEngine<
  Constructors extends object,
  TokenPolicy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
  Axes extends VanityAxisDefinitions = Record<never, never>,
>(
  kernel: VanityEngineKernel<Constructors>,
  axes: VanityAxisRegistry<Axes> = EMPTY_AXIS_REGISTRY as unknown as VanityAxisRegistry<Axes>,
  dtcg: readonly VanityDtcgCodec[] = [],
): VanityEngine<Constructors, TokenPolicy, Axes> {
  const requirement: VanityEngineRequirement = Object.freeze({
    protocol: kernel.protocol,
    signature: kernel.signature,
    compatibleSignatures: kernel.compatibleSignatures,
  })

  let engine: VanityEngine<Constructors, TokenPolicy, Axes>
  const extend = ((...args: unknown[]) => {
    const [identity, factory] = typeof args[0] === 'function'
      ? [undefined, args[0]]
      : [args[0] as VanityExtensionIdentity, args[1]]

    if (typeof factory !== 'function')
      throw new TypeError('[vanity] extend() needs a callback that returns an engine namespace')

    if (identity !== undefined) {
      validateIdentity(identity)
      const installed = kernel.extensions.find(extension => extension.id === identity.id.trim())
      if (installed) {
        throw new TypeError(
          `[vanity] extension id "${identity.id.trim()}" is already installed at version ${installed.version}`,
        )
      }
    }

    const added = factory(engine)
    validateContribution(added, kernel.constructors, identity?.id ?? 'anonymous extension')
    deepFreeze(added)

    const next = identity === undefined
      ? createEngineKernel(
          { ...kernel.constructors, ...added },
          {
            support: kernel.support,
            policies: kernel.policies,
            extensions: kernel.extensions,
            ancestors: kernel.compatibleSignatures,
          },
        )
      : kernel.extend(identity, added)
    return materializeEngine(next, axes, dtcg)
  }) as VanityEngineMethods<Constructors, TokenPolicy, Axes>['extend']

  const tokenPolicy = Object.freeze({
    reference: kernel.policies.tokens && typeof kernel.policies.tokens === 'object'
      && 'reference' in kernel.policies.tokens
      ? kernel.policies.tokens.reference as VanityTokenReference
      : 'var',
    emit: kernel.policies.tokens && typeof kernel.policies.tokens === 'object'
      && 'emit' in kernel.policies.tokens
      ? kernel.policies.tokens.emit as boolean
      : true,
  }) as TokenPolicy
  const token = createTokenFactory(axes)

  const common = {
    ...kernel.constructors,
    signature: kernel.signature,
    support: kernel.support,
    policies: kernel.policies,
    extensions: kernel.extensions,
    compatibleSignatures: kernel.compatibleSignatures,
    serialize: kernel.serialize,
    defineCssValue,
    defineCssOperation,
    check,
    scale,
    media,
    container,
    supports,
    data,
    aria,
    schemeIs,
    token,
    defineTokens: <const T extends VanityGraphInput = Record<never, never>>(
      seed?: T,
      options?: VanityTokenModuleOptions,
    ) => defineTokenModule(requirement, tokenPolicy, seed, options),
    createSystem: <
      const T extends object,
      const C extends Record<string, VanityConditionInput> = Record<never, never>,
      const L extends readonly string[] = VanityDefaultLayers,
      P extends string = 'vanity',
      B extends boolean = true,
    >(options: VanityEngineSystemOptions<T, C, L, P, B, TokenPolicy>) => createSystemForEngine<
      Constructors,
      TokenPolicy,
      Axes,
      VanityCssFunction<VanitySystemConditionName<C, B>, L[number]>,
      T,
      C,
      L,
      P,
      B
    >(
      { kernel, requirement, tokenPolicy, axes, dtcg },
      options,
    ),
    axes: <const Added extends VanityAxisDefinitions>(
      factory: (
        context: Omit<VanityEngine<Constructors, TokenPolicy, Axes>, keyof VanityAxisAuthoringHelpers>
          & VanityAxisAuthoringHelpers,
      ) => Added & VanityAxisContributionGuard<Axes, Added>,
    ) => {
      if (typeof factory !== 'function')
        throw new TypeError('[vanity] axes() needs a callback that returns an axis record')
      const context = Object.freeze({ ...engine, ...axisAuthoringHelpers }) as Omit<
        VanityEngine<Constructors, TokenPolicy, Axes>,
        keyof VanityAxisAuthoringHelpers
      > & VanityAxisAuthoringHelpers
      const nextAxes = normalizeAxisAdditions(axes, factory(context))
      return materializeEngine<Constructors, TokenPolicy, Axes & Added>(
        kernelWithAxes(kernel, nextAxes),
        nextAxes as unknown as VanityAxisRegistry<Axes & Added>,
        dtcg,
      )
    },
    axisOrder: <
      const First extends VanityAxisName<Axes>,
      const Rest extends readonly VanityAxisName<Axes>[],
    >(
      first: First,
      ...rest: Rest & VanityAxisOrderRestGuard<Axes, First, Rest>
    ) => {
      const order = [first, ...rest] as readonly VanityAxisName<Axes>[]
      const nextAxes = reorderAxes(axes, order)
      return materializeEngine<Constructors, TokenPolicy, Axes>(kernelWithAxes(kernel, nextAxes), nextAxes, dtcg)
    },
    compatibleWith: (other: Pick<VanityEngineMethods<object, VanityTokenPolicy, VanityAxisDefinitions>, 'signature'>) =>
      kernel.signature === other.signature,
    use: <
      const Added extends object,
      RequiredConstructors extends object,
    >(plugin: VanityEnginePlugin<Added, RequiredConstructors>
      & VanityEnginePluginCompatibility<Constructors, RequiredConstructors>) => {
      validateIdentity(plugin)
      const installed = kernel.extensions.find(extension => extension.id === plugin.id.trim())
      if (installed) {
        throw new TypeError(
          `[vanity] extension id "${plugin.id.trim()}" is already installed at version ${installed.version}`,
        )
      }
      const pluginDtcg = normalizeDtcgCodecs(plugin.dtcg) ?? []
      const nextDtcg = [...dtcg, ...pluginDtcg]
      validateDtcgCodecs(nextDtcg)
      const added = plugin.setup(
        engine as unknown as VanityEngine<RequiredConstructors, VanityTokenPolicy, VanityAxisDefinitions>,
      ) as VanityExtensionOutput<Constructors, Added>
      validateContribution(added, kernel.constructors, plugin.id)
      deepFreeze(added)
      const next = kernel.extend(plugin, added)
      return materializeEngine(next, axes, Object.freeze(nextDtcg))
    },
    extend,
  }

  Object.defineProperty(common, VANITY_ENGINE, {
    enumerable: false,
    value: Object.freeze({ kernel, requirement, axes, dtcg }),
  })
  engine = Object.freeze(common) as VanityEngine<Constructors, TokenPolicy, Axes>
  return engine
}

function validateDtcgCodecs(codecs: readonly VanityDtcgCodec[] | undefined): void {
  const identities = new Set<string>()
  for (const codec of codecs ?? []) {
    const identity = `${codec.id}@${codec.version}`
    if (!codec.id.trim() || !String(codec.version).trim() || !codec.extension.trim())
      throw new TypeError('[vanity] a DTCG codec needs non-empty id, version, and extension fields')
    if (typeof codec.encode !== 'function' || typeof codec.decode !== 'function')
      throw new TypeError(`[vanity] DTCG codec '${identity}' needs encode() and decode() functions`)
    if (identities.has(identity))
      throw new TypeError(`[vanity] duplicate DTCG codec '${identity}'`)
    identities.add(identity)
  }
}

function normalizeDtcgCodecs(codecs: readonly VanityDtcgCodec[] | undefined): readonly VanityDtcgCodec[] | undefined {
  if (codecs === undefined)
    return undefined
  validateDtcgCodecs(codecs)
  return Object.freeze(codecs.map(codec => Object.freeze({ ...codec })))
}

function kernelWithAxes<Constructors extends object>(
  kernel: VanityEngineKernel<Constructors>,
  axes: VanityAxisRegistry<any>,
): VanityEngineKernel<Constructors> {
  return createEngineKernel(kernel.constructors, {
    support: kernel.support,
    policies: { ...kernel.policies, axes: axisSemanticPolicy(axes) },
    extensions: kernel.extensions,
    ancestors: kernel.compatibleSignatures,
  })
}

function validateContribution(
  added: unknown,
  existing: object,
  owner: string,
): asserts added is object {
  if (!isPlainObject(added))
    throw new TypeError(`[vanity] ${owner} must return a plain object namespace`)

  assertSystemNamespaceAvailable(Object.keys(added), owner)
  for (const name of Object.keys(added)) {
    if (name in existing || ENGINE_METHOD_NAMES.has(name)) {
      throw new TypeError(
        `[vanity] ${owner} cannot define '${name}' because that engine/system member already exists`,
      )
    }
  }
}

function validateIdentity(identity: VanityExtensionIdentity): void {
  if (identity.id.trim().length === 0 || String(identity.version).trim().length === 0)
    throw new TypeError('[vanity] plugin/extension identity needs non-empty id and version fields')
  if (identity.fingerprint !== undefined && identity.fingerprint.trim().length === 0)
    throw new TypeError('[vanity] a provided plugin configuration fingerprint cannot be empty')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null)
    return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function deepFreeze(value: unknown): void {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || Object.isFrozen(value))
    return
  Object.freeze(value)
  for (const child of [
    ...Object.values(value as Record<string, unknown>),
    ...Object.getOwnPropertySymbols(value).map(symbol => (value as any)[symbol]),
  ])
    deepFreeze(child)
}
