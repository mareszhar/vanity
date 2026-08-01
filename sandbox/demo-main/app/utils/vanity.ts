/**
 * The Nuxt auto-import bridge: re-exporting from here makes `ds` (and the font
 * stacks) available everywhere in `app/` without a manual import, and pulls the
 * system's token CSS and the global reset into the build graph.
 */

export { typefaces } from '../assets/styles/design/base.css.ts'
export type { Typeface } from '../assets/styles/design/base.css.ts'
export { ds } from '../assets/styles/design/system'
