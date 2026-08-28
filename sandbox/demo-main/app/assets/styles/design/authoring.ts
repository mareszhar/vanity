/**
 * The style auto-import barrel exposes the exact locked system plus the bound
 * authoring helpers this demo uses directly. `cls` is only a local shorthand
 * for the canonical `ds.class`; it is not a second Vanity API.
 */
import type { VanityStyleValue } from '@mszr/vanity'

import { ds } from './system'

export { ds }

export const {
  anatomy,
  calc,
  class: cls,
  clamp,
  fontFace,
  keyframes,
  mix,
  percent,
  port,
  raw,
  recipe,
  rules,
  t,
} = ds

export interface FocusRingOptions {
  readonly color?: VanityStyleValue<'outlineColor'>
  readonly width?: string
  readonly offset?: string
}

export function focusRing(options: FocusRingOptions = {}) {
  return {
    focusVisible: {
      outlineWidth: options.width ?? '2px',
      outlineStyle: 'solid',
      outlineColor: options.color ?? 'currentColor',
      outlineOffset: options.offset ?? '2px',
    },
  } as const
}

export function minTarget(px = 44) {
  return { minInlineSize: `${px}px`, minBlockSize: `${px}px` } as const
}

export function visuallyHidden() {
  return {
    position: 'absolute',
    inlineSize: '1px',
    blockSize: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    border: 0,
  } as const
}
