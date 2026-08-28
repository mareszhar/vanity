/**
 * The application auto-import registry is deliberately separate from both
 * the compiler and the framework adapters. The adapters consume this small
 * projection; they never need to load the Vue implementation merely to know
 * which module names a preset targets.
 */

export type VanityRuntimeAutoImportPresetName = 'core' | 'vue'

export interface VanityRuntimeAutoImportPreset {
  readonly from: string
  readonly imports: readonly string[]
}

type ExportName<Module> = Extract<keyof Module, string>
interface CheckedPreset<Names extends string> {
  readonly from: string
  readonly imports: readonly Names[]
}

// These checks bind the curated policy to the real value exports without
// creating runtime imports from either implementation entrypoint.
const core = {
  from: '@mszr/vanity/runtime',
  imports: ['ports', 'setCustomProperties', 'setCustomProperty'],
} as const satisfies CheckedPreset<ExportName<typeof import('../runtime')>>

const vue = {
  from: '@mszr/vanity/vue',
  imports: ['propsOf', 'useAnatomy', 'usePorts'],
} as const satisfies CheckedPreset<ExportName<typeof import('../vue')>>

/** The framework-agnostic runtime group used by `app.runtimeAutoImports`. */
export const vanityCoreAutoImports = [core] as const

/** The Vue runtime group used by `app.runtimeAutoImports`. */
export const vanityVueAutoImports = [vue] as const

/** All built-in application runtime groups, keyed by their config name. */
export const vanityRuntimeAutoImportPresets: Record<VanityRuntimeAutoImportPresetName, readonly VanityRuntimeAutoImportPreset[]> = {
  core: vanityCoreAutoImports,
  vue: vanityVueAutoImports,
}
