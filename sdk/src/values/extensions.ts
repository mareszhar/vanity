/** Public value-extension contracts. Extension authors only use these types. */

import type {
  VanityCssFeature,
  VanityExtensionIdentity,
  VanityFoldContext,
  VanityFoldRefusal,
  VanitySerializeContext,
  VanitySource,
} from './protocol'
import type {
  VanityCssDataType,
  VanityCssInput,
  VanityCssValue,
  VanityValue,
} from './types'
import {
  createInputNode,
  createPluginNode,
  ExpressionValue,
  getNode,
  isNodeValue,
} from './protocol'

export type VanityExtensionInput<Type extends VanityCssDataType = VanityCssDataType>
  = Type extends 'number' | 'integer' ? number | VanityValue<Type>
    : VanityCssInput | VanityValue<Type>

export interface VanityCssValueRecipe<Type extends VanityCssDataType = VanityCssDataType> {
  /** Values whose references/resolution requirements this node carries. */
  readonly dependencies?: readonly (VanityValue | string | number)[]
  readonly requirements?: readonly VanityCssFeature[]
  readonly source?: VanitySource
  readonly fallback?: VanityValue<Type>
  serialize: (context: VanitySerializeContext) => string
  fold?: (context: VanityFoldContext) => VanityValue<Type> | { readonly preserve: VanityFoldRefusal }
}

export interface VanityCssValueDefinition<
  Type extends VanityCssDataType,
  Args extends readonly unknown[],
> {
  readonly type: Type
  /** Required only when `create` returns extension-owned opaque semantics. */
  readonly extension?: VanityExtensionIdentity
  create: (...args: Args) => VanityValue<Type> | VanityCssValueRecipe<Type>
}

/**
 * Define a value constructor without exposing the IR implementation classes.
 * Returning another vanity value lowers fully to core IR and is portable;
 * returning a serializer recipe requires stable extension identity.
 */
export function defineCssValue<
  const Type extends VanityCssDataType,
  const Args extends readonly unknown[],
>(definition: VanityCssValueDefinition<Type, Args>): (...args: Args) => VanityCssValue<string, Type> {
  return (...args) => {
    const result = definition.create(...args)

    if (isNodeValue(result)) {
      const node = getNode(result)
      if (!isCompatibleType(definition.type, node.type))
        throwTypeMismatch('value', definition.type, node.type)
      return new ExpressionValue(node as never)
    }

    if (!isRecipe(result))
      throw new TypeError('[vanity] defineCssValue().create() must return a vanity value or serializer recipe')

    if (!definition.extension) {
      throw new TypeError(
        '[vanity] an anonymous CSS value extension cannot own opaque serialization; '
        + 'return a value lowered to core IR or provide a stable extension { id, version }',
      )
    }

    const dependencies = (result.dependencies ?? []).map(value => createInputNode(value as VanityCssInput))
    const node = createPluginNode({
      type: definition.type,
      extension: definition.extension,
      dependencies,
      requirements: result.requirements,
      source: result.source,
      serialize: result.serialize,
      fallback: result.fallback ? getNode(result.fallback) : undefined,
      fold: result.fold
        ? (context) => {
            const folded = result.fold!(context)
            return 'preserve' in folded
              ? { kind: 'preserve', reason: folded.preserve }
              : { kind: 'folded', node: getNode(folded) }
          }
        : undefined,
    })
    return new ExpressionValue(node)
  }
}

type OperationInputs<Types extends readonly VanityCssDataType[]> = {
  readonly [K in keyof Types]: Types[K] extends VanityCssDataType ? VanityExtensionInput<Types[K]> : never
}

export interface VanityCssOperationDefinition<
  Inputs extends readonly VanityCssDataType[],
  Output extends VanityCssDataType,
> {
  readonly inputs: Inputs
  readonly output: Output
  readonly extension: VanityExtensionIdentity
  readonly requirements?: readonly VanityCssFeature[]
  readonly source?: VanitySource
  readonly fallback?: (...inputs: OperationInputs<Inputs>) => VanityValue<Output>
  serialize: (context: VanitySerializeContext, ...inputs: OperationInputs<Inputs>) => string
  fold?: (context: VanityFoldContext, ...inputs: OperationInputs<Inputs>) => VanityValue<Output> | { readonly preserve: VanityFoldRefusal }
}

/** Define an operation whose typed inputs become dependencies automatically. */
export function defineCssOperation<
  const Inputs extends readonly VanityCssDataType[],
  const Output extends VanityCssDataType,
>(definition: VanityCssOperationDefinition<Inputs, Output>): (...inputs: OperationInputs<Inputs>) => VanityCssValue<string, Output> {
  return (...inputs) => {
    const dependencies = inputs.map((input, index) => {
      const node = createInputNode(input as VanityCssInput, definition.inputs[index])
      const expected = definition.inputs[index]!
      if (!isCompatibleType(expected, node.type))
        throwTypeMismatch(`operation input ${index + 1}`, expected, node.type)
      return node
    })

    return new ExpressionValue(createPluginNode({
      type: definition.output,
      extension: definition.extension,
      dependencies,
      requirements: definition.requirements,
      source: definition.source,
      serialize: context => definition.serialize(context, ...inputs),
      fallback: definition.fallback ? getNode(definition.fallback(...inputs)) : undefined,
      fold: definition.fold
        ? (context) => {
            const folded = definition.fold!(context, ...inputs)
            return 'preserve' in folded
              ? { kind: 'preserve', reason: folded.preserve }
              : { kind: 'folded', node: getNode(folded) }
          }
        : undefined,
    }))
  }
}

function isRecipe(value: unknown): value is VanityCssValueRecipe {
  return typeof value === 'object' && value !== null && 'serialize' in value
    && typeof (value as VanityCssValueRecipe).serialize === 'function'
}

function isCompatibleType(expected: VanityCssDataType, actual: VanityCssDataType): boolean {
  if (expected === actual || expected === 'unknown' || actual === 'unknown')
    return true
  if (expected === 'number' && actual === 'integer')
    return true
  if (expected === 'number-percentage')
    return actual === 'number' || actual === 'integer' || actual === 'percentage'
  if (expected === 'length-percentage')
    return actual === 'length' || actual === 'percentage'
  return false
}

function throwTypeMismatch(where: string, expected: VanityCssDataType, actual: VanityCssDataType): never {
  throw new TypeError(`[vanity] ${where} expected <${expected}> but received <${actual}>`)
}
