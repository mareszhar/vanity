import type { VanityInternalTokenHandle } from './handle'

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
export function tokenFoldOf(handle: VanityInternalTokenHandle): VanityTokenFoldEvidence {
  const read = foldEvidence().get(handle)
  if (!read) {
    throw new TypeError(
      '[vanity] foldOf() needs a token from a system consolidated in this process; '
      + 'restored application handles no longer carry build-time fold evidence',
    )
  }
  return read()
}
