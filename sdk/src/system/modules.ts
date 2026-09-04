/**
 * Detached definition modules shared by every non-token registrable kind.
 *
 * A module is deliberately tiny: immutable entries plus one scoped `.add()`
 * grammar. Mounting decides how those entries are normalized and validated.
 */

import type { VanityAxisDefinition, VanityOpenAxisConfig } from './axes'
import type { VanityConditionInput } from './conditions'
import type { VanityConstructorDefinition, VanityUtilTree } from './definitions'
import type { VanityPolicies } from './policies'
import type { VanitySystemRule } from './rules'
import { VanityError } from '../diagnostics'

export const VANITY_DEFINITION_MODULE = Symbol.for('vanity.definitionModule')

/** Definition-module categories accepted by the shared composition machinery. */
export type VanityDefinitionKind
  = | 'axes'
    | 'conditions'
    | 'consts'
    | 'constructors'
    | 'policies'
    | 'rules'
    | 'utils'

export type VanityAxisModuleInput
  = VanityAxisDefinition<any, any>
    | VanityOpenAxisConfig<any, any>
    | readonly [string, ...string[]]

type Simplify<Value> = { readonly [Key in keyof Value]: Value[Key] } & {}

type DeepMerge<Left, Right>
  = Left extends (...args: any[]) => unknown ? Right
    : Right extends (...args: any[]) => unknown ? Right
      : Left extends object
        ? Right extends object
          ? Simplify<{
            readonly [Key in keyof Left | keyof Right]:
            Key extends keyof Right
              ? Key extends keyof Left ? DeepMerge<Left[Key], Right[Key]> : Right[Key]
              : Key extends keyof Left ? Left[Key] : never
          }>
          : Right
        : Right

export type VanityDefinitionMerge<
  Kind extends VanityDefinitionKind,
  Left extends object,
  Right extends object,
> = Kind extends 'utils' | 'policies'
  ? DeepMerge<Left, Right>
  : Simplify<Left & Right>

type DefinitionShape<Module>
  = Module extends VanityDefinitionModule<any, infer Shape> ? Shape : never

export type VanityDefinitionModulesShape<
  Kind extends VanityDefinitionKind,
  Modules extends readonly VanityDefinitionModule<Kind, any>[],
  Result extends object = Record<never, never>,
> = Modules extends readonly [
  infer Head extends VanityDefinitionModule<Kind, any>,
  ...infer Tail extends readonly VanityDefinitionModule<Kind, any>[],
]
  ? VanityDefinitionModulesShape<
    Kind,
    Tail,
    VanityDefinitionMerge<Kind, Result, DefinitionShape<Head>>
  >
  : Result

type AdditiveName<Shape extends object, Name extends string>
  = Name extends `$${string}` ? never
    : Name extends keyof Shape ? never : Name

type DefinitionName<
  Kind extends VanityDefinitionKind,
  Shape extends object,
  Name extends string,
> = Kind extends 'policies'
  ? Name extends keyof VanityPolicies ? AdditiveName<Shape, Name> : never
  : AdditiveName<Shape, Name>

type DefinitionJson<Value>
  = Value extends string | number | boolean | null ? Value
    : Value extends readonly unknown[] ? { readonly [Index in keyof Value]: DefinitionJson<Value[Index]> }
      : Value extends (...args: any[]) => unknown ? never
        : Value extends object ? { readonly [Key in keyof Value]: DefinitionJson<Value[Key]> }
          : never

type DefinitionValueGuard<Kind extends VanityDefinitionKind, Value>
  = Kind extends 'axes' ? Value extends VanityAxisModuleInput ? Value : never
    : Kind extends 'conditions' ? Value extends VanityConditionInput ? Value : never
      : Kind extends 'consts' ? DefinitionJson<Value>
        : Kind extends 'constructors' ? Value extends VanityConstructorDefinition ? Value : never
          : Kind extends 'rules' ? Value extends VanitySystemRule ? Value : never
            : Kind extends 'utils'
              ? Value extends ((...args: any[]) => unknown) | VanityUtilTree ? Value : never
              : Value

type DefinitionTreeGuard<Kind extends VanityDefinitionKind, Added extends object> = {
  readonly [Key in keyof Added]: DefinitionValueGuard<Kind, Added[Key]>
}

type ShallowAdditiveGuard<Current extends object, Added extends object> = {
  readonly [Key in keyof Added]: Key extends keyof Current ? never : Added[Key]
}

