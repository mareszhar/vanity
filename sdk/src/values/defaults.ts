/** The configured core value kernel shared by package-root constructors. */

import type {
  VanityColorFunctionChannels,
  VanityCssColorSpace,
  VanityLightDarkImage,
  VanityNumericColorChannel,
} from '../tokens/color'
import type {
  VanityAuthoredColor,
  VanityAuthoredInterpolatedColor,
  VanityColorAdjustmentConstructor,
  VanityColorish,
  VanityColorMixConstructor,
} from '../tokens/types'
import type { VanityCssValue } from './types'
import type { VanityLengthConstructor, VanityLengthUnit } from './units'
import {
  alpha as alphaImplementation,
  channel,
  color as colorImplementation,
  colorMix as colorMixImplementation,
  darken as darkenImplementation,
  desaturate as desaturateImplementation,
  hsl as hslImplementation,
  hwb as hwbImplementation,
  lab as labImplementation,
  lch as lchImplementation,
  legibleOn as legibleOnImplementation,
  lightDark as lightDarkImplementation,
  lighten as lightenImplementation,
  oklab as oklabImplementation,
  oklch as oklchImplementation,
  rgb as rgbImplementation,
  rotate as rotateImplementation,
  saturate as saturateImplementation,
} from '../tokens/color'
import { customProperty } from './customProperty'
import { grid as gridImplementation } from './grid'
import { fluid as fluidImplementation, interpolate as interpolateImplementation } from './interpolate'
import { createValueKernel } from './kernel'
import { calc as calcImplementation, clamp as clampImplementation, max as maxImplementation, min as minImplementation } from './math'
import { rawValue } from './raw'
import { angle, createLengthConstructor, cssNumber, flex, frequency, integer, percent, resolution, time } from './units'

const VANITY_CORE_EXTENSION_IDENTITIES = Object.freeze([
  { id: 'org.vanity.core.adaptive-length', version: 1 },
  { id: 'org.vanity.core.color', version: 1 },
  { id: 'org.vanity.core.color-function', version: 1 },
  { id: 'org.vanity.core.grid', version: 1 },
] as const)

const STATIC_CORE_CONSTRUCTORS = Object.freeze({
  /** Set a color’s alpha channel; other channels stay intact. */
  alpha: alphaImplementation,
  /** Create explicit CSS angles with deg, grad, rad, or turn. */
  angle,
  /** Build an immutable CSS calculation with dimension-checked operations. */
  calc: calcImplementation,
  /** Describe relative-color channel changes with composable arithmetic. */
  channel,
  /** Bound a CSS value between a compatible minimum and maximum. */
  clamp: clampImplementation,
  /** Create a CSS color from syntax or a named color space and its channels. */
  color: colorImplementation,
  /** Mix colors in a chosen interpolation space; use .in() to select the space. */
  colorMix: colorMixImplementation,
  /** Reference a named CSS custom property with a data type and optional fallback. */
  customProperty,
  /** Decrease a color’s lightness in the selected polar color space. */
  darken: darkenImplementation,
  /** Decrease a color’s chroma in the selected polar color space. */
  desaturate: desaturateImplementation,
  /** Create CSS grid flex values with flex.fr(). */
  flex,
  /** Create CSS frequencies with Hz or kHz. */
  frequency,
  /** Interpolate between two values over a viewport-width range using CSS clamp(). */
  fluid: fluidImplementation,
  /** Create CSS grid tracks, repetition, templates, and named areas. */
  grid: gridImplementation,
  /** Create a CSS hsl() color; .from() changes channels relative to a base color. */
  hsl: hslImplementation,
  /** Create a CSS hwb() color; .from() changes channels relative to a base color. */
  hwb: hwbImplementation,
  /** Create a CSS integer; rejects fractional and non-finite numbers. */
  integer,
  /** Interpolate compatible numeric values at unitless progress; allows extrapolation. */
  interpolate: interpolateImplementation,
  /** Create a CSS lab() color; .from() changes channels relative to a base color. */
  lab: labImplementation,
  /** Create a CSS lch() color; .from() changes channels relative to a base color. */
  lch: lchImplementation,
  /** Choose a contrasting foreground from a background's authored defaults; live values use a recorded approximation. */
  legibleOn: legibleOnImplementation,
  /** Create CSS light-dark() alternatives selected by the browser’s color scheme. */
  lightDark: lightDarkImplementation,
  /** Increase a color’s lightness in the selected polar color space. */
  lighten: lightenImplementation,
  /** Select the largest compatible CSS value with max(). */
  max: maxImplementation,
  /** Select the smallest compatible CSS value with min(). */
  min: minImplementation,
  /** Create a finite, unitless CSS number while preserving its literal value. */
  number: cssNumber,
  /** Create a CSS oklab() color; .from() changes channels relative to a base color. */
  oklab: oklabImplementation,
  /** Create a CSS oklch() color; .from() changes channels relative to a base color. */
  oklch: oklchImplementation,
  /** Create a CSS percentage from percentage points: percent(50) is 50%. */
  percent,
  /** Preserve raw CSS syntax with an explicit data type; checks balance, not future grammar. */
  rawValue,
  /** Create CSS resolutions with dpi, dpcm, dppx, or x. */
  resolution,
  /** Create a CSS rgb() color; .from() changes channels relative to a base color. */
  rgb: rgbImplementation,
  /** Rotate a color’s hue in the selected polar color space. */
  rotate: rotateImplementation,
  /** Increase a color’s chroma in the selected polar color space. */
  saturate: saturateImplementation,
  /** Create CSS durations with ms or s. */
  time,
} as const)

