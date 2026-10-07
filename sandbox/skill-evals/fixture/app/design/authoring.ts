// The authoring barrel: injected into every *.css.ts (and `ds` into app code).
import { ds } from './system.ts'

export { ds }

export const {
  anatomy,
  calc,
  class: cls,
  fontFace,
  fragment,
  keyframes,
  port,
  raw,
  recipe,
  rules,
  t,
} = ds
