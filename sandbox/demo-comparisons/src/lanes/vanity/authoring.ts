/**
 * The comparison lane keeps its locked system in `system.ts` and exposes the
 * small authoring barrel consumed by its `*.css.ts` modules. `cls` is the
 * local shorthand for the canonical `ds.class` member.
 */
import { ds } from './system'

export { ds }

export const {
  calc,
  class: cls,
  percent,
  port,
  recipe,
  t,
} = ds
