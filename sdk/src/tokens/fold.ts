import type { VanityInternalTokenHandle } from './handle'
import { VanityError } from '../diagnostics'

export interface VanityTokenFoldEvidence {
  readonly status: 'folded' | 'preserved' | 'unavailable'
  readonly val?: string | number
  readonly reason?: string
}

const TOKEN_FOLD_EVIDENCE = Symbol.for('vanity.testingFoldEvidence')

interface FoldEvidenceScope {
  [TOKEN_FOLD_EVIDENCE]?: WeakMap<
    VanityInternalTokenHandle,
    () => VanityTokenFoldEvidence
  >
}

function foldEvidence(): NonNullable<FoldEvidenceScope[typeof TOKEN_FOLD_EVIDENCE]> {
  const scope = globalThis as FoldEvidenceScope
  return scope[TOKEN_FOLD_EVIDENCE]
    ??= new WeakMap<VanityInternalTokenHandle, () => VanityTokenFoldEvidence>()
}

/**
 * Retain a lazy build-time fold reader without exporting resolved token data.
 *
 * @internal
 */
export function rememberTokenFold(
  handle: VanityInternalTokenHandle,
  read: () => VanityTokenFoldEvidence,
): void {
  foldEvidence().set(handle, read)
}

/**
 * Read build-time evidence for the public testing kit.
 *
 * @internal
 */
export function readTokenFoldEvidence(handle: VanityInternalTokenHandle): VanityTokenFoldEvidence {
  const read = foldEvidence().get(handle)
  if (!read) {
    throw new VanityError({
      code: 'VANITY_TESTING_INVALID_INPUT',
      message: 'foldOf() needs a token from a system consolidated in this process',
      detail: ['restored application handles no longer carry build-time fold evidence'],
      path: ['token'],
      fix: 'pass a token from a system consolidated in the current process',
    })
  }
  return read()
}
