/**
 * Low-level application auto-import projections for custom host adapters.
 * Most applications should use `autoImports.app` on the Vite, Nuxt, or WXT
 * integration instead of importing these descriptors directly.
 */

export type {
  VanityAppAutoImportPreset,
  VanityAppAutoImportPresetName,
} from './compiler/auto-imports/applicationImports'
export {
  vanityAppAutoImportPresets,
  vanityCoreAutoImports,
  vanityVueAutoImports,
} from './compiler/auto-imports/applicationImports'
