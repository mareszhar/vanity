import type { VanityDiagnosticCode } from '../diagnostics'
import { VanityError } from '../diagnostics'

/** Raise one structured authoring or value-boundary failure. */
export function throwValueError(
  code: Extract<VanityDiagnosticCode, 'VANITY_CSS_INVALID_VALUE' | 'VANITY_VALUE_INVALID'>,
  message: string,
  path: string | readonly string[],
  fix: string,
): never {
  throw new VanityError({ code, message, path, fix })
}
