import type { VanityRuntimeHandle } from './handle'

export interface VanityTokenFoldEvidence {
  readonly status: 'folded' | 'preserved' | 'unavailable'
  readonly val?: string | number
  readonly reason?: string
}

const TOKEN_FOLD_EVIDENCE = Symbol.for('vanity.testingFoldEvidence')

interface FoldEvidenceScope {
  [TOKEN_FOLD_EVIDENCE]?: WeakMap<
    VanityRuntimeHandle,
    () => VanityTokenFoldEvidence
  >
}

function foldEvidence(): NonNullable<FoldEvidenceScope[typeof TOKEN_FOLD_EVIDENCE]> {
  const scope = globalThis as FoldEvidenceScope
  return scope[TOKEN_FOLD_EVIDENCE]
    ??= new WeakMap<VanityRuntimeHandle, () => VanityTokenFoldEvidence>()
}

/**
 * Retain a lazy build-plane fold reader without exporting the token graph.
 *
 * @internal
 */
export function rememberTokenFold(
  handle: VanityRuntimeHandle,
  read: () => VanityTokenFoldEvidence,
): void {
  foldEvidence().set(handle, read)
}

/**
 * Read build-plane evidence for the public testing kit.
 *
 * @internal
 */
export function tokenFoldOf(handle: VanityRuntimeHandle): VanityTokenFoldEvidence {
  const read = foldEvidence().get(handle)
  if (!read) {
    throw new TypeError(
      '[vanity] foldOf() needs a token from a system consolidated in this process; '
      + 'restored app-plane handles no longer carry build-time fold evidence',
    )
  }
  return read()
}
