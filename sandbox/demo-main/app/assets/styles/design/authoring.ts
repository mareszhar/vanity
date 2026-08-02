/**
 * Generated style auto-imports expose the exact locked system rather than a
 * hand-maintained mirror of its methods. Small app-owned fragments sit beside
 * `ds`; Hail remains the design-system opinion rather than a grab-bag.
 */
import type { VanityStyleValue } from '@mszr/vanity'

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

export { ds } from './system'
