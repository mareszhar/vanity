/**
 * Low-level application auto-import projections for custom host adapters.
 * Most applications should use `autoImports.app` on the Vite, Nuxt, or WXT
 * integration instead of importing these descriptors directly.
 */

export type {
  VanityAppAutoImportPreset,
  VanityAppAutoImportPresetName,
} from './internal/applicationImports'
export {
  vanityAppAutoImportPresets,
  vanityCoreAutoImports,
  vanityVueAutoImports,
} from './internal/applicationImports'
