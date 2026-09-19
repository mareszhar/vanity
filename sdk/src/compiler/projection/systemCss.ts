/** Compiler projection from an evaluated system contract to one CSS artifact. */

import type { VanityIdentifierMode } from '../../config'
import type { VanityInspectRecord } from '../../introspect/records'
import type { VanityEmissionScope, VanityInProcessSystemContract } from '../../system/contract'
import { collectInspection } from '../../introspect/records'
import { substrate } from '../../substrate'
import { VANITY_RETRY_SYSTEM_EMISSION } from '../../system/contract'
import { createStyleCssCapture } from '../modules/capture'

export interface SystemCssProjection {
  /** Transformed CSS bytes for the complete system artifact. */
  readonly css: string
  /** Inspection records produced while the system artifact was emitted. */
  readonly records: VanityInspectRecord[]
}

/**
 * Emit one complete configured-system CSS candidate synchronously.
 *
 * The explicit scope is compiler ownership, not authored provenance. It lets
 * a precompiled or outside-root system emit without borrowing the importing
 * style module's capture. The candidate is transformed before the caller can
 * publish it, and every capture is removed even when authoring or CSS
 * transformation throws.
 */
export function emitSystemCss(
  contract: VanityInProcessSystemContract,
  scope: VanityEmissionScope,
  identOption: VanityIdentifierMode,
): SystemCssProjection {
  const captured = createStyleCssCapture(identOption)
  let captureInstalled = false

  try {
    substrate.backend.installCapture(captured.capture)
    captureInstalled = true
    const { records } = collectInspection(() => contract.emit(scope))
    // Keep the shared capture's composition callbacks intact for semantic
    // parity, but do not apply the unused-composition filter here: that filter
    // removes unused JavaScript exports during style-module serialization, not
    // CSS rules from a system artifact.
    const css = [...captured.cssObjsByFileScope.values()]
      .map(cssObjects => substrate.modules.transformStyleModule({
        cssObjects,
        localClassNames: [...captured.localClassNames],
        composedClassLists: captured.composedClassLists,
      }).css)
      .filter(Boolean)
      .join('\n')

    return { css, records }
  }
  catch (error) {
    // `emit()` latches only after its own synchronous backend pass. If the
    // capture transforms or inspection projection rejects those bytes, reset
    // that compiler-only latch so the next candidate can emit from scratch.
    contract[VANITY_RETRY_SYSTEM_EMISSION]?.()
    throw error
  }
  finally {
    if (captureInstalled)
      substrate.backend.removeCapture()
  }
}
