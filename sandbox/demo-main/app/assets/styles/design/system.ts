import { container, defineConditions, media, selector, supports } from '@mszr/vanity'
import { foundationTokens } from './foundations.tokens'
import { open } from './open'
import { shadowTokens } from './palette.tokens'

// `shadowTokens` already composes the palette it derives from.
const tokens = open
  .defineTokens()
  .add(shadowTokens)
  .add(foundationTokens)

const conditions = defineConditions({
  sm: media('(min-width: 40rem)'),
  md: media('(min-width: 48rem)'),
  lg: media('(min-width: 64rem)'),
  open: selector('&[data-state="open"]'),
  checked: selector('&[data-state="checked"]'),
  selected: selector('&[data-selected]'),
  specimenWide: container('specimen', '(min-width: 26rem)'),
  specimenRoomy: container('specimen', '(min-width: 42rem)'),
  supportsBackdrop: supports('(backdrop-filter: blur(1px))'),
})

/**
 * The one finalized Prism system. Application code imports `ds`; style modules
 * receive that exact value through generated auto-imports.
 */
export const ds = open
  .addTokens(tokens)
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
