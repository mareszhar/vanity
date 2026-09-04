/** The configured core value kernel shared by package-root constructors. */

import type {
  VanityColorFunctionChannels,
  VanityCssColorSpace,
  VanityLightDarkImage,
  VanityNumericColorChannel,
} from '../tokens/color'
import type { VanityAuthoredColor, VanityAuthoredInterpolatedColor, VanityColorish } from '../tokens/types'
import type { VanityCssValue } from './types'
import type { VanityLengthConstructor, VanityLengthUnit } from './units'
import {
  alpha as alphaImplementation,
  channel,
  color as colorImplementation,
  colorMix as colorMixImplementation,
  darken as darkenImplementation,
  desaturate as desaturateImplementation,
  displayP3 as displayP3Implementation,
  hsl as hslImplementation,
  hwb as hwbImplementation,
  lab as labImplementation,
  lch as lchImplementation,
  legibleOn as legibleOnImplementation,
  lightDark as lightDarkImplementation,
  lighten as lightenImplementation,
  mix as mixImplementation,
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
  { id: 'org.vanity.core.color-mix', version: 1 },
  { id: 'org.vanity.core.grid', version: 1 },
] as const)

const STATIC_CORE_CONSTRUCTORS = Object.freeze({
  alpha: alphaImplementation,
  angle,
  calc: calcImplementation,
  channel,
  clamp: clampImplementation,
  color: colorImplementation,
  colorMix: colorMixImplementation,
  customProperty,
  darken: darkenImplementation,
  desaturate: desaturateImplementation,
  displayP3: displayP3Implementation,
  flex,
  frequency,
  fluid: fluidImplementation,
  grid: gridImplementation,
  hsl: hslImplementation,
  hwb: hwbImplementation,
  integer,
  interpolate: interpolateImplementation,
  lab: labImplementation,
  lch: lchImplementation,
  legibleOn: legibleOnImplementation,
  lightDark: lightDarkImplementation,
  lighten: lightenImplementation,
  max: maxImplementation,
  min: minImplementation,
  mix: mixImplementation,
  number: cssNumber,
  oklab: oklabImplementation,
  oklch: oklchImplementation,
  percent,
  rawValue,
  resolution,
  rgb: rgbImplementation,
  rotate: rotateImplementation,
  saturate: saturateImplementation,
  time,
} as const)

interface VanityPortableConstructors<DefaultLengthUnit extends VanityLengthUnit = 'px'>
  extends Readonly<typeof STATIC_CORE_CONSTRUCTORS> {
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
    | 'displayP3'
    | 'hsl'
    | 'hwb'
    | 'lab'
    | 'lch'
    | 'lighten'
    | 'mix'
    | 'oklab'
    | 'oklch'
    | 'rgb'
    | 'rotate'
    | 'saturate'

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
    readonly [Key in Exclude<VanityColorConstructorName, 'color'>]: VanityCanonicalConstructor<VanityPortableConstructors<DefaultLengthUnit>[Key]>
  } & {
    readonly color: VanityCanonicalColor
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

export const {
  alpha,
  angle: defaultAngle,
  calc,
  channel: defaultChannel,
  clamp,
  color,
  colorMix,
  customProperty: defaultCustomProperty,
  darken,
  desaturate,
  displayP3,
  flex: defaultFlex,
  frequency: defaultFrequency,
  fluid,
  grid,
  hsl,
  hwb,
  integer: defaultInteger,
  interpolate,
  lab,
  lch,
  legibleOn,
  length: defaultLength,
  lightDark,
  lighten,
  max,
  min,
  mix,
  number: defaultNumber,
  oklab,
  oklch,
  percent: defaultPercent,
  rawValue: defaultRawValue,
  resolution: defaultResolution,
  rgb,
  rotate,
  saturate,
  time: defaultTime,
} = defaultValueKernel.constructors
