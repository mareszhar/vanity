/**
 * `@prism/domain` — the Prism design decisions and content, as data.
 *
 * Every comparison lane implements the same components from this one source, so
 * the study compares *authoring models*, never accidentally-different designs.
 *
 * Note what the values look like: each one is a hand-written OKLCH expression
 * threading the same live hue channel, with its lightness/chroma precomputed by
 * a human. Every lane gets the identical feature — move the hue and the whole
 * palette follows — and that is deliberate: no styling model is denied a
 * capability here. The difference under study is what it costs to *express* it.
 * vanity derives this table from one seed through `elevation()`/`mix()`; every
 * other lane maintains the table.
 */

/** The one live channel. Lanes resolve their tokens through it; the app sets it. */
const hue = 'var(--demo-hue, 285)'

/** A scheme pair, precomputed — vanity derives these from a base + elevation. */
export interface SchemePair {
  light: string
  dark: string
}

export const color = {
  /** The brand seed at the live hue. */
  brand: `oklch(0.58 0.2 ${hue})`,
  /** `brand.mix(ink, 0.12)` — precomputed for the lanes without color math. */
  brandHover: {
    light: `oklch(0.5266 0.177 ${hue})`,
    dark: `oklch(0.623 0.177 ${hue})`,
  } satisfies SchemePair,
  /**
   * The canvas lifted toward the brand. Opaque on purpose: a soft *surface* is
   *  not a transparent one, or whatever sits behind it bleeds through.
   */
  brandSoft: {
    light: `oklch(0.928 0.042 ${hue})`,
    dark: `oklch(0.242 0.042 ${hue})`,
  } satisfies SchemePair,
  /** `legibleOn(brand)` — the APCA pick, stable across the hue range at this lightness. */
  onBrand: 'white',
  /** Elevation 0 / 0.03 / 0.08 / 0.2 / 0.62 / 0.94, chroma 0.008. */
  canvas: { light: `oklch(0.99 0.008 ${hue})`, dark: `oklch(0.13 0.008 ${hue})` } satisfies SchemePair,
  surface: { light: `oklch(0.9627 0.008 ${hue})`, dark: `oklch(0.1558 0.008 ${hue})` } satisfies SchemePair,
  surfaceRaised: { light: `oklch(0.9172 0.008 ${hue})`, dark: `oklch(0.1988 0.008 ${hue})` } satisfies SchemePair,
  border: { light: `oklch(0.808 0.008 ${hue})`, dark: `oklch(0.302 0.008 ${hue})` } satisfies SchemePair,
  inkMuted: { light: `oklch(0.4258 0.008 ${hue})`, dark: `oklch(0.6632 0.008 ${hue})` } satisfies SchemePair,
  ink: { light: `oklch(0.1346 0.008 ${hue})`, dark: `oklch(0.9384 0.008 ${hue})` } satisfies SchemePair,
}

/** One `light-dark()` expression from a pair — the modern-CSS form most lanes reach for. */
export function lightDark(pair: SchemePair): string {
  return `light-dark(${pair.light}, ${pair.dark})`
}

/** The linear space scale: unit 4, steps xs–xl. */
export const space = { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '40px' }

export const radius = { sm: '6px', md: '10px', pill: '999px' }

export const duration = { fast: '120ms', normal: '200ms' }

export const font = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
}

export const text = {
  small: { fontSize: '0.875rem', lineHeight: 1.45, fontWeight: 400 },
  body: { fontSize: '1rem', lineHeight: 1.5, fontWeight: 400 },
  title: { fontSize: '1.125rem', lineHeight: 1.3, fontWeight: 600 },
}

// ─── The component contract every lane implements ────────────────────────────

export const buttonIntents = ['brand', 'ghost'] as const
export const buttonSizes = ['sm', 'md'] as const

export type ButtonIntent = (typeof buttonIntents)[number]
export type ButtonSize = (typeof buttonSizes)[number]

export interface ButtonProps {
  intent?: ButtonIntent
  size?: ButtonSize
  pill?: boolean
}

// ─── Demo content ────────────────────────────────────────────────────────────

export const card = {
  title: 'Prism refraction',
  body: 'One card, five authoring models. Same decisions, same pixels — different everything else.',
  action: 'Inspect card',
}

export const progress = {
  label: 'Dispersion',
  initial: 62,
}
