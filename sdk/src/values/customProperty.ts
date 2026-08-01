/** Typed handles for custom properties owned outside the declared system. */

import type {
  VanityCssDataType,
  VanityCssInput,
  VanityCssValue,
  VanityDataTypeOf,
} from './types'
import { ExpressionValue, inputNode, varNode } from './protocol'

export interface VanityCustomPropertyOptions<Type extends VanityCssDataType> {
  readonly type: Type
}

export interface VanityCustomProperty<Type extends VanityCssDataType = 'unknown'> {
  readonly $name: `--${string}`
  $var: {
    (): VanityCssValue<string, Type>
    <const Fallback extends VanityCssInput>(fallback: Fallback): VanityCssValue<
      string,
      Type extends 'unknown' ? VanityDataTypeOf<Fallback> : Type
    >
  }
}

export function customProperty(name: `--${string}`): VanityCustomProperty<'unknown'>
export function customProperty<const Type extends VanityCssDataType>(
  name: `--${string}`,
  options: VanityCustomPropertyOptions<Type>,
): VanityCustomProperty<Type>
export function customProperty(
  name: `--${string}`,
  options?: VanityCustomPropertyOptions<VanityCssDataType>,
): VanityCustomProperty<VanityCssDataType> {
  validateName(name)
  const declaredType = options?.type ?? 'unknown'

  const $var = (fallback?: VanityCssInput): VanityCssValue => {
    const fallbackNode = fallback === undefined ? undefined : inputNode(fallback)
    const resultType = declaredType === 'unknown' && fallbackNode ? fallbackNode.type : declaredType

    if (fallbackNode && !compatibleFallback(declaredType, fallbackNode.type)) {
      throw new TypeError(
        `[vanity] fallback for ${name} is <${fallbackNode.type}> but the custom property is <${declaredType}>`,
      )
    }

    return new ExpressionValue(varNode({
      type: resultType,
      reference: {
        kind: 'custom-property',
        name,
        type: declaredType,
        resolution: 'self',
      },
      fallback: fallbackNode,
      source: { helper: 'customProperty.$var', authored: name },
    }))
  }

  return Object.freeze({ $name: name, $var }) as VanityCustomProperty<VanityCssDataType>
}

function validateName(name: string): void {
  if (!isDashedIdent(name)) {
    throw new TypeError(
      `[vanity] '${name}' is not a valid CSS custom-property name; expected a dashed-ident beginning with --`,
    )
  }
}

/** CSS Syntax's ident-sequence grammar, after the required `--` prefix. */
function isDashedIdent(value: string): boolean {
  if (!value.startsWith('--') || value.length === 2)
    return false

  for (let index = 2; index < value.length;) {
    const point = value.codePointAt(index)!

    if (point === 0x5C) {
      const escaped = value.codePointAt(index + 1)
      if (escaped === undefined || escaped === 0xA || escaped === 0xC || escaped === 0xD)
        return false

      index += 1
      let hexDigits = 0
      while (index < value.length && hexDigits < 6 && /[\da-f]/i.test(value[index]!)) {
        index += 1
        hexDigits += 1
      }
      if (hexDigits > 0 && /[\t\n\f\r ]/.test(value[index] ?? '')) {
        if (value[index] === '\r' && value[index + 1] === '\n')
          index += 1
        index += 1
      }
      else if (hexDigits === 0) {
        index += escaped > 0xFFFF ? 2 : 1
      }
      continue
    }

    const ident = point >= 0x80
      || point === 0x2D
      || point === 0x5F
      || (point >= 0x30 && point <= 0x39)
      || (point >= 0x41 && point <= 0x5A)
      || (point >= 0x61 && point <= 0x7A)
    if (!ident)
      return false
    index += point > 0xFFFF ? 2 : 1
  }

  return true
}

function compatibleFallback(expected: VanityCssDataType, actual: VanityCssDataType): boolean {
  if (expected === 'unknown' || actual === 'unknown' || expected === actual)
    return true
  if (expected === 'number' && actual === 'integer')
    return true
  if (expected === 'number-percentage')
    return actual === 'number' || actual === 'integer' || actual === 'percentage'
  if (expected === 'length-percentage')
    return actual === 'length' || actual === 'percentage'
  return false
}
