/**
 * Framework-free browser runtime code. It
 * writes custom-property values and attributes — it never constructs CSS rules
 * ([patterns.md §1]).
 */

import type { VanityAtoms, VanityAtomsRuntime } from './atoms/types'
import type { VanityInternalTokenHandle } from './internal/handle'
import type { VanityPort, VanityPortBindingOptions, VanityPortMeta } from './ports/types'
import type { VanityAnatomy, VanityAnatomyRuntime, VanityRecipe, VanityRecipeRuntime } from './recipes/types'
import { createAtomsHandle } from './atoms/handle'
import { createHandle } from './internal/handle'
import { createPortHandle } from './ports/handle'
import { ports } from './ports/ports'
import { createAnatomyHandle, createRecipeHandle } from './recipes/handle'

export type { VanityAtomsRuntime } from './atoms/types'
export type { VanityPort, VanityPortBindingOptions, VanityPortMeta, VanityPortStyle, VanityPortValue } from './ports/types'
export type { VanityAnatomyRuntime, VanityRecipeRuntime } from './recipes/types'
export type { VanityAxisControl, VanityAxisControlRoot } from './system/axes'
export {
  restoreRuntimeControllerFactory,
  restoreRuntimeProps,
  restoreRuntimeReconciler,
  restoreRuntimeStyle,
  restoreSnapshotFrom,
  setCustomProperties,
  setCustomProperty,
} from './system/live'
export type {
  VanityCustomPropertyEntries,
  VanityCustomPropertyReference,
  VanityCustomPropertyTarget,
  VanityRuntimeAxes,
  VanityRuntimeController,
  VanityRuntimeControllerFactory,
  VanityRuntimeCycleOptions,
  VanityRuntimeDiagnostic,
  VanityRuntimeDiagnosticCode,
  VanityRuntimeInput,
  VanityRuntimeOptions,
  VanityRuntimeProps,
  VanityRuntimeQueryScope,
  VanityRuntimeReconciliation,
  VanityRuntimeRootContract,
  VanityRuntimeRootProps,
  VanityRuntimeSnapshotOverride,
  VanityRuntimeSnapshotV1,
  VanityRuntimeStyleDeclaration,
  VanityRuntimeStyles,
  VanityRuntimeTarget,
  VanityRuntimeTokens,
  VanitySnapshotFrom,
} from './system/live'

/** Merge port/style fragments, skipping falsy entries. Re-exported from core. */
export { ports }

/**
 * Restores a token handle when a style module's exports are serialized for app
 * code. Generated import target — not for hand-written code.
 */
export function restoreToken(meta: Parameters<typeof createHandle>[0]): VanityInternalTokenHandle {
  return createHandle(meta)
}

/**
 * Restores a port handle when a style module's exports are serialized for app
 * code. Generated import target — not for hand-written code.
 */
export function restorePort(meta: VanityPortMeta): VanityPort {
  return createPortHandle(meta)
}

/** Bind app/SSR validator implementations to a restored port without globals. */
export function bindPort<Port extends VanityPort>(port: Port, options: VanityPortBindingOptions): Port {
  return port.bind(options) as Port
}

/**
 * Restores a recipe handle from its serialized class table. Generated import
 * target — not for hand-written code.
 */
export function restoreRecipe(runtime: VanityRecipeRuntime): VanityRecipe<Record<string, unknown>> {
  return createRecipeHandle(runtime)
}

/**
 * Restores an anatomy handle from its serialized part-class tables. Generated
 * import target — not for hand-written code.
 */
export function restoreAnatomy(runtime: VanityAnatomyRuntime): VanityAnatomy<string, Record<string, unknown>> {
  return createAnatomyHandle(runtime)
}

/**
 * Restores an atoms handle from its serialized class tables. Runtime calls
 * resolve among precompiled classes; an unsafe value is redirected to a port.
 * Generated import target — not for hand-written code.
 */
export function restoreAtoms(runtime: VanityAtomsRuntime): VanityAtoms<Record<string, unknown>> {
  return createAtomsHandle(runtime)
}

/**
 * Restores a build-only style-authoring function as a throwing stub, so importing a
 * system style module from app code stays legal (`t`, override classes) while
 * calling `css`/`recipe`/`port` there receives a module-role misuse
 * diagnostic instead of silently doing nothing. Generated import target — not
 * for hand-written code.
 */
export function restoreStyleAuthoringStub(meta: { name: string }): () => never {
  return () => {
    throw new Error(
      `[vanity] VANITY_STYLE_MODULE_MISUSE: ${meta.name} belongs in a *.css.ts style module. `
      + 'Use ds.runtime() in application modules, or consume serialized style exports.',
    )
  }
}
