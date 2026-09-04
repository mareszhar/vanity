/**
 * Pure identity algorithms for one system's capability shape.
 *
 * The open-system state owns the data being identified. This module only
 * derives stable compatibility records from those explicit facets; it does
 * not create or store a runtime system surface.
 */

import type { VanityDefaultTokenPolicy, VanityTokenModuleRequirement, VanityTokenPolicy } from '../tokens/types'
import type { VanityCanonicalConstructors } from '../values/defaults'
import type { VanityValueKernel, VanityValueOperationContext } from '../values/kernel'
import type { VanityLengthConstructor, VanityLengthUnit } from '../values/units'
import type { VanityAxisDefinitions, VanityAxisRegistry } from './axes'
import type { VanityDefinitionMerge } from './modules'
import { EMPTY_AXIS_REGISTRY } from './axes'

export declare const VANITY_SYSTEM_SHAPE: unique symbol

/** Shape requirements a plugin expects the host system to satisfy. */
export interface VanityPluginRequirements {
  /** Token paths the plugin expects to read. */
  readonly tokens?: object
  /** Axis names and mode names the plugin expects. */
  readonly axes?: Readonly<Record<string, readonly string[]>>
  /** Condition names the plugin expects. */
  readonly conditions?: object
  /** Constant names the plugin expects. */
  readonly consts?: object
  /** Utility paths the plugin expects. */
  readonly utils?: string
  /** Rule names the plugin expects. */
  readonly rules?: string
  /** Plugin ids the plugin expects. */
  readonly plugins?: string
  /** Constructor names the plugin expects. */
  readonly constructors?: object
  /** Policy names the plugin expects. */
  readonly policies?: string
}

type RestrictionOf<Policies, Name extends PropertyKey>
  = Policies extends { readonly constructors?: infer Constructors }
    ? Name extends keyof Constructors
      ? Constructors[Name] extends { readonly restrict?: infer Restriction } ? Restriction : never
      : never
    : never

type ForbiddenArguments<Args extends readonly unknown[], Name extends PropertyKey, Restriction>
  = Args & {
    readonly [Message in
      `Constructor '${Extract<Name, string>}' is forbidden${Restriction extends { readonly use: infer Use extends string } ? `; use '${Use}'` : ''}`
    ]: never
  }

interface DiscouragedCall<Args extends readonly unknown[], Result> {
  /** @deprecated This constructor is discouraged by the bound system policy. */
  (...args: Args): Result
}

type ProjectConstructorMembers<Constructor, Restriction> = {
  readonly [Member in keyof Constructor]: ProjectRestrictedConstructor<Constructor[Member], Member, Restriction>
}

type ProjectDiscouragedConstructor<Constructor, Restriction> = Constructor extends (...args: infer Args) => infer Result
  ? DiscouragedCall<Args, Result> & ProjectConstructorMembers<Constructor, Restriction>
  : Constructor

type ProjectRestrictedConstructor<Constructor, Name extends PropertyKey, Restriction>
  = [Restriction] extends [never] ? Constructor
    : Restriction extends { readonly level: 'forbid' }
      ? Constructor extends (...args: infer Args) => infer Result
        ? ((...args: ForbiddenArguments<Args, Name, Restriction>) => Result) & {
          readonly [Member in keyof Constructor]: ProjectRestrictedConstructor<Constructor[Member], Member, Restriction>
        }
        : Constructor
      : Restriction extends { readonly level: 'discourage' }
        ? ProjectDiscouragedConstructor<Constructor, Restriction>
        : Constructor

type ConfiguredLengthUnit<Policies, Fallback extends VanityLengthUnit>
  = Policies extends {
    readonly constructors?: {
      readonly length?: { readonly unitless?: infer Unit extends VanityLengthUnit }
    }
  } ? Unit : Fallback

type CurrentLengthUnit<Constructors>
  = Constructors extends { readonly length: VanityLengthConstructor<infer Unit> } ? Unit : 'px'

export type ProjectConstructors<Constructors extends object, Policies>
  = {
    readonly [Name in keyof Constructors]: Name extends 'length'
      ? ProjectRestrictedConstructor<
        VanityLengthConstructor<ConfiguredLengthUnit<Policies, CurrentLengthUnit<Constructors>>>,
        Name,
        RestrictionOf<Policies, Name>
      >
      : ProjectRestrictedConstructor<Constructors[Name], Name, RestrictionOf<Policies, Name>>
  }

type ProjectTokenPolicy<Policy extends VanityTokenPolicy, Policies>
  = VanityTokenPolicy<
    Policies extends { readonly tokens?: { readonly reference?: infer Reference extends 'val' | 'var' } }
      ? Reference
      : Policy['reference'],
    Policies extends { readonly tokens?: { readonly emit?: infer Emit extends boolean } }
      ? Emit
      : Policy['emit']
  >

