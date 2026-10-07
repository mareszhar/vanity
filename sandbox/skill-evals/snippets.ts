/**
 * Where each code block in `sdk/skills/` is compiled by `pnpm run skills:eval verify`.
 *
 * A block is addressed as `<skill file>#<n>` (the nth fenced block of a TypeScript,
 * Vue, or Pug kind) and checked against `startsWith`, so a reordered or rewritten
 * block is reported instead of silently compiling something else. The block text is
 * copied verbatim; `before` and `after` supply only the context the block assumes
 * (imports, an `open` system, a wrapping function or component). Entries that share
 * a `file` are concatenated in order. `run` executes the file after the build, which
 * consolidates any system it defines; `test` runs it with Vitest after the build.
 *
 * Blocks absent from this list are reported as unverified, with `skipped` reasons
 * for the ones that need a toolchain the fixture doesn't have.
 */

export interface VanitySkillSnippet {
  readonly block: string
  readonly startsWith: string
  readonly file: string
  readonly before?: string
  readonly after?: string
  readonly run?: boolean
  readonly test?: boolean
}

const open = `import { createSystem } from '@mszr/vanity'\n\nconst open = createSystem()\n`
const densityOpen = `import { createSystem, data } from '@mszr/vanity'\n\nconst open = createSystem().addAxis('density', { modes: { compact: data('density', 'compact'), comfortable: '&' }, default: 'comfortable' })\n`

