/**
 * Low-level application auto-import projections for custom host adapters.
 * Most applications should use `app.runtimeAutoImports` on the Vite or Nuxt
 * integration instead of importing these descriptors directly.
 */

export type {
  VanityRuntimeAutoImportPreset,
  VanityRuntimeAutoImportPresetName,
} from './internal/appImports'
export {
  vanityCoreAutoImports,
  vanityRuntimeAutoImportPresets,
  vanityVueAutoImports,
} from './internal/appImports'
