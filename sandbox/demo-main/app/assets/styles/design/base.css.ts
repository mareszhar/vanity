/**
 * Self-hosted variable fonts and the global reset. `fontFace` mints an anonymous
 * family whose identity is the handle holding it, so the three typeface stacks
 * are exported as strings — the studio runtime seeds `font.family`/`font.mono`
 * from them like every other setting, and the first server paint already carries
 * the chosen face.
 */

const geist = fontFace({
  src: 'url("/fonts/geist-sans.woff2") format("woff2")',
  fontWeight: '100 900',
  fontStyle: 'normal',
  fontDisplay: 'swap',
}, 'Geist')

const fraunces = fontFace({
  src: 'url("/fonts/fraunces.woff2") format("woff2")',
  fontWeight: '100 900',
  fontStyle: 'normal',
  fontDisplay: 'swap',
}, 'Fraunces')

const frauncesItalic = fontFace({
  src: 'url("/fonts/fraunces-italic.woff2") format("woff2")',
  fontWeight: '100 900',
  fontStyle: 'italic',
  fontDisplay: 'swap',
}, 'Fraunces')

const jetbrains = fontFace({
  src: 'url("/fonts/jetbrains-mono.woff2") format("woff2")',
  fontWeight: '100 800',
  fontStyle: 'normal',
  fontDisplay: 'swap',
}, 'JetBrains Mono')

void frauncesItalic

export const typefaces = {
  sans: `${geist}, ui-sans-serif, system-ui, sans-serif`,
  serif: `${fraunces}, ui-serif, Georgia, "Times New Roman", serif`,
  mono: `${jetbrains}, ui-monospace, SFMono-Regular, "Cascadia Code", monospace`,
} as const

export type Typeface = keyof typeof typefaces

// The palette is rooted at `#prism-studio`, so the page backdrop behind it uses
// a plain neutral that tracks the platform scheme — the studio element itself
// carries every themed token.
rules({
  // Hail owns the universal box-model reset. Prism adds its stricter motion
  // floor because the studio also exposes an application motion axis.
  '*, *::before, *::after': {
    motionReduce: {
      animationDuration: '0.001ms !important',
      animationIterationCount: '1 !important',
      transitionDuration: '0.001ms !important',
    },
  },
  'html': {
    WebkitTextSizeAdjust: '100%',
    textSizeAdjust: '100%',
    background: 'oklch(0.985 0.004 275)',
    colorScheme: 'light dark',
    dark: { background: 'oklch(0.16 0.006 275)' },
  },
  'html, body': { minBlockSize: '100%' },
  'body': {
    minInlineSize: '18rem',
    fontFamily: typefaces.sans,
    fontOpticalSizing: 'auto',
    fontSynthesis: 'none',
    WebkitFontSmoothing: 'antialiased',
    textRendering: 'optimizeLegibility',
  },
  'button, input, select, textarea': {
    font: 'inherit',
    color: 'inherit',
  },
})