type RecursiveAdditiveGuard<Current, Added>
  = Added extends (...args: any[]) => unknown
    ? Current extends undefined ? Added : never
    : Added extends object
      ? Current extends (...args: any[]) => unknown ? never
        : Current extends object ? {
          readonly [Key in keyof Added]:
          Key extends keyof Current ? RecursiveAdditiveGuard<Current[Key], Added[Key]> : Added[Key]
        }
          : Added
      : Current extends undefined ? Added : never

type DefinitionAdditiveGuard<
  Kind extends VanityDefinitionKind,
  Current extends object,
  Added extends object,
> = Kind extends 'utils' | 'policies'
  ? RecursiveAdditiveGuard<Current, Added>
  : ShallowAdditiveGuard<Current, Added>

export interface VanityDefinitionModule<
  Kind extends VanityDefinitionKind,
  Shape extends object = Record<never, never>,
> {
  readonly [VANITY_DEFINITION_MODULE]: Kind
  /** The immutable authored entries; normally consumed by `add{Kind}()`. */
  readonly entries: Readonly<Shape>
  /**
   * Grow this detached module immutably.
   *
   * Accepts a named value/callback, entry tree/callback, matching module, or
   * array of independent matching modules. Callbacks see entries accumulated
   * in this module—not a host system.
   */
  readonly add: {
    <const Name extends string, const Value>(
      name: Kind extends 'utils' ? never : DefinitionName<Kind, Shape, Name>,
      value: (m: Readonly<Shape>) => Value & DefinitionValueGuard<Kind, Value>,
    ): VanityDefinitionModule<Kind, VanityDefinitionMerge<Kind, Shape, Record<Name, Value>>>
    <const Name extends string, const Value>(
      name: DefinitionName<Kind, Shape, Name>,
      value: Value & DefinitionValueGuard<Kind, Value>,
    ): VanityDefinitionModule<Kind, VanityDefinitionMerge<Kind, Shape, Record<Name, Value>>>
    <const Added extends object>(
      factory: (m: Readonly<Shape>) => Added & DefinitionTreeGuard<Kind, Added>,
    ): VanityDefinitionModule<Kind, VanityDefinitionMerge<Kind, Shape, Added>>
    <const Module extends VanityDefinitionModule<Kind, any>>(
      module: Module,
    ): VanityDefinitionModule<Kind, VanityDefinitionMerge<Kind, Shape, DefinitionShape<Module>>>
    <const Modules extends readonly VanityDefinitionModule<Kind, any>[]>(
      modules: Modules,
    ): VanityDefinitionModule<
      Kind,
      VanityDefinitionMerge<Kind, Shape, VanityDefinitionModulesShape<Kind, Modules>>
    >
    <const Added extends object>(
      entries: Added
        & DefinitionTreeGuard<Kind, Added>
        & DefinitionAdditiveGuard<Kind, Shape, Added>,
    ): VanityDefinitionModule<Kind, VanityDefinitionMerge<Kind, Shape, Added>>
  }
}

export function defineRecordModule<
  const Kind extends VanityDefinitionKind,
  const Seed extends object = Record<never, never>,
>(
  kind: Kind,
  seed?: Seed,
): VanityDefinitionModule<Kind, Seed> {
  const materialize = (entries: object): VanityDefinitionModule<Kind, any> => {
    const add = (...args: unknown[]) => {
      const [first, second] = args
      if (args.length === 1 && Array.isArray(first)) {
        return first.reduce(
          (module, contribution) => module.add(contribution as never),
          materialize(entries),
        )
      }
      if (args.length === 1 && isDefinitionModule(first, kind))
        return materialize(mergeEntries(kind, entries, first.entries))
      if (args.length === 1 && typeof first === 'function') {
        const contribution = Reflect.apply(first, undefined, [entries])
        return materialize(mergeEntries(kind, entries, requireRecord(kind, contribution)))
      }
      if (args.length === 1)
        return materialize(mergeEntries(kind, entries, requireRecord(kind, first)))
      if (args.length !== 2 || typeof first !== 'string' || first.startsWith('$')) {
        throw new VanityError({
          code: 'VANITY_SYSTEM_INVALID_DEFINITION',
          message: `${getDefinitionName(kind)}.add() needs (name, value/callback), a tree/callback, or one or more matching modules`,
          path: ['definitions', kind],
          fix: 'pass a valid entry name and value, an entry tree, a callback, or matching modules',
        })
      }
      if (Object.hasOwn(entries, first)) {
        throw new VanityError({
          code: 'VANITY_SYSTEM_COLLISION',
          message: `${getDefinitionName(kind)}.add() cannot replace existing '${first}'`,
          path: [kind, first],
          fix: 'choose a new entry name; additive modules cannot replace an existing entry',
        })
      }
      // Utility leaves are themselves functions, so `(name, fn)` must mean a
      // direct leaf. A utility that needs module context uses the unambiguous
      // plural callback form: `.add(m => ({ name: ... }))`.
      const value = typeof second === 'function' && kind !== 'utils'
        ? Reflect.apply(second, undefined, [entries])
        : second
      return materialize(mergeEntries(kind, entries, { [first]: value }))
    }

    return Object.freeze({
      [VANITY_DEFINITION_MODULE]: kind,
      entries: freezeTree(entries),
      add,
    }) as VanityDefinitionModule<Kind, any>
  }

  return materialize(seed ?? {}) as VanityDefinitionModule<Kind, Seed>
}

