/** Machine-readable capability declarations for the same-named CSS helpers. */

import type { VanityCssFeature } from './protocol'

/** Release confidence recorded for one CSS helper capability. */
export type VanityHelperMaturity = 'stable' | 'experimental'

/** Machine-readable CSS grammar, lowering, and evidence for one helper. */
export interface VanityCssHelperCapability {
  readonly css: string
  readonly accepted: readonly string[]
  readonly shorthand: readonly string[]
  readonly output: string
  readonly fold: 'proven' | 'preserve-native' | 'fallback-plus-enhancement'
  readonly maturity: VanityHelperMaturity
  readonly requirements: readonly VanityCssFeature[]
  readonly rawForm: string
}

function createCapability(value: VanityCssHelperCapability): VanityCssHelperCapability {
  return Object.freeze({
    ...value,
    accepted: Object.freeze([...value.accepted]),
    shorthand: Object.freeze([...value.shorthand]),
    requirements: Object.freeze([...value.requirements]),
  })
}

const numericChannels = ['number', 'percentage where CSS permits it', 'none', 'calc()', 'typed var()']

/** Per-helper CSS grammar and lowering evidence: `VANITY_CSS_CAPABILITIES.oklch`. */
export const VANITY_CSS_CAPABILITIES = Object.freeze({
  calc: createCapability({
    css: 'calc()',
    accepted: ['CSS numeric values and typed expressions'],
    shorthand: ['fluent add/subtract/multiply/divide/negate'],
    output: 'calc(<calc-sum>)',
    fold: 'preserve-native',
    maturity: 'stable',
    requirements: ['calc-basic'],
    rawForm: 'rawValue.<numeric-type>()',
  }),
  min: createCapability({
    css: 'min()',
    accepted: ['one or more compatible <calc-sum> values'],
    shorthand: [],
    output: 'min(<calc-sum>#)',
    fold: 'preserve-native',
    maturity: 'stable',
    requirements: ['calc-basic'],
    rawForm: 'rawValue.<numeric-type>()',
  }),
  max: createCapability({
    css: 'max()',
    accepted: ['one or more compatible <calc-sum> values'],
    shorthand: [],
    output: 'max(<calc-sum>#)',
    fold: 'preserve-native',
    maturity: 'stable',
    requirements: ['calc-basic'],
    rawForm: 'rawValue.<numeric-type>()',
  }),
  clamp: createCapability({
    css: 'clamp()',
    accepted: ['three compatible <calc-sum> values'],
    shorthand: [],
    output: 'clamp(min, preferred, max)',
    fold: 'preserve-native',
    maturity: 'stable',
    requirements: ['calc-basic'],
    rawForm: 'rawValue.<numeric-type>()',
  }),
  rgb: createCapability({
    css: 'rgb()',
    accepted: numericChannels,
    shorthand: ['numeric channels retain 0–255 spelling'],
    output: 'modern space-separated rgb()',
    fold: 'proven',
    maturity: 'stable',
    requirements: ['color-level-4'],
    rawForm: 'rawValue.color()',
  }),
  hsl: createCapability({
    css: 'hsl()',
    accepted: numericChannels,
    shorthand: ['numeric saturation/lightness mean percent'],
    output: 'modern space-separated hsl()',
    fold: 'proven',
    maturity: 'stable',
    requirements: ['color-level-4'],
    rawForm: 'rawValue.color()',
  }),
  hwb: createCapability({
    css: 'hwb()',
    accepted: numericChannels,
    shorthand: ['numeric whiteness/blackness mean percent'],
    output: 'hwb()',
    fold: 'proven',
    maturity: 'stable',
    requirements: ['color-level-4'],
    rawForm: 'rawValue.color()',
  }),
  lab: createCapability({
    css: 'lab()',
    accepted: numericChannels,
    shorthand: [],
    output: 'lab()',
    fold: 'proven',
    maturity: 'stable',
    requirements: ['color-level-4'],
    rawForm: 'rawValue.color()',
  }),
  lch: createCapability({
    css: 'lch()',
    accepted: numericChannels,
    shorthand: [],
    output: 'lch()',
    fold: 'proven',
    maturity: 'stable',
    requirements: ['color-level-4'],
    rawForm: 'rawValue.color()',
  }),
  oklab: createCapability({
    css: 'oklab()',
    accepted: numericChannels,
    shorthand: [],
    output: 'oklab()',
    fold: 'proven',
    maturity: 'stable',
    requirements: ['color-level-4'],
    rawForm: 'rawValue.color()',
  }),
  oklch: createCapability({
    css: 'oklch()',
    accepted: numericChannels,
    shorthand: [],
    output: 'oklch()',
    fold: 'proven',
    maturity: 'stable',
    requirements: ['color-level-4'],
    rawForm: 'rawValue.color()',
  }),
  color: createCapability({
    css: 'color()',
    accepted: ['predefined color space and three full channel values'],
    shorthand: ['one string joins an existing CSS color literal'],
    output: 'color(<predefined-color-space> …)',
    fold: 'proven',
    maturity: 'stable',
    requirements: ['color-level-4'],
    rawForm: 'rawValue.color()',
  }),
  colorMix: createCapability({
    css: 'color-mix()',
    accepted: ['exactly two colors', 'optional 0–100% item percentages', 'required interpolation space', 'optional polar hue method'],
    shorthand: ['colorMix([a, b]).in(space)', 'a.mix(b, percentage).in(space)'],
    output: 'color-mix(in <space> [<hue-method> hue]?, <color> [<percentage>]?, <color> [<percentage>]?)',
    fold: 'preserve-native',
    maturity: 'stable',
    requirements: ['color-mix'],
    rawForm: 'rawValue.color()',
  }),
  relativeColor: createCapability({
    css: 'relative color syntax',
    accepted: ['base color', 'channel values and arithmetic', 'named polar-space adjustment sugar', 'HWB rotate adjustment subset'],
    shorthand: ['oklch/hsl/hwb/lch.from()', 'top-level alpha()', 'named-space lighten/darken/saturate/desaturate/rotate()', 'bare channel adjustments through policies.color.adjustSpace'],
    output: '<space>(from …)',
    fold: 'preserve-native',
    maturity: 'stable',
    requirements: ['relative-color'],
    rawForm: 'rawValue.color()',
  }),
  contrastColor: createCapability({
    css: 'contrast-color()',
    accepted: ['live color target'],
    shorthand: ['legibleOn()'],
    output: 'computed fallback plus @supports enhancement',
    fold: 'fallback-plus-enhancement',
    maturity: 'experimental',
    requirements: [],
    rawForm: 'rawValue.color()',
  }),
  lightDark: createCapability({
    css: 'light-dark()',
    accepted: ['two colors', 'two typed images/none', 'compatible token handles in the color form'],
    shorthand: [],
    output: 'light-dark(light, dark)',
    fold: 'preserve-native',
    maturity: 'experimental',
    requirements: ['light-dark'],
    rawForm: 'rawValue.color() / rawValue.image()',
  }),
} satisfies Record<string, VanityCssHelperCapability>)

/**
 * Stable helpers must cover their capability table under the default target.
 * Experimental helpers must expose the maturity and preserve a raw/standard
 * form; they are never silently promoted by market-data drift.
 */
export const VANITY_HELPER_MATURITY_POLICY = Object.freeze({
  stable: 'grammar and output are locked by type/output/spec-derived fixtures under the published support target',
  experimental: 'capability is explicit, fallback/diagnostic behavior is mandatory, and a raw standards form remains available',
})
