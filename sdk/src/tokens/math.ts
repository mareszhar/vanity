/**
 * Build-time color math. The one law here: every operation computes exactly
 * the formula its live-CSS serialization asks the browser to compute
 * ([spec-tokens.md §2]) — so lightening is `l + delta` in oklch because the
 * emitted form is `calc(l + delta)`, values are never clamped the browser
 * wouldn't clamp, and the canonical formatter bounds divergence to the
 * rounding digit.
 */

import { interpolate, parse, oklch as toOklch, rgb as toRgb } from 'culori'

export interface VanityOklch {
  l: number
  c: number
  h: number
  /** Opaque when omitted. */
  alpha?: number
}

export function parseColor(css: string): VanityOklch | undefined {
  const parsed = parse(css)

  if (!parsed)
    return undefined

  const { l, c, h = 0, alpha } = toOklch(parsed)
  return { l, c, h, ...(alpha === undefined || alpha === 1 ? {} : { alpha }) }
}

/** The canonical number format shared by folded values and live expressions. */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 1e4) / 1e4
  // Normalize -0 so folded and live paths can never disagree on a sign.
  return String(rounded === 0 ? 0 : rounded)
}

export function formatOklch({ l, c, h, alpha }: VanityOklch): string {
  const channels = `${formatNumber(l)} ${formatNumber(c)} ${formatNumber(h)}`
  return alpha === undefined ? `oklch(${channels})` : `oklch(${channels} / ${formatNumber(alpha)})`
}

export function mixOklch(a: VanityOklch, b: VanityOklch, amount: number): VanityOklch {
  // `color-mix(in oklab, …)` — the same interpolation space the emitted CSS names.
  const mixed = toOklch(interpolate([getOklch(a), getOklch(b)], 'oklab')(amount))
  const { l, c, h = 0, alpha } = mixed
  return { l, c, h, ...(alpha === undefined || alpha === 1 ? {} : { alpha }) }
}

function getOklch({ l, c, h, alpha }: VanityOklch) {
  return { mode: 'oklch' as const, l, c, h, alpha }
}

function getSrgbChannels(color: VanityOklch): [number, number, number] {
  const { r, g, b } = toRgb(getOklch(color))
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel))
  return [clamp(r), clamp(g), clamp(b)]
}

// ─── APCA (SAPC-4g, the W3 constants) ────────────────────────────────────────

const APCA = {
  exponents: { normBg: 0.56, normText: 0.57, revBg: 0.65, revText: 0.62 },
  blackSoftClamp: { threshold: 0.022, exponent: 1.414 },
  scale: 1.14,
  lowClip: 0.1,
  lowOffset: 0.027,
  minDeltaY: 0.0005,
}

function getApcaScreenLuminance([r, g, b]: [number, number, number]): number {
  const y = 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4
  const { threshold, exponent } = APCA.blackSoftClamp
  return y < threshold ? y + (threshold - y) ** exponent : y
}

/**
 * The signed APCA lightness contrast Lc of `text` over `background`.
 * Positive for dark-on-light, negative for light-on-dark; legibility compares |Lc|.
 */
export function measureApcaContrast(text: VanityOklch, background: VanityOklch): number {
  const textY = getApcaScreenLuminance(getSrgbChannels(text))
  const backgroundY = getApcaScreenLuminance(getSrgbChannels(background))

  if (Math.abs(backgroundY - textY) < APCA.minDeltaY)
    return 0

  const { normBg, normText, revBg, revText } = APCA.exponents

  if (backgroundY > textY) {
    const sapc = (backgroundY ** normBg - textY ** normText) * APCA.scale
    return sapc < APCA.lowClip ? 0 : (sapc - APCA.lowOffset) * 100
  }

  const sapc = (backgroundY ** revBg - textY ** revText) * APCA.scale
  return sapc > -APCA.lowClip ? 0 : (sapc + APCA.lowOffset) * 100
}

// ─── WCAG 2 contrast ratio ───────────────────────────────────────────────────

function getWcagLuminance([r, g, b]: [number, number, number]): number {
  const convertToLinear = (channel: number) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  return 0.2126 * convertToLinear(r) + 0.7152 * convertToLinear(g) + 0.0722 * convertToLinear(b)
}

export function measureWcagContrast(a: VanityOklch, b: VanityOklch): number {
  const first = getWcagLuminance(getSrgbChannels(a))
  const second = getWcagLuminance(getSrgbChannels(b))
  const [darker, lighter] = first < second ? [first, second] : [second, first]
  return (lighter + 0.05) / (darker + 0.05)
}

// ─── Legible pairing ─────────────────────────────────────────────────────────

export const white: VanityOklch = { l: 1, c: 0, h: 0 }
export const black: VanityOklch = { l: 0, c: 0, h: 0 }

export interface VanityContrastPick {
  keyword: 'white' | 'black'
  color: VanityOklch
  lc: number
}

/** The better of white/black text over `target`, by |Lc| — what `contrast-color()` computes live. */
export function pickLegible(target: VanityOklch): VanityContrastPick {
  const whiteLc = measureApcaContrast(white, target)
  const blackLc = measureApcaContrast(black, target)

  return Math.abs(whiteLc) >= Math.abs(blackLc)
    ? { keyword: 'white', color: white, lc: whiteLc }
    : { keyword: 'black', color: black, lc: blackLc }
}
