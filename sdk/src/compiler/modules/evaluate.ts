/** Compiler module evaluation and substrate CSS capture. */

import type { VanityIdentifierMode } from '../../config'
import type { VanityInspectRecord } from '../../introspect/records'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { clearDiagnosticSources } from '../../diagnostics'
import { collectInspection } from '../../introspect/records'
import { substrate } from '../../substrate'
import { createStyleCssCapture, getUnusedCompositionRegex } from './capture'

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
  const captured = createStyleCssCapture(identOption)

  substrate.backend.installCapture(captured.capture)

  const cssByFileScope = new Map<string, string>()

  try {
    const { result: exports, records } = collectInspection(() =>
      // CommonJS bundling hoists dependency requires before vanilla-extract's
      // source-level file-scope prologue. Keep those dependencies in the same
      // style evaluation scope so an authoring barrel can safely read bound
      // helpers such as `ds.t` while it is initialized.
      substrate.modules.runInFileScope({ filePath }, () => executeBundle(source, filePath, externalModules)))

    for (const [serializedFileScope, cssObjs] of captured.cssObjsByFileScope) {
      const css = substrate.modules.transformStyleModule({
        cssObjects: cssObjs,
        localClassNames: [...captured.localClassNames],
        composedClassLists: captured.composedClassLists,
      }).css

      cssByFileScope.set(serializedFileScope, css)
    }

    return {
      exports,
      cssByFileScope,
      unusedCompositionRegex: getUnusedCompositionRegex(captured),
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
