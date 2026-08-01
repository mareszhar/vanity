/**
 * Standalone checks: build-time guarantees over pairings the graph doesn't own
 * ([spec-tokens.md §5]). APCA Lc 60 by default; the WCAG 2 shorthands are
 * one method away. Failures are diagnostics with fix-its, never findings in an
 * audit nobody re-runs.
 */

import type { VanityColorish } from './types'

export type VanityCheckLevel
  = | { algorithm: 'apca', min: number }
    | { algorithm: 'wcag2', min: number }

export class TextContrastCheck {
  readonly kind = 'textContrast' as const
  level: VanityCheckLevel = { algorithm: 'apca', min: 60 }

  constructor(
    readonly text: VanityColorish,
    readonly background: VanityColorish,
  ) {}

  aa(): this {
    this.level = { algorithm: 'wcag2', min: 4.5 }
    return this
  }

  aaa(): this {
    this.level = { algorithm: 'wcag2', min: 7 }
    return this
  }

  lc(min: number): this {
    this.level = { algorithm: 'apca', min }
    return this
  }
}

export const check = {
  /** Assert `text` stays legible over `background`, in both schemes. */
  textContrast: (text: VanityColorish, background: VanityColorish): TextContrastCheck =>
    new TextContrastCheck(text, background),
}
