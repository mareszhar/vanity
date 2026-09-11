/**
 * Build-time color math. The one law here: every operation computes exactly
 * the formula its live-CSS serialization asks the browser to compute
 * ([spec-values.md §8–9]) — so lightening is `l + delta` in oklch because the
 * emitted form is `calc(l + delta)`, values are never clamped the browser
 * wouldn't clamp, and the canonical formatter bounds divergence to the
 * rounding digit.
 */

import type { VanityPolarColorSpace } from './types'
import { converter, interpolate, parse, oklch as toOklch, rgb as toRgb } from 'culori'

export interface VanityOklch {
  l: number
  c: number
  h: number
  /** Opaque when omitted. */
  alpha?: number
}

type VanityAdjustmentChannel = 'l' | 'c' | 'h' | 's'
type VanityColorFoldChannel = VanityAdjustmentChannel | 'w' | 'b'

/**
 * The explicit CSS relative-channel/culori correspondence used by every
 * build-time adjustment fold. The value is the factor applied to an authored
 * CSS delta before adding it to culori's representation.
 *
 * | space | channel | CSS relative range | culori range | fold scale |
 * | --- | --- | --- | --- | --- |
 * | `oklch` | `l` / `c` / `h` | `0..1` / `0..0.4` / degrees | same | `1` |
 * | `lch` | `l` / `c` / `h` | `0..100` / `0..150` / degrees | same | `1` |
 * | `hsl` | `s` / `l` | `0..100` | `0..1` | `0.01` |
 * | `hsl` | `h` | degrees | degrees | `1` |
 * | `hwb` | `h` | degrees | degrees | `1` |
 */
export const COLOR_RELATIVE_CHANNEL_FOLD_SCALES: Readonly<Record<
  VanityPolarColorSpace,
  Readonly<Partial<Record<VanityAdjustmentChannel, number>>>
>> = {
  oklch: { l: 1, c: 1, h: 1 },
  lch: { l: 1, c: 1, h: 1 },
  hsl: { h: 1, s: 0.01, l: 0.01 },
  hwb: { h: 1 },
}

/** The target gamut a cross-space adjustment fold is allowed to preserve. */
export const COLOR_RELATIVE_CHANNEL_FOLD_GAMUTS: Readonly<Record<
  VanityPolarColorSpace,
  'srgb' | 'unbounded'
>> = {
  oklch: 'unbounded',
  lch: 'unbounded',
  hsl: 'srgb',
  hwb: 'srgb',
}

/**
 * Finite CSS channel ranges for bounded fold targets. The ranges are written
 * in the units emitted by `formatColorInSpace`; empty rows are intentional for
 * the unbounded spaces in `COLOR_RELATIVE_CHANNEL_FOLD_GAMUTS`.
 */
export const COLOR_RELATIVE_CHANNEL_FOLD_RANGES: Readonly<Record<
  VanityPolarColorSpace,
  Readonly<Partial<Record<VanityColorFoldChannel, readonly [number, number]>>>
>> = {
  oklch: {},
  lch: {},
  hsl: { s: [0, 100], l: [0, 100] },
  hwb: { w: [0, 100], b: [0, 100] },
}

/** Tolerance for insignificant floating-point noise at the sRGB gamut edge. */
export const COLOR_SRGB_GAMUT_EPSILON = 1e-7

export function parseColor(css: string): VanityOklch | undefined {
  const parsed = parse(css)

  if (!parsed)
    return undefined

  const { l, c, h = 0, alpha } = toOklch(parsed)
  return { l, c, h, ...(alpha === undefined || alpha === 1 ? {} : { alpha }) }
}

/**
 * Preserve a static color's authored gamut when an operation only replaces
 * alpha. Function-shaped colors can be edited without converting their
 * channels; literals such as `red` use conventional sRGB `rgb()` notation.
 */
export function preserveColorAlpha(css: string, alpha: number): string | undefined {
  const source = css.trim()
  const parsed = parse(source)
  if (!parsed)
    return undefined

  if (/^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/i.test(source))
    return replaceColorFunctionAlpha(source, alpha)

  const converted = toRgb(parsed)
  if (converted === undefined || converted.r === undefined || converted.g === undefined || converted.b === undefined)
    return undefined

  return `rgb(${formatNumber(converted.r * 255)} ${formatNumber(converted.g * 255)} ${formatNumber(converted.b * 255)} / ${formatNumber(alpha)})`
}

