import { createSystem, media } from '@mszr/vanity'

/*
 * The product's design system. Every token is named for the role it plays,
 * never for the value it holds. Light and dark come from `lightDark()`; the
 * document root declares `color-scheme: light dark` in base.css.ts.
 */

const open = createSystem()

/** A neutral tone as a light/dark pair: lightness in each scheme. */
function tone(light: number, dark: number, chroma = 0.01, hue = 265) {
  return open.lightDark(open.oklch(light, chroma, hue), open.oklch(dark, chroma, hue))
}

/** Lengths are authored in px on a 4px rhythm and emitted as rem. */
function px(value: number) {
  return open.length.rem(value / 16)
}

const tokens = open.defineTokens({
  color: {
    /** The page. */
    canvas: tone(0.99, 0.16),
    /** Cards, bars, and panels — one step off the canvas. */
    surface: tone(1, 0.2),
    /** Hover and pressed fills on quiet controls. */
    surfaceHover: tone(0.96, 0.25),
    /** Hairlines between regions and around quiet controls. */
    border: tone(0.9, 0.3),
    /** Borders that must read at a glance: inputs, focused containers. */
    borderStrong: tone(0.78, 0.42),
    ink: tone(0.2, 0.95),
    inkMuted: tone(0.45, 0.75),
    inkFaint: tone(0.62, 0.58),
    accent: open.lightDark(open.oklch(0.55, 0.17, 265), open.oklch(0.72, 0.14, 265)),
    /** Text and icons on an accent fill. */
    onAccent: tone(0.99, 0.15, 0),
    /** A quiet accent wash for selected rows and soft buttons. */
    accentSoft: open.lightDark(open.oklch(0.95, 0.04, 265), open.oklch(0.3, 0.06, 265)),
    danger: open.lightDark(open.oklch(0.55, 0.2, 25), open.oklch(0.7, 0.16, 25)),
    dangerSoft: open.lightDark(open.oklch(0.95, 0.04, 25), open.oklch(0.3, 0.06, 25)),
    /** Dims what's behind a dialog. */
    scrim: open.oklch(0.1, 0.01, 265, 0.45),
  },
  space: {
    '2xs': px(4),
    'xs': px(8),
    'sm': px(12),
    'md': px(16),
    'lg': px(24),
    'xl': px(32),
    '2xl': px(48),
  },
  size: {
    /** Default control height. */
    control: px(36),
    controlSm: px(28),
    /** Readable measure of a text column. */
    measure: open.length.rem(42),
  },
  radius: {
    sm: px(4),
    md: px(8),
    lg: px(12),
    round: open.length.px(999),
  },
  stroke: {
    /** Dividers and quiet outlines. */
    hairline: open.length.px(1),
    /** Focus rings and emphasized outlines. */
    thick: open.length.px(2),
  },
  /** Type roles: spread with `$dec` (`...t.text.body.$dec`). */
  text: {
    caption: { fontSize: px(12), lineHeight: px(16) },
    label: { fontSize: px(13), lineHeight: px(16), fontWeight: 600 },
    body: { fontSize: px(15), lineHeight: px(24) },
    title: { fontSize: px(20), lineHeight: px(28), fontWeight: 650 },
    heading: { fontSize: px(28), lineHeight: px(36), fontWeight: 700 },
  },
  font: {
    sans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  duration: {
    quick: open.time.ms(120),
    base: open.time.ms(220),
  },
  ease: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.3, 0.7, 0, 1)',
  },
  shadow: {
    raised: '0 1px 2px oklch(0 0 0 / 0.06), 0 4px 12px oklch(0 0 0 / 0.08)',
    overlay: '0 12px 40px oklch(0 0 0 / 0.18), 0 2px 6px oklch(0 0 0 / 0.08)',
  },
  layer: {
    /** Popovers, menus, toasts. */
    overlay: 40,
    /** Dialogs and their scrim. */
    modal: 50,
  },
})

export const ds = open
  .addTokens(tokens)
  .addConditions({
    /** Room for a sidebar next to the content. */
    wide: media({ width: { '>=': '48rem' } }),
    /** reka-ui / headless states. */
    open: '&[data-state="open"]',
    checked: '&[data-state="checked"]',
    selected: '&[data-selected]',
    invalid: '&[aria-invalid="true"]',
  })
  .consolidate({
    prefix: 'app',
    root: ':root',
  })
