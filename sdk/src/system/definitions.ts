/** Detached const, utility, constructor, and rule definition registries. */

import type { VanityValue } from '../values/types'
import type { VanityDefinitionMerge, VanityDefinitionModule } from './modules'
import type { VanitySystemRule } from './rules'
import { defineRecordModule } from './modules'

export interface VanityUtilTree {
  readonly [name: string]: ((...args: any[]) => unknown) | VanityUtilTree
}

export type VanityConstructorMembers
  = Readonly<Record<string, (...args: any[]) => VanityValue>>

export type VanityConstructorDefinition<
  Call extends (...args: any[]) => VanityValue = (...args: any[]) => VanityValue,
  Members extends VanityConstructorMembers = Record<never, never>,
> = Readonly<{ readonly call: Call } & Members>

export type VanityConstructorFamily<
  Definition extends VanityConstructorDefinition,
> = Definition['call'] & Omit<Definition, 'call'>

/** Define immutable JSON convenience data; mount it with `addConsts()`. */
export function defineConsts<const Seed extends object = Record<never, never>>(
  seed?: Seed,
): VanityDefinitionModule<'consts', Seed> {
  return defineRecordModule('consts', seed)
}

/**
 * Define a utility tree; matching namespaces merge recursively at definition
 * and mount time while duplicate leaves remain additive errors.
 */
export function defineUtils<const Seed extends VanityUtilTree = Record<never, never>>(
  seed?: Seed,
): VanityDefinitionModule<'utils', Seed> {
  return defineRecordModule('utils', seed)
}

/** Define named system CSS rules; mount them with `addRules()`. */
export function defineRules<const Seed extends Readonly<Record<string, VanitySystemRule>> = Record<never, never>>(
  seed?: Seed,
): VanityDefinitionModule<'rules', Seed> {
  return defineRecordModule('rules', seed)
}

/** Define one or more callable constructor families without mounting them. */
export function defineConstructors<
  const Seed extends Readonly<Record<string, VanityConstructorDefinition>> = Record<never, never>,
>(
  seed?: Seed,
): VanityDefinitionModule<'constructors', Seed> {
  return defineRecordModule('constructors', seed)
}

/**
 * Define one detached callable constructor family.
 *
 * `call` supplies the function itself; every additional call-like member is
 * projected onto that function with its exact signature.
 */
export function defineConstructor<
  const Name extends string,
  const Definition extends VanityConstructorDefinition,
>(
  name: Name,
  definition: Definition,
): VanityDefinitionModule<'constructors', Record<Name, Definition>> {
  return defineRecordModule('constructors', { [name]: definition } as Record<Name, Definition>)
}

export type { VanityDefinitionMerge, VanitySystemRule }
