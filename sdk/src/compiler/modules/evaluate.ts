/** Compiler module evaluation and substrate CSS capture. */

import type { VanityIdentifierMode } from '../../config'
import type { VanityInspectRecord } from '../../introspect/records'
import type { VanityVanillaExtractCapture } from '../../substrate'
import { createRequire } from 'node:module'
import { dirname, posix } from 'node:path'
import { clearDiagnosticSources } from '../../diagnostics'
import { collectInspection } from '../../introspect/records'
import { substrate } from '../../substrate'
import { normalizePath } from '../core/path'

// ─── Evaluation ──────────────────────────────────────────────────────────────

export interface EvaluatedStyleModule {
  exports: Record<string, unknown>
  /** Serialized file scope → transformed CSS, in evaluation order. */
  cssByFileScope: Map<string, string>
  unusedCompositionRegex: RegExp | null
  /** What the evaluation recorded for the manifest ([introspect/records.ts]). */
  records: VanityInspectRecord[]
}
/**
 * Run the bundle against the css adapter and transform what it emitted —
 * the same collection contract as the substrate's `processVanillaFile`,
 * evaluated in-process. The adapter is module-global substrate state, but
 * evaluation and transformation are fully synchronous, so concurrent
 * `transform` hooks cannot interleave inside the bound window.
 */
export function evaluateStyleModule(
  source: string,
  filePath: string,
  identOption: VanityIdentifierMode,
  externalModules: ReadonlyMap<string, Record<string, unknown>> = new Map(),
): EvaluatedStyleModule {
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

  substrate.backend.installCapture(capture)

  const cssByFileScope = new Map<string, string>()

  try {
    const { result: exports, records } = collectInspection(() =>
      // CommonJS bundling hoists dependency requires before vanilla-extract's
      // source-level file-scope prologue. Keep those dependencies in the same
      // style evaluation scope so an authoring barrel can safely read bound
      // helpers such as `ds.t` while it is initialized.
      substrate.modules.runInFileScope({ filePath }, () => executeBundle(source, filePath, externalModules)))

    for (const [serializedFileScope, cssObjs] of cssObjsByFileScope) {
      const css = substrate.modules.transformStyleModule({
        cssObjects: cssObjs,
        localClassNames: [...localClassNames],
        composedClassLists,
      }).css

      cssByFileScope.set(serializedFileScope, css)
    }

    const unusedCompositions = composedClassLists
      .filter(({ identifier }) => !usedCompositions.has(identifier))
      .map(({ identifier }) => identifier)

    return {
      exports,
      cssByFileScope,
      unusedCompositionRegex: unusedCompositions.length > 0
        ? new RegExp(`(${unusedCompositions.join('|')})\\s`, 'g')
        : null,
      records,
    }
  }
  finally {
    substrate.backend.removeCapture()
  }
}

/** Execute the CommonJS bundle; externals are absolute paths, so any `require` works. */
export function executeBundle(
  source: string,
  filePath: string,
  externalModules: ReadonlyMap<string, Record<string, unknown>> = new Map(),
): Record<string, unknown> {
  clearDiagnosticSources()
  const module = { exports: {} as Record<string, unknown> }
  const nativeRequire = createRequire(filePath)
  const requireScoped = (id: string): unknown =>
    externalModules.has(id) ? externalModules.get(id) : nativeRequire(id)

  // eslint-disable-next-line no-new-func
  const run = new Function('require', 'module', 'exports', '__filename', '__dirname', source)
  run(requireScoped, module, module.exports, filePath, dirname(filePath))

  return module.exports
}
