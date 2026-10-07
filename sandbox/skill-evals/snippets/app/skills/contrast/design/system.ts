import { createSystem } from '@mszr/vanity'
import { accentAt } from './accent.ts'

/*
 * The system the contrast test in vanity-system/references/color.md checks: a
 * live hue seed, an accent built by the shared formula, and its `legibleOn` pair.
 */

const open = createSystem()

const color = open.defineTokens()
  .add('hue', { val: 265, mutable: true, register: true })
  .add(m => ({ accent: accentAt(open, m.hue) }))
  .add(m => ({ onAccent: open.legibleOn(m.accent) }))

export const ds = open.addTokens({ color }).consolidate({ prefix: 'contrast' })