export type ProjectSystemShape<Shape, Policies>
  = VanityDefinitionMerge<
    'policies',
    ShapePolicies<Shape>,
    Policies extends object ? Policies : Record<never, never>
  > extends infer MergedPolicies
    ? VanitySystemShape<
      ProjectConstructors<ShapeConstructors<Shape>, MergedPolicies>,
      ProjectTokenPolicy<ShapePolicy<Shape>, MergedPolicies>,
      ShapeAxes<Shape>,
      ShapeRequirements<Shape>,
      MergedPolicies & object
    >
    : never

/** Type-only capability shape accumulated by an open system. */
export interface VanitySystemShape<
  Constructors extends object = VanityCanonicalConstructors<'px'>,
  Policy extends VanityTokenPolicy = VanityDefaultTokenPolicy,
  Axes extends VanityAxisDefinitions = Record<never, never>,
  Requirements extends VanityPluginRequirements = Record<never, never>,
  Policies extends object = Record<never, never>,
> {
  /** Type-only carriers for constructors, token policy, axes, requirements, and policies. */
  readonly [VANITY_SYSTEM_SHAPE]?: {
    readonly constructors: Constructors
    readonly policy: Policy
    readonly axes: Axes
    readonly requirements: Requirements
    readonly policies: Policies
  }
}

export type ShapeConstructors<Shape> = Shape extends VanitySystemShape<infer Constructors, any, any, any> ? Constructors : never
export type ShapePolicy<Shape> = Shape extends VanitySystemShape<any, infer Policy, any, any> ? Policy : VanityDefaultTokenPolicy
export type ShapeAxes<Shape> = Shape extends VanitySystemShape<any, any, infer Axes, any> ? Axes : Record<never, never>
export type ShapeRequirements<Shape> = Shape extends VanitySystemShape<any, any, any, infer Requirements> ? Requirements : Record<never, never>
export type ShapePolicies<Shape> = Shape extends VanitySystemShape<any, any, any, any, infer Policies> ? Policies : Record<never, never>
export type WithSystemRequirements<Shape, Added extends VanityPluginRequirements>
  = VanitySystemShape<
    ShapeConstructors<Shape>,
    ShapePolicy<Shape>,
    ShapeAxes<Shape>,
    ShapeRequirements<Shape> & Added,
    ShapePolicies<Shape>
  >

/** Compute the system capability identity from the authoritative state facets. */
export function getSystemCapabilitySignature(
  kernel: VanityValueKernel,
  context: VanityValueOperationContext,
  axes: VanityAxisRegistry<any> = EMPTY_AXIS_REGISTRY,
  parent?: string,
): string {
  const semantic = JSON.stringify({
    protocol: kernel.protocol,
    values: kernel.signature,
    parent: parent ?? null,
    support: {
      id: context.policies.support.id,
      features: [...context.policies.support.features].sort(),
    },
    policies: serializeStableIdentity(context.policies),
    axes: {
      order: axes.order,
      definitions: Object.keys(axes.definitions).sort(),
    },
  })
  return `vanity-system-1-${hashFNV1a(semantic)}`
}

/** Build the requirement carried by an unfinished token module. */
export function getSystemTokenModuleRequirement(
  kernel: VanityValueKernel,
  context: VanityValueOperationContext,
  axes: VanityAxisRegistry<any> = EMPTY_AXIS_REGISTRY,
  ancestors: readonly string[] = [],
): VanityTokenModuleRequirement {
  const signature = getSystemCapabilitySignature(kernel, context, axes)
  return Object.freeze({
    protocol: kernel.protocol,
    capabilitySignature: signature,
    compatibleCapabilitySignatures: Object.freeze([
      ...new Set([signature, ...ancestors, ...kernel.compatibleSignatures]),
    ]),
  })
}

function serializeStableIdentity(value: unknown, seen = new Set<object>()): unknown {
  if (typeof value === 'function')
    return '[function]'
  if (typeof value !== 'object' || value === null)
    return value
  if (seen.has(value))
    return '[cycle]'
  seen.add(value)
  try {
    if (value instanceof Set)
      return [...value].map(item => serializeStableIdentity(item, seen)).sort()
    if (value instanceof Map) {
      return [...value.entries()]
        .map(([key, item]) => [serializeStableIdentity(key, seen), serializeStableIdentity(item, seen)])
        .sort(([left], [right]) => String(left).localeCompare(String(right)))
    }
    if (Array.isArray(value))
      return value.map(item => serializeStableIdentity(item, seen))
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, serializeStableIdentity(item, seen)]))
  }
  finally {
    // A repeated reference is not a cycle when the first occurrence has
    // finished. Keep only the active recursion path in the cycle set.
    seen.delete(value)
  }
}

function hashFNV1a(value: string): string {
  let hash = 0x811C9DC5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
