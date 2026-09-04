/** Browser-safe serialization for runtime token fallbacks. */

import { isCssValue } from '../values/types'
import { createVanityRuntimeError } from './contract'

/** Serialize a runtime fallback without importing authoring diagnostics. */
export function serializeRuntimeCssText(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw createVanityRuntimeError({
        code: 'VANITY_RUNTIME_INVALID_VALUE',
        message: `a runtime CSS number must be finite; received ${value}`,
        path: ['value'],
        fix: 'pass a finite number',
      })
    }

    return String(Object.is(value, -0) ? 0 : value)
  }

  if (typeof value === 'string') {
    if (value.trim().length === 0) {
      throw createVanityRuntimeError({
        code: 'VANITY_RUNTIME_INVALID_VALUE',
        message: 'a runtime CSS value cannot be empty',
        path: ['value'],
        fix: 'provide non-empty CSS text',
      })
    }

    return value
  }

  if (isCssValue(value))
    return value.css

  if ((typeof value === 'object' || typeof value === 'function') && value !== null && 'var' in value)
    return String(value.var)

  return String(value)
}
