import { defineRules } from '@mszr/vanity'

/** Hail's independently selectable reset rule module. */
export const hailResetRules = defineRules({
  hailReset: {
    description: 'Hail’s minimal standards-aligned document and box-model reset.',
    layer: 'reset',
    order: 0,
    css: {
      '*, *::before, *::after': { boxSizing: 'border-box' },
      'html': { textSizeAdjust: '100%' },
      'body': { margin: 0, minBlockSize: '100dvb' },
      'img, picture, video, canvas, svg': { display: 'block', maxInlineSize: '100%' },
      'button, input, select, textarea': { font: 'inherit' },
      ':where(button, [role=\"button\"])': { touchAction: 'manipulation' },
    },
  },
})

/** Hail's independently selectable motion rule module. */
export const hailMotionRules = defineRules({
  hailMotion: {
    description: 'Smooth defaults with an unconditional reduced-motion safety floor.',
    layer: 'reset',
    order: 10,
    css: {
      ':where(html:focus-within)': { scrollBehavior: 'smooth' },
      '*, *::before, *::after': {
        '@media (prefers-reduced-motion: reduce)': {
          scrollBehavior: 'auto',
          animationDuration: '0.01ms',
          animationIterationCount: 1,
          transitionDuration: '0.01ms',
        },
      },
    },
  },
})

/** Hail's independently selectable scheme-advertisement rule module. */
export const hailThemingRules = defineRules({
  hailTheming: {
    description: 'Advertise both schemes and honor explicit Hail scheme pins.',
    layer: 'reset',
    order: 20,
    css: {
      ':root': { colorScheme: 'light dark' },
      ':root[data-scheme=\"light\"]': { colorScheme: 'only light' },
      ':root[data-scheme=\"dark\"]': { colorScheme: 'only dark' },
    },
  },
})