/** Return the authored polar function's working space when it is explicit. */
export function getAuthoredPolarColorSpace(css: string): VanityPolarColorSpace | undefined {
  const match = css.trim().match(/^(hsl|hwb|lch|oklch)\s*\(/i)
  return match?.[1].toLowerCase() as VanityPolarColorSpace | undefined
}

/**
 * Check whether a static adjustment can be represented in its target space
 * without discarding the origin's gamut. Same-space syntax keeps its authored
 * notation; bounded cross-space targets require an sRGB-gamut origin.
 */
export function canFoldColorAdjustmentInSpace(css: string, space: VanityPolarColorSpace): boolean {
  if (getAuthoredPolarColorSpace(css) === space || COLOR_RELATIVE_CHANNEL_FOLD_GAMUTS[space] === 'unbounded')
    return true

  const parsed = parseColor(css)
  if (parsed === undefined)
    return false
  return isColorInSrgbGamut(parsed)
}

/**
 * Preserve a named-space channel adjustment in an authored function when the
 * operation and origin use the same polar space. A non-matching source
 * deliberately returns `undefined`; callers can then format the computed
 * result in the operation's own space.
 */
export function preserveColorAdjustment(
  css: string,
  space: VanityPolarColorSpace,
  channel: 'l' | 'c' | 'h' | 's',
  delta: number,
): string | undefined {
  const source = css.trim()
  const parsed = parse(source)
  if (!parsed || getAuthoredPolarColorSpace(source) !== space)
    return undefined

  const converted = converter(space)(parsed) as unknown as Record<string, number | undefined>
  if (converted === undefined || converted[channel] === undefined)
    return undefined

  const scale = COLOR_RELATIVE_CHANNEL_FOLD_SCALES[space][channel]
  if (scale === undefined)
    return undefined

  return formatPreservedPolarColor(space, {
    ...converted,
    [channel]: converted[channel]! + delta * scale,
  })
}

/** Format a canonical build color in the polar space that owns an adjustment. */
export function formatColorInSpace(color: VanityOklch, space: VanityPolarColorSpace): string {
  const converted = space === 'oklch'
    ? color as unknown as Record<string, number | undefined>
    : converter(space)(getOklch(color)) as unknown as Record<string, number | undefined>
  if (converted === undefined)
    throw new Error(`culori could not convert oklch to ${space}`)
  return formatPreservedPolarColor(space, converted)
}

function formatPreservedPolarColor(
  space: VanityPolarColorSpace,
  color: Record<string, number | undefined>,
): string {
  const alpha = color.alpha === undefined || color.alpha === 1 ? '' : ` / ${formatNumber(color.alpha)}`
  switch (space) {
    case 'hsl':
      return `hsl(${formatNumber(color.h ?? 0)} ${formatNumber((color.s ?? 0) * 100)}% ${formatNumber((color.l ?? 0) * 100)}%${alpha})`
    case 'hwb':
      return `hwb(${formatNumber(color.h ?? 0)} ${formatNumber((color.w ?? 0) * 100)}% ${formatNumber((color.b ?? 0) * 100)}%${alpha})`
    case 'lch':
      return `lch(${formatNumber(color.l ?? 0)} ${formatNumber(color.c ?? 0)} ${formatNumber(color.h ?? 0)}${alpha})`
    case 'oklch':
      return `oklch(${formatNumber(color.l ?? 0)} ${formatNumber(color.c ?? 0)} ${formatNumber(color.h ?? 0)}${alpha})`
  }
}

function replaceColorFunctionAlpha(source: string, alpha: number): string | undefined {
  const open = source.indexOf('(')
  if (open < 0 || !source.endsWith(')'))
    return undefined

  const body = source.slice(open + 1, -1)
  let depth = 0
  let slash = -1
  for (let index = 0; index < body.length; index++) {
    const character = body[index]
    if (character === '(') {
      depth++
    }
    else if (character === ')') {
      depth--
    }
    else if (character === '/' && depth === 0) {
      slash = index
      break
    }
  }

  const channels = (slash < 0 ? body : body.slice(0, slash)).trimEnd()
  return `${source.slice(0, open + 1)}${channels} / ${formatNumber(alpha)})`
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

/**
 * Apply one named polar-space channel delta to a canonical color. This is
 * used only for build-time representative values; live emission remains the
 * browser's relative-color calculation. Keeping the conversion here makes
 * token defaults and contrast checks agree with the named namespace.
 */
export function applyOklchAdjustment(
  color: VanityOklch,
  space: VanityPolarColorSpace,
  channel: 'l' | 'c' | 'h' | 's',
  delta: number,
): VanityOklch {
  const scale = COLOR_RELATIVE_CHANNEL_FOLD_SCALES[space][channel]
  if (scale === undefined)
    throw new Error(`${space} has no '${channel}' channel for this adjustment`)

  if (space === 'oklch')
    return { ...color, [channel]: color[channel as 'l' | 'c' | 'h'] + delta * scale }

  const converted = converter(space)(toOklch({ mode: 'oklch', l: color.l, c: color.c, h: color.h, alpha: color.alpha })) as unknown as Record<string, number | undefined>
  if (converted === undefined)
    throw new Error(`culori could not convert oklch to ${space}`)

  const current = converted[channel] ?? (channel === 'h' ? 0 : 0)
  const adjusted = { ...converted, [channel]: current + delta * scale }
  const result = toOklch(adjusted as never)
  if (result === undefined)
    throw new Error(`culori could not convert ${space} back to oklch`)

  const { l, c, h = 0, alpha } = result
  return { l, c, h, ...(alpha === undefined || alpha === 1 ? {} : { alpha }) }
}

function getOklch({ l, c, h, alpha }: VanityOklch) {
  return { mode: 'oklch' as const, l, c, h, alpha }
}

/** Return whether a canonical color converts into sRGB without gamut loss. */
export function isColorInSrgbGamut(color: VanityOklch): boolean {
  const converted = toRgb(getOklch(color))
  return [converted.r, converted.g, converted.b].every((channel) => {
    return Number.isFinite(channel)
      && channel >= -COLOR_SRGB_GAMUT_EPSILON
      && channel <= 1 + COLOR_SRGB_GAMUT_EPSILON
  })
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