export const skillSnippets: readonly VanitySkillSnippet[] = [
  // vanity-styling
  { block: 'vanity-styling/SKILL.md#1', startsWith: '// components/UiCard/UiCard.css.ts', file: 'app/skills/UiCard/UiCard.css.ts' },
  { block: 'vanity-styling/SKILL.md#2', startsWith: '<template lang="pug">', file: 'app/skills/UiCard/UiCard.vue' },
  { block: 'vanity-styling/SKILL.md#3', startsWith: 'export const row = cls([', file: 'app/skills/row.css.ts', before: `import { focusRing } from '../design/mixins.ts'\n\n` },
  { block: 'vanity-styling/SKILL.md#4', startsWith: '// Progress.css.ts', file: 'app/skills/Progress/Progress.css.ts' },
  { block: 'vanity-styling/SKILL.md#5', startsWith: '<template lang="pug">', file: 'app/skills/Progress/Progress.vue' },
  { block: 'vanity-styling/references/components.md#1', startsWith: 'const pad = port(t.space.md)', file: 'app/skills/UiButton/UiButton.css.ts' },
  { block: 'vanity-styling/references/components.md#2', startsWith: '<template lang="pug">', file: 'app/skills/UiButton/UiButton.vue' },
  { block: 'vanity-styling/references/components.md#3', startsWith: 'export const disclosure = anatomy({', file: 'app/skills/UiDisclosure/UiDisclosure.css.ts' },
  { block: 'vanity-styling/references/components.md#4', startsWith: '<template lang="pug">', file: 'app/skills/UiDisclosure/UiDisclosure.vue' },
  { block: 'vanity-styling/references/components.md#5', startsWith: '// Toolbar.css.ts', file: 'app/skills/Toolbar/Toolbar.css.ts' },
  { block: 'vanity-styling/references/components.md#6', startsWith: 'export const box = ds.atoms({', file: 'app/skills/atoms.css.ts' },
  { block: 'vanity-styling/references/dynamic-values.md#1', startsWith: '// Meter.css.ts', file: 'app/skills/Meter/Meter.css.ts' },
  { block: 'vanity-styling/references/dynamic-values.md#2', startsWith: '<template lang="pug">', file: 'app/skills/Meter/Meter.vue' },
  { block: 'vanity-styling/references/dynamic-values.md#3', startsWith: 'export const dangerZone = cls({', file: 'app/skills/zones.css.ts' },
  { block: 'vanity-styling/references/dynamic-values.md#4', startsWith: '<template lang="pug">', file: 'app/skills/Option/Option.vue', after: `\n<script setup lang="ts">\nimport * as s from './option.css.ts'\n\ndefineProps<{ selected?: boolean, disabled?: boolean }>()\n</script>\n` },
  { block: 'vanity-styling/references/dynamic-values.md#5', startsWith: 'export const option = cls({', file: 'app/skills/Option/option.css.ts' },
  { block: 'vanity-styling/references/patterns.md#1', startsWith: '// design/mixins.ts', file: 'app/design/mixins.ts' },
  { block: 'vanity-styling/references/patterns.md#2', startsWith: '// A vertical stack', file: 'app/skills/layout.css.ts' },
  { block: 'vanity-styling/references/patterns.md#3', startsWith: 'export const panel = cls(', file: 'app/skills/panel.css.ts' },
  { block: 'vanity-styling/references/patterns.md#4', startsWith: 'export const row = cls({', file: 'app/skills/motion.css.ts' },
  { block: 'vanity-styling/references/patterns.md#5', startsWith: 'export const toast = cls({', file: 'app/skills/toast.css.ts' },
  { block: 'vanity-styling/references/patterns.md#6', startsWith: 'const spin = keyframes(', file: 'app/skills/Loading/Loading.css.ts' },
  { block: 'vanity-styling/references/patterns.md#7', startsWith: 'button(:class="s.button(props)"', file: 'app/skills/Loading/Loading.vue', before: `<template lang="pug">\n`, after: `</template>\n\n<script setup lang="ts">\nimport * as s from './Loading.css.ts'\n\nconst props = defineProps({ ...propsOf(s.button), disabled: Boolean })\n</script>\n` },
  { block: 'vanity-styling/references/patterns.md#8', startsWith: 'export const item = recipe({', file: 'app/skills/status.css.ts' },
  { block: 'vanity-styling/references/patterns.md#9', startsWith: 'export const sheet = cls(', file: 'app/skills/sheet.css.ts' },
  { block: 'vanity-styling/references/patterns.md#10', startsWith: '// design/base.css.ts', file: 'app/skills/base.css.ts' },

  // vanity-system
  { block: 'vanity-system/SKILL.md#1', startsWith: `import { createSystem, media } from '@mszr/vanity'`, file: 'app/skills/systems/shape.ts', run: true },
  { block: 'vanity-system/SKILL.md#2', startsWith: 'const px = (value: number)', file: 'app/skills/systems/tiers.ts', before: open, after: `\nexport const tiers = open.addTokens(tokens).consolidate({ prefix: 'tiers' })\n`, run: true },
  { block: 'vanity-system/SKILL.md#3', startsWith: 'open.tdef({ val: open.length.px(12)', file: 'app/skills/systems/traits.ts', before: densityOpen, run: true },
  { block: 'vanity-system/SKILL.md#4', startsWith: 'import { container, media, selector, supports }', file: 'app/skills/systems/conditions.ts', before: open, after: `\nexport const conditions = open.consolidate({ prefix: 'conditions' })\n`, run: true },
  { block: 'vanity-system/SKILL.md#5', startsWith: `import { colorSchemes, data } from '@mszr/vanity'`, file: 'app/skills/systems/axes.ts', before: `import { createSystem } from '@mszr/vanity'\n`, after: `\nexport const axes = open.addTokens(tokens).consolidate({ prefix: 'axes' })\n`, run: true },
  { block: 'vanity-system/SKILL.md#6', startsWith: 'const palette = open.defineTokens()', file: 'app/skills/systems/palette.ts', before: open, after: `\nexport const palette6 = open.addTokens({ color: palette }).consolidate({ prefix: 'palette' })\n`, run: true },
  { block: 'vanity-system/SKILL.md#7', startsWith: '// app code (a composable)', file: 'app/skills/runtimeIntro.ts', before: `export function useRuntimeIntro() {\n`, after: `}\n` },
  { block: 'vanity-system/references/color.md#1', startsWith: 'const palette = open.defineTokens()', file: 'app/skills/systems/derive.ts', before: open, after: `\nexport const derive = open.addTokens({ color: palette }).consolidate({ prefix: 'derive' })\n`, run: true },
  { block: 'vanity-system/references/color.md#2', startsWith: '// design/accent.ts', file: 'app/skills/contrast/design/accent.ts' },
  { block: 'vanity-system/references/color.md#3', startsWith: '// accent.test.ts', file: 'app/skills/contrast/accent.test.ts', test: true },
  { block: 'vanity-system/references/color.md#4', startsWith: `import { mapRecord } from '@mszr/vanity'`, file: 'app/skills/systems/scale.ts', before: open, after: `\nexport const scale = open.addTokens(tokens).consolidate({ prefix: 'scale' })\nexport const base = scale.t.blue.base\n`, run: true },
  { block: 'vanity-system/references/extending.md#1', startsWith: `import { createSystem, definePlugin } from '@mszr/vanity'`, file: 'app/skills/systems/plugin.ts', after: `\nexport const plugin = open.consolidate({ prefix: 'plugin' })\nexport const card = plugin.elevate.card()\n`, run: true },
  { block: 'vanity-system/references/extending.md#2', startsWith: 'createSystem({', file: 'app/skills/systems/policies.ts', before: `import { createSystem } from '@mszr/vanity'\n\n`, run: true },
  { block: 'vanity-system/references/runtime.md#1', startsWith: 'const rt = ds.runtime()', file: 'app/skills/runtimeBasics.ts', before: `export function useRuntimeBasics() {\n`, after: `}\n` },
  { block: 'vanity-system/references/runtime.md#2', startsWith: '// composables/designRuntime.ts', file: 'app/skills/designRuntime.ts' },
  { block: 'vanity-system/references/runtime.md#3', startsWith: '// composables/useDesignSettings.ts', file: 'app/skills/useDesignSettings.ts', before: `import { useDesignRuntime } from './designRuntime.ts'\n\n` },
  { block: 'vanity-system/references/runtime.md#5', startsWith: 'const seed = snapshotOf(', file: 'app/skills/useDesignSettings.ts', before: `\nexport function useRootProps(settings: Ref<DesignSettings>) {\n`, after: `  return rootProps\n}\n` },
  { block: 'vanity-system/references/runtime.md#4', startsWith: '// plugins/design-settings.client.ts', file: 'app/skills/design-settings.client.ts', before: `import type { DesignSettings } from './useDesignSettings.ts'\nimport { useDesignRuntime } from './designRuntime.ts'\nimport { snapshotOf } from './useDesignSettings.ts'\n\n` },
  { block: 'vanity-system/references/runtime.md#6', startsWith: '<template lang="pug">', file: 'app/skills/RootShell.vue', after: `\n<script setup lang="ts">\nimport { useDesignSettings, useRootProps } from './useDesignSettings.ts'\n\nconst rootProps = useRootProps(useDesignSettings().settings)\n</script>\n` },
  { block: 'vanity-system/references/theming.md#1', startsWith: `import { colorSchemes, createSystem, data } from '@mszr/vanity'`, file: 'app/skills/systems/theming.ts', before: `import { media } from '@mszr/vanity'\n` },
  { block: 'vanity-system/references/theming.md#2', startsWith: 'const tokens = open.defineTokens({', file: 'app/skills/systems/theming.ts' },
  { block: 'vanity-system/references/theming.md#4', startsWith: 'const widget = open.defineTokens(', file: 'app/skills/systems/theming.ts', after: `\nexport const theming = open.addTokens(tokens).addTokens({ widget }).consolidate({ prefix: 'theming' })\n`, run: true },
  { block: 'vanity-system/references/theming.md#3', startsWith: `const open = createSystem().addAxis('skin'`, file: 'app/skills/systems/skins.ts', before: `import { createSystem, data } from '@mszr/vanity'\n\n`, after: `\nexport const skins = open.addTokens(character).consolidate({ prefix: 'skins' })\n`, run: true },

  // vanity-setup
  { block: 'vanity-setup/SKILL.md#3', startsWith: '// vanity.config.ts', file: 'vanity.config.ts' },
  { block: 'vanity-setup/SKILL.md#5', startsWith: '// app/design/authoring.ts', file: 'app/design/authoring.ts' },
  { block: 'vanity-setup/SKILL.md#6', startsWith: '<!-- app/app.vue', file: 'app/app.vue', after: `\n<template lang="pug">\nNuxtPage\n</template>\n` },
  { block: 'vanity-setup/SKILL.md#7', startsWith: 'export default defineVanityConfig({', file: 'app/skills/layered.config.ts', before: `import { defineVanityConfig } from '@mszr/vanity/config'\n\n` },

  // vanity-tooling
  { block: 'vanity-tooling/SKILL.md#1', startsWith: `import { ds } from './design/system.ts'`, file: 'app/inspect.ts', run: true },
  { block: 'vanity-tooling/SKILL.md#3', startsWith: `import { readManifest } from '@mszr/vanity/cli'`, file: 'app/context.ts', before: `export {}\n\n` },
  { block: 'vanity-tooling/SKILL.md#5', startsWith: `import { emitOf, foldOf } from '@mszr/vanity/testing'`, file: 'app/tests/card.test.ts', test: true },
  { block: 'vanity-tooling/SKILL.md#4', startsWith: 'import { exportDesignTokens, importDesignTokens }', file: 'app/skills/dtcg.ts', before: `import { createSystem } from '@mszr/vanity'\n\ndeclare const json: unknown\n` },
]

/** Blocks deliberately left out, with the reason the gate reports. */
export const skippedSkillSnippets: Readonly<Record<string, string>> = {
  'vanity-setup/SKILL.md#4': 'a complete nuxt.config; the fixture keeps its own host options',
  'vanity-setup/references/monorepo.md#3': 'needs a multi-package workspace fixture',
  'vanity-setup/references/monorepo.md#4': 'needs a multi-package workspace fixture',
  'vanity-setup/references/monorepo.md#5': 'needs a multi-package workspace fixture',
  'vanity-setup/references/monorepo.md#6': 'needs a multi-package workspace fixture',
  'vanity-setup/references/monorepo.md#7': 'needs a multi-package workspace fixture',
  'vanity-setup/references/monorepo.md#8': 'needs a WXT fixture',
}