/** Define a portable axis module; mount it with `addAxes()`. */
export function defineAxes<const Seed extends Readonly<Record<string, VanityAxisModuleInput>> = Record<never, never>>(
  seed?: Seed,
): VanityDefinitionModule<'axes', Seed> {
  return defineRecordModule('axes', seed)
}

/** Define a portable condition module; mount it with `addConditions()`. */
export function defineConditions<const Seed extends Readonly<Record<string, VanityConditionInput>> = Record<never, never>>(
  seed?: Seed,
): VanityDefinitionModule<'conditions', Seed> {
  return defineRecordModule('conditions', seed)
}

/** Define a detached system policy-book contribution. */
export function definePolicies<const Seed extends VanityPolicies = Record<never, never>>(
  seed?: Seed,
): VanityDefinitionModule<'policies', Seed> {
  return defineRecordModule('policies', seed)
}

function isDefinitionModule<
  Kind extends VanityDefinitionKind,
>(
  value: unknown,
  kind?: Kind,
): value is VanityDefinitionModule<Kind, object> {
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, VANITY_DEFINITION_MODULE))
    return false
  return kind === undefined || (value as VanityDefinitionModule<any>)[VANITY_DEFINITION_MODULE] === kind
}

export function resolveDefinitionInput(
  kind: VanityDefinitionKind,
  input: unknown,
): object {
  if (isDefinitionModule(input, kind))
    return input.entries
  if (Array.isArray(input)) {
    return input.reduce(
      (entries, module) => mergeEntries(
        kind,
        entries,
        isDefinitionModule(module, kind)
          ? module.entries
          : requireRecord(kind, module),
      ),
      {},
    )
  }
  return requireRecord(kind, input)
}

function mergeEntries(
  kind: VanityDefinitionKind,
  current: object,
  added: object,
  parent: readonly string[] = [],
): object {
  const result: Record<string, unknown> = { ...current }
  for (const [name, value] of Object.entries(added)) {
    const path = [...parent, name]
    const existing = result[name]
    if (existing === undefined) {
      result[name] = value
      continue
    }
    if (
      (kind === 'utils' || kind === 'policies')
      && isNamespace(existing)
      && isNamespace(value)
    ) {
      result[name] = mergeEntries(kind, existing, value, path)
      continue
    }
    throw new VanityError({
      code: 'VANITY_SYSTEM_COLLISION',
      message: `${getDefinitionName(kind)} cannot replace existing '${path.join('.')}'; use an overwrite method where that kind supports one`,
      path: [kind, ...path],
      fix: 'use the corresponding overwrite method on the open system, or choose a new entry name',
    })
  }
  return result
}

function isNamespace(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireRecord(kind: VanityDefinitionKind, value: unknown): object {
  if (!isNamespace(value)) {
    throw new VanityError({
      code: 'VANITY_SYSTEM_INVALID_DEFINITION',
      message: `${getDefinitionName(kind)} needs a plain entry tree`,
      path: ['definitions', kind],
      fix: 'pass a plain object containing the definition entries',
    })
  }
  return value
}

function getDefinitionName(kind: VanityDefinitionKind): string {
  return `define${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`
}

function freezeTree<Value>(value: Value, seen = new WeakMap<object, object>()): Value {
  if (typeof value === 'function' || typeof value !== 'object' || value === null)
    return value
  const prior = seen.get(value)
  if (prior)
    return prior as Value
  const clone: any = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value))
  seen.set(value, clone)
  for (const key of Reflect.ownKeys(value))
    clone[key] = freezeTree((value as any)[key], seen)
  return Object.freeze(clone)
}
