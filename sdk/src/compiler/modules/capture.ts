/** Shared synchronous Vanilla Extract capture used by style and system CSS projection. */

import type { VanityIdentifierMode } from '../../config'
import type { VanityVanillaExtractCapture } from '../../substrate'
import { posix } from 'node:path'
import { substrate } from '../../substrate'
import { normalizePath } from '../core/path'

export interface CapturedStyleCss {
  readonly cssObjsByFileScope: Map<string, unknown[]>
  readonly localClassNames: Set<string>
  readonly composedClassLists: Array<{ identifier: string, classList: string }>
  readonly usedCompositions: Set<string>
  readonly capture: VanityVanillaExtractCapture
}

/** Return the substrate's deterministic filter for compositions never used by the bundle. */
export function getUnusedCompositionRegex(
  captured: Pick<CapturedStyleCss, 'composedClassLists' | 'usedCompositions'>,
): RegExp | null {
  const unused = captured.composedClassLists
    .filter(({ identifier }) => !captured.usedCompositions.has(identifier))
    .map(({ identifier }) => identifier)
  return unused.length === 0 ? null : new RegExp(`(${unused.join('|')})\\s`, 'g')
}

/**
 * Create the one capture policy shared by every compiler CSS projection.
 * Identifier callbacks and composition tracking must not drift between a
 * configured system artifact and a style-module artifact.
 */
export function createStyleCssCapture(identOption: VanityIdentifierMode): CapturedStyleCss {
  const cssObjsByFileScope = new Map<string, unknown[]>()
  const localClassNames = new Set<string>()
  const composedClassLists: Array<{ identifier: string, classList: string }> = []
  const usedCompositions = new Set<string>()

  const capture: VanityVanillaExtractCapture = {
    appendCss: (css, fileScope) => {
      const serializedFileScope = substrate.backend.serializeFileScope(fileScope)
      const cssObjs = cssObjsByFileScope.get(serializedFileScope) ?? []
      cssObjs.push(css)
      cssObjsByFileScope.set(serializedFileScope, cssObjs)
    },
    registerClassName: className => void localClassNames.add(className),
    registerComposition: composition => void composedClassLists.push(composition as { identifier: string, classList: string }),
    markCompositionUsed: identifier => void usedCompositions.add(identifier),
    // Vanity already injects the semantic declaration name. In debug mode,
    // prefer that exact name over vanilla-extract's `file_export` prefix;
    // when no declaration label exists, the `.css.ts` basename remains the
    // useful fallback. This keeps `button.css.ts` / `button` from surfacing as
    // the noisy `button_button` while retaining deterministic scoped hashes.
    getIdentOption: () => identOption === 'short'
      ? 'short'
      : ({ hash, debugId, filePath: scopedFile }: {
          hash: string
          debugId?: string
          filePath: string
          packageName?: string
        }) => {
          const fileLabel = posix.basename(normalizePath(scopedFile)).replace(/\.css\.[^.]+$/, '')
          const semanticLabel = (debugId ?? fileLabel)
            .replaceAll(/[^\w$-]+/g, '_')
            .replace(/^([^a-z_$])/, '_$1')
          return `${semanticLabel || 'style'}__${hash}`
        },
  }

  return {
    cssObjsByFileScope,
    localClassNames,
    composedClassLists,
    usedCompositions,
    capture,
  }
}
