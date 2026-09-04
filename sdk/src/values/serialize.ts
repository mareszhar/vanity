/** Authoring-side CSS serialization with the full diagnostic contract. */

import type { VanityCssInput } from './types'
import { throwValueError } from './error'
import { isCssValue } from './types'

/** Serialize a self-contained value without losing references. */
export function serializeCssText(value: VanityCssInput): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throwValueError(
        'VANITY_CSS_INVALID_VALUE',
        `a CSS number must be finite; received ${value}`,
        'value',
        'pass a finite number',
      )
    }

    return String(Object.is(value, -0) ? 0 : value)
  }

  if (typeof value === 'string') {
    if (value.trim().length === 0) {
      throwValueError(
        'VANITY_CSS_INVALID_VALUE',
        'a CSS value cannot be empty',
        'value',
        'provide non-empty CSS text',
      )
    }

    return value
  }

  if (isCssValue(value))
    return value.css

  return 'var' in value ? value.var : String(value)
}
