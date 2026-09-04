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
import { throwValueError } from './error'
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

/** Serializer recipe for a value that remains opaque to the core value protocol. */
export interface VanityCssValueRecipe<Type extends VanityCssDataType = VanityCssDataType> {
  /** Values whose references/resolution requirements this node carries. */
  readonly dependencies?: readonly (VanityValue | string | number)[]
  /** CSS features required to serialize this value. */
  readonly requirements?: readonly VanityCssFeature[]
  /** Source location or authoring label for diagnostics. */
  readonly source?: VanitySource
  /** Portable fallback value used when the extension cannot serialize. */
  readonly fallback?: VanityValue<Type>
  /** Serialize this value with the owning system's policy and reference context. */
  serialize: (context: VanitySerializeContext) => string
  /** Fold this value to core semantics when the target supports it. */
  fold?: (context: VanityFoldContext) => VanityValue<Type> | { readonly preserve: VanityFoldRefusal }
}

/** Definition used by an extension author to create one typed CSS value. */
export interface VanityCssValueDefinition<
  Type extends VanityCssDataType,
  Args extends readonly unknown[],
> {
  /** CSS data type produced by the constructor. */
  readonly type: Type
  /** Required only when `create` returns extension-owned opaque semantics. */
  readonly extension?: VanityExtensionIdentity
  /** Create a core value or an extension-owned serializer recipe. */
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

    if (!isRecipe(result)) {
      throwValueError(
        'VANITY_CSS_INVALID_VALUE',
        'defineCssValue().create() must return a vanity value or serializer recipe',
        'definition.create',
        'return a Vanity value or an object with a serialize() function',
      )
    }

    if (!definition.extension) {
      throwValueError(
        'VANITY_VALUE_INVALID',
        'an anonymous CSS value extension cannot own opaque serialization',
        'definition.extension',
        'return a value lowered to core IR or provide a stable extension { id, version }',
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

/** Definition used by an extension author to create a typed multi-input CSS operation. */
export interface VanityCssOperationDefinition<
  Inputs extends readonly VanityCssDataType[],
  Output extends VanityCssDataType,
> {
  /** CSS data types accepted by the operation, in argument order. */
  readonly inputs: Inputs
  /** CSS data type produced by the operation. */
  readonly output: Output
  /** Stable extension identity that owns the operation's serializer. */
  readonly extension: VanityExtensionIdentity
  /** CSS features required to serialize this operation. */
  readonly requirements?: readonly VanityCssFeature[]
  /** Source location or authoring label for diagnostics. */
  readonly source?: VanitySource
  /** Core fallback used when the extension cannot serialize. */
  readonly fallback?: (...inputs: OperationInputs<Inputs>) => VanityValue<Output>
  /** Serialize the operation with its typed inputs. */
  serialize: (context: VanitySerializeContext, ...inputs: OperationInputs<Inputs>) => string
  /** Fold the operation to core semantics when supported by the target. */
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
  throwValueError(
    'VANITY_CSS_INVALID_VALUE',
    `${where} expected <${expected}> but received <${actual}>`,
    'value',
    `provide a value compatible with <${expected}>`,
  )
}