interface VanityPortableConstructors<DefaultLengthUnit extends VanityLengthUnit = 'px'>
  extends Readonly<typeof STATIC_CORE_CONSTRUCTORS> {
  /** Create a length using system policy, or select an explicit unit such as .rem(). */
  readonly length: VanityLengthConstructor<DefaultLengthUnit>
}

type VanityCanonicalResult<Result>
  = Result extends VanityAuthoredInterpolatedColor ? VanityAuthoredInterpolatedColor
    : Result extends VanityAuthoredColor ? VanityAuthoredColor
      : Result

/** Preserve callable namespaces such as `oklch.from` while erasing internal color modes. */
type VanityCanonicalConstructor<Constructor>
  = Constructor extends (...args: infer Args) => infer Result
    ? ((...args: Args) => VanityCanonicalResult<Result>) & {
      readonly [Key in keyof Constructor]: VanityCanonicalConstructor<Constructor[Key]>
    }
    : Constructor

type VanityColorConstructorName
  = | 'alpha'
    | 'color'
    | 'colorMix'
    | 'darken'
    | 'desaturate'
    | 'hsl'
    | 'hwb'
    | 'lab'
    | 'lch'
    | 'lighten'
    | 'oklab'
    | 'oklch'
    | 'rgb'
    | 'rotate'
    | 'saturate'

type VanityColorAdjustmentConstructorName
  = 'darken' | 'desaturate' | 'lighten' | 'rotate' | 'saturate'

/** Exact CSS `light-dark()` overloads on a finalized system. */
interface VanityCanonicalLightDark {
  (light: VanityLightDarkImage, dark: VanityLightDarkImage): VanityCssValue<string, 'image'>
  (light: VanityColorish, dark: VanityColorish): VanityAuthoredColor
}

interface VanityCanonicalColor {
  (css: string): VanityAuthoredColor
  (
    space: VanityCssColorSpace,
    c1: VanityNumericColorChannel,
    c2: VanityNumericColorChannel,
    c3: VanityNumericColorChannel,
    alpha?: VanityNumericColorChannel,
  ): VanityAuthoredColor
  (
    space: VanityCssColorSpace,
    channels: readonly [VanityNumericColorChannel, ...VanityNumericColorChannel[]],
    options?: { alpha?: VanityNumericColorChannel },
  ): VanityAuthoredColor
  readonly from: (
    base: VanityColorish,
    channels: VanityColorFunctionChannels,
  ) => VanityAuthoredColor
}

/** Constructors as seen from a canonical system. */
export type VanityCanonicalConstructors<DefaultLengthUnit extends VanityLengthUnit = 'px'>
  = Omit<VanityPortableConstructors<DefaultLengthUnit>, VanityColorConstructorName | 'lightDark'> & {
    readonly [Key in keyof Pick<VanityPortableConstructors<DefaultLengthUnit>, Exclude<VanityColorConstructorName, 'color' | 'colorMix'>>]: Key extends VanityColorAdjustmentConstructorName
      ? VanityColorAdjustmentConstructor
      : VanityCanonicalConstructor<VanityPortableConstructors<DefaultLengthUnit>[Key]>
  } & {
    /** Create a CSS color from syntax or a named color space and its channels. */
    readonly color: VanityCanonicalColor
    /** Mix colors in a chosen interpolation space; use .in() to select the space. */
    readonly colorMix: VanityColorMixConstructor
    /** Create CSS light-dark() alternatives selected by the browser’s color scheme. */
    readonly lightDark: VanityCanonicalLightDark
  }

/** The compact public constructor surface carried by every Vanity system. */
export type VanityConstructors<DefaultLengthUnit extends VanityLengthUnit = VanityLengthUnit>
  = VanityCanonicalConstructors<DefaultLengthUnit>

/** Construct the core value capabilities once per configured system revision. */
function createCoreConstructors<const DefaultLengthUnit extends VanityLengthUnit>(
  defaultLengthUnit: DefaultLengthUnit,
): VanityPortableConstructors<DefaultLengthUnit> {
  return Object.freeze({
    ...STATIC_CORE_CONSTRUCTORS,
    length: createLengthConstructor(defaultLengthUnit),
  })
}

