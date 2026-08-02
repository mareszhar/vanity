import { container, media, supports } from '@mszr/vanity'
import { foundationTokens } from './foundations.tokens'
import { open } from './open'
import { shadowTokens } from './palette.tokens'

// `shadowTokens` already composes the palette it derives from.
const conditions = {
  sm: media({ width: { '>=': '40rem' } }),
  md: media({ width: { '>=': '48rem' } }),
  lg: media({ width: { '>=': '64rem' } }),
  open: '&[data-state="open"]',
  checked: '&[data-state="checked"]',
  selected: '&[data-selected]',
  specimenWide: container('specimen', { inlineSize: { '>=': '26rem' } }),
  specimenRoomy: container('specimen', { inlineSize: { '>=': '42rem' } }),
  supportsBackdrop: supports('(backdrop-filter: blur(1px))'),
}

/**
 * The one finalized Prism system. Application code imports `ds`; style modules
 * receive that exact value through generated auto-imports.
 */
export const ds = open
  .addTokens([shadowTokens, foundationTokens])
  .addConditions(conditions)
  .consolidate({
    prefix: 'prism',
    root: '#prism-studio',
    axisOrder: ['scheme', 'density', 'motion'],
    audit: {
      escapes: 'warn',
      unusedTokens: 'warn',
      ambiguousAxes: 'warn',
    },
  })

export type PrismSystem = typeof ds