export const defaultValueKernel = createValueKernel(createCoreConstructors('px'), {
  extensions: VANITY_CORE_EXTENSION_IDENTITIES,
})

// Public bindings own emitted docs; registry properties own bound discovery.
/** Set a color’s alpha channel; other channels stay intact. */
export const alpha = defaultValueKernel.constructors.alpha

/** Create explicit CSS angles with deg, grad, rad, or turn. */
export const defaultAngle = defaultValueKernel.constructors.angle

/** Build an immutable CSS calculation with dimension-checked operations. */
export const calc = defaultValueKernel.constructors.calc

/** Describe relative-color channel changes with composable arithmetic. */
export const defaultChannel = defaultValueKernel.constructors.channel

/** Bound a CSS value between a compatible minimum and maximum. */
export const clamp = defaultValueKernel.constructors.clamp

/** Create a CSS color from syntax or a named color space and its channels. */
export const color = defaultValueKernel.constructors.color

/** Mix colors in a chosen interpolation space; use .in() to select the space. */
export const colorMix = defaultValueKernel.constructors.colorMix

/** Reference a named CSS custom property with a data type and optional fallback. */
export const defaultCustomProperty = defaultValueKernel.constructors.customProperty

/** Decrease a color’s lightness in the selected polar color space. */
export const darken = defaultValueKernel.constructors.darken

/** Decrease a color’s chroma in the selected polar color space. */
export const desaturate = defaultValueKernel.constructors.desaturate

/** Create CSS grid flex values with flex.fr(). */
export const defaultFlex = defaultValueKernel.constructors.flex

/** Create CSS frequencies with Hz or kHz. */
export const defaultFrequency = defaultValueKernel.constructors.frequency

/** Interpolate between two values over a viewport-width range using CSS clamp(). */
export const fluid = defaultValueKernel.constructors.fluid

/** Create CSS grid tracks, repetition, templates, and named areas. */
export const grid = defaultValueKernel.constructors.grid

/** Create a CSS hsl() color; .from() changes channels relative to a base color. */
export const hsl = defaultValueKernel.constructors.hsl

/** Create a CSS hwb() color; .from() changes channels relative to a base color. */
export const hwb = defaultValueKernel.constructors.hwb

/** Create a CSS integer; rejects fractional and non-finite numbers. */
export const defaultInteger = defaultValueKernel.constructors.integer

/** Interpolate compatible numeric values at unitless progress; allows extrapolation. */
export const interpolate = defaultValueKernel.constructors.interpolate

/** Create a CSS lab() color; .from() changes channels relative to a base color. */
export const lab = defaultValueKernel.constructors.lab

/** Create a CSS lch() color; .from() changes channels relative to a base color. */
export const lch = defaultValueKernel.constructors.lch

/** Choose a contrasting foreground from a background's authored defaults; live values use a recorded approximation. */
export const legibleOn = defaultValueKernel.constructors.legibleOn

/** Create a length using system policy, or select an explicit unit such as .rem(). */
export const defaultLength = defaultValueKernel.constructors.length

/** Create CSS light-dark() alternatives selected by the browser’s color scheme. */
export const lightDark = defaultValueKernel.constructors.lightDark

/** Increase a color’s lightness in the selected polar color space. */
export const lighten = defaultValueKernel.constructors.lighten

/** Select the largest compatible CSS value with max(). */
export const max = defaultValueKernel.constructors.max

/** Select the smallest compatible CSS value with min(). */
export const min = defaultValueKernel.constructors.min

/** Create a finite, unitless CSS number while preserving its literal value. */
export const defaultNumber = defaultValueKernel.constructors.number

/** Create a CSS oklab() color; .from() changes channels relative to a base color. */
export const oklab = defaultValueKernel.constructors.oklab

/** Create a CSS oklch() color; .from() changes channels relative to a base color. */
export const oklch = defaultValueKernel.constructors.oklch

/** Create a CSS percentage from percentage points: percent(50) is 50%. */
export const defaultPercent = defaultValueKernel.constructors.percent

/** Preserve raw CSS syntax with an explicit data type; checks balance, not future grammar. */
export const defaultRawValue = defaultValueKernel.constructors.rawValue

/** Create CSS resolutions with dpi, dpcm, dppx, or x. */
export const defaultResolution = defaultValueKernel.constructors.resolution

/** Create a CSS rgb() color; .from() changes channels relative to a base color. */
export const rgb = defaultValueKernel.constructors.rgb

/** Rotate a color’s hue in the selected polar color space. */
export const rotate = defaultValueKernel.constructors.rotate

/** Increase a color’s chroma in the selected polar color space. */
export const saturate = defaultValueKernel.constructors.saturate

/** Create CSS durations with ms or s. */
export const defaultTime = defaultValueKernel.constructors.time
