/**
 * Color values are expression trees, not eager computations
 * ([spec-tokens.md §3]): the compiler either folds a tree with build-time
 * math or serializes it to live CSS, choosing per liveness. The helper set is
 * finite and closed — a helper that cannot compile to CSS under liveness
 * doesn't ship — and every helper exists both as a method and standalone.
 */

import type { VanityInternalTokenHandle } from '../internal/handle'
import type { VanityExpressionNode } from '../values/protocol'
import type {
  VanityCssInput,
  VanityCssReference,
  VanityCssValue,
  VanityTokenInput,
} from '../values/types'
import type {
  VanityColor,
  VanityColorInterpolationSpace,
  VanityColorish,
  VanityColorMode,
  VanityContrast,
  VanityGuaranteeOf,
  VanityHueInterpolation,
  VanityInterpolatedColor,
  VanityModeOf,
  VanityPolarColorSpace,
} from './types'
import { isHandle } from '../internal/handle'
import {
  compositeNode,
  ExpressionValue,
  inputNode,
  isNodeValue,
  literalNode,
  nodeOf,
  pluginNode,
  rawNode,
  VANITY_NODE,
} from '../values/protocol'
import { VANITY_VALUE } from '../values/types'
import { parseColor } from './math'
import { modeTraits, serializeExpr } from './resolve'

// ─── The expression tree ─────────────────────────────────────────────────────

export type VanityColorExpr
  = | { kind: 'oklch', l: number, c: number, h: number, alpha?: number }
    | { kind: 'parse', css: string }
    | { kind: 'value', value: VanityCssValue<string, 'color'> }
    | { kind: 'ref', handle: VanityInternalTokenHandle }
    | { kind: 'alpha', input: VanityColorExpr, amount: number }
    | { kind: 'adjust', input: VanityColorExpr, channel: 'l' | 'c' | 'h', delta: number }
    | { kind: 'channels', input: VanityColorExpr, channels: VanityOklchChannels }
    | {
      kind: 'relative'
      input: VanityColorExpr
      function: 'rgb' | 'hsl' | 'hwb' | 'lab' | 'lch' | 'oklab' | 'oklch' | 'color'
      space?: VanityCssColorSpace
      channelNames: readonly string[]
      channels: readonly (VanityColorChannel | VanityChannelOperation | undefined)[]
      alpha?: VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel>
    }
    | {
      kind: 'mix'
      input: VanityColorExpr
      other: VanityColorExpr
      amount: number
      space: VanityColorInterpolationSpace
      hue?: VanityHueInterpolation
    }
    | { kind: 'scheme', light: VanityColorExpr, dark: VanityColorExpr }
    | { kind: 'contrast', target: VanityColorExpr, contrast: number, explicitContrast: boolean }

export interface VanityValueMeta {
  description?: string
  deprecated?: string
}

export type VanityNumericColorChannel
  = number
    | 'none'
    | VanityCssReference
    | VanityTokenInput<'number' | 'integer' | 'percentage' | 'number-percentage' | 'unknown'>
    | VanityCssValue<string, 'number' | 'integer' | 'percentage' | 'number-percentage' | 'unknown'>

export type VanityHueChannel
  = number
    | 'none'
    | VanityCssReference
    | VanityTokenInput<'number' | 'integer' | 'angle' | 'unknown'>
    | VanityCssValue<string, 'number' | 'integer' | 'angle' | 'unknown'>

export type VanityColorChannel = VanityNumericColorChannel | VanityHueChannel

export interface VanityChannelOperation<Value extends VanityColorChannel = VanityColorChannel> {
  readonly kind: 'channel-expression'
  readonly operations: readonly {
    readonly kind: 'set' | 'add' | 'subtract' | 'multiply' | 'divide'
    readonly value: Value
  }[]
  add: <const Next extends VanityColorChannel>(value: Next) => VanityChannelOperation<Value | Next>
  subtract: <const Next extends VanityColorChannel>(value: Next) => VanityChannelOperation<Value | Next>
  multiply: <const Next extends VanityColorChannel>(value: Next) => VanityChannelOperation<Value | Next>
  divide: <const Next extends VanityColorChannel>(value: Next) => VanityChannelOperation<Value | Next>
}

export interface VanityOklchChannels {
  l?: VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel>
  c?: VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel>
  h?: VanityHueChannel | VanityChannelOperation<VanityHueChannel>
  alpha?: VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel>
}

type RelativeChannel<Value extends VanityColorChannel>
  = Value | VanityChannelOperation<Value>

export interface VanityRgbChannels {
  readonly r?: RelativeChannel<VanityNumericColorChannel>
  readonly g?: RelativeChannel<VanityNumericColorChannel>
  readonly b?: RelativeChannel<VanityNumericColorChannel>
  readonly alpha?: RelativeChannel<VanityNumericColorChannel>
}

export interface VanityHslChannels {
  readonly h?: RelativeChannel<VanityHueChannel>
  readonly s?: RelativeChannel<VanityNumericColorChannel>
  readonly l?: RelativeChannel<VanityNumericColorChannel>
  readonly alpha?: RelativeChannel<VanityNumericColorChannel>
}

export interface VanityHwbChannels {
  readonly h?: RelativeChannel<VanityHueChannel>
  readonly w?: RelativeChannel<VanityNumericColorChannel>
  readonly b?: RelativeChannel<VanityNumericColorChannel>
  readonly alpha?: RelativeChannel<VanityNumericColorChannel>
}

export interface VanityLabChannels {
  readonly l?: RelativeChannel<VanityNumericColorChannel>
  /** Lab's green/red axis; alpha is always spelled `alpha`. */
  readonly a?: RelativeChannel<VanityNumericColorChannel>
  readonly b?: RelativeChannel<VanityNumericColorChannel>
  readonly alpha?: RelativeChannel<VanityNumericColorChannel>
}

export interface VanityLchChannels {
  readonly l?: RelativeChannel<VanityNumericColorChannel>
  readonly c?: RelativeChannel<VanityNumericColorChannel>
  readonly h?: RelativeChannel<VanityHueChannel>
  readonly alpha?: RelativeChannel<VanityNumericColorChannel>
}

export type VanityOklabChannels = VanityLabChannels

export interface VanityColorFunctionChannels {
  readonly space: VanityCssColorSpace
  /**
   * Positionally override profile channels. `undefined` inherits the source
   * channel at that position.
   */
  readonly channels?: readonly (
    | RelativeChannel<VanityNumericColorChannel>
    | undefined
  )[]
  readonly alpha?: RelativeChannel<VanityNumericColorChannel>
}

// Brand symbols instead of `instanceof`, exactly like `isHandle`/`isPort`:
// entry bundles may each carry their own copy of these classes (the preset
// creates values the index classifies), and `Symbol.for` survives copies.
const COLOR_VALUE = Symbol.for('vanity.colorValue')
const CONTRAST_VALUE = Symbol.for('vanity.contrastValue')

const standaloneResolver = {
  foldRef(handle: VanityInternalTokenHandle): never {
    throw new TypeError(`[vanity] cannot fold ${handle.path} without its token graph`)
  },
  refTraits: (handle: VanityInternalTokenHandle) => modeTraits(handle.mode),
  invalidColor(detail: string): never {
    throw new TypeError(`[vanity] cannot resolve color expression: ${detail}`)
  },
}

// ─── Color values ────────────────────────────────────────────────────────────

export class ColorValue {
  readonly type = 'color' as const
  declare readonly [VANITY_VALUE]: { readonly resolution: 'self' }
  readonly [VANITY_NODE]: import('../values/protocol').VanityExpressionNode<'color'>
  readonly meta: VanityValueMeta = {}
  markedLive = false

  constructor(readonly expr: VanityColorExpr) {
    Object.defineProperty(this, COLOR_VALUE, { value: true })
    Object.defineProperty(this, VANITY_VALUE, { value: Object.freeze({ resolution: 'self' }) })
    this[VANITY_NODE] = colorExpressionNode(expr)
  }

  live(): ColorValue {
    const value = copyColorValue(this)
    value.markedLive = true
    return value
  }

  describe(text: string): ColorValue {
    const value = copyColorValue(this)
    value.meta.description = text
    return value
  }

  deprecated(reason: string): ColorValue {
    const value = copyColorValue(this)
    value.meta.deprecated = reason
    return value
  }

  alpha(amount: number): ColorValue {
    return copyColorValue(this, { kind: 'alpha', input: this.expr, amount })
  }

  lighten(amount: number): ColorValue {
    return copyColorValue(this, { kind: 'adjust', input: this.expr, channel: 'l', delta: amount })
  }

  darken(amount: number): ColorValue {
    return copyColorValue(this, { kind: 'adjust', input: this.expr, channel: 'l', delta: -amount })
  }

  saturate(amount: number): ColorValue {
    return copyColorValue(this, { kind: 'adjust', input: this.expr, channel: 'c', delta: amount })
  }

  desaturate(amount: number): ColorValue {
    return copyColorValue(this, { kind: 'adjust', input: this.expr, channel: 'c', delta: -amount })
  }

  rotate(degrees: number): ColorValue {
    return copyColorValue(this, { kind: 'adjust', input: this.expr, channel: 'h', delta: degrees })
  }

  mix(other: VanityColorish, amount: number): ColorValue {
    const value = copyColorValue(this, { kind: 'mix', input: this.expr, other: toExpr(other), amount, space: 'oklab' })
    value.markedLive ||= isColorValue(other) && other.markedLive
    return interpolated(value)
  }
}

function copyColorValue(value: ColorValue, expr: VanityColorExpr = value.expr): ColorValue {
  const copy = new ColorValue(expr)
  copy.markedLive = value.markedLive
  Object.assign(copy.meta, value.meta)
  return copy
}

export class ContrastValue {
  readonly meta: VanityValueMeta = {}

  constructor(readonly expr: Extract<VanityColorExpr, { kind: 'contrast' }>) {
    Object.defineProperty(this, CONTRAST_VALUE, { value: true })
  }

  describe(text: string): ContrastValue {
    const value = copyContrastValue(this)
    value.meta.description = text
    return value
  }

  deprecated(reason: string): ContrastValue {
    const value = copyContrastValue(this)
    value.meta.deprecated = reason
    return value
  }
}

function copyContrastValue(value: ContrastValue): ContrastValue {
  const copy = new ContrastValue(value.expr)
  Object.assign(copy.meta, value.meta)
  return copy
}

export function isColorValue(value: unknown): value is ColorValue {
  return typeof value === 'object' && value !== null && COLOR_VALUE in value
}

export function isContrastValue(value: unknown): value is ContrastValue {
  return typeof value === 'object' && value !== null && CONTRAST_VALUE in value
}

/** A colorish input, normalized to an expression: values unwrap, handles become graph edges, strings parse. */
export function toExpr(color: VanityColorish | ColorValue | ContrastValue): VanityColorExpr {
  if (isColorValue(color) || isContrastValue(color))
    return color.expr

  if (isHandle(color))
    return { kind: 'ref', handle: color }

  if ((typeof color === 'object' || typeof color === 'function') && color !== null && '$var' in color) {
    return {
      kind: 'value',
      value: new ExpressionValue<'color'>(
        inputNode(color as VanityCssInput, 'color') as VanityExpressionNode<'color'>,
      ),
    }
  }

  return { kind: 'parse', css: String(color) }
}

// ─── Definition-site builders ────────────────────────────────────────────────

/** A color in oklch — numeric inputs keep the graph's foldable native node. */
function createOklch(
  l: VanityNumericColorChannel,
  c: VanityNumericColorChannel,
  h: VanityHueChannel,
  alpha?: VanityNumericColorChannel,
): VanityColor<'static'> {
  if (typeof l === 'number' && typeof c === 'number' && typeof h === 'number'
    && (alpha === undefined || typeof alpha === 'number')) {
    finiteChannels('oklch', [l, c, h, alpha])
    return new ColorValue({ kind: 'oklch', l, c, h, ...(alpha === undefined || alpha === 1 ? {} : { alpha }) }) as unknown as VanityColor<'static'>
  }

  return functionalColor('oklch', [l, c, h], alpha, { hueIndices: new Set([2]) })
}

export interface VanityOklchFunction {
  (l: VanityNumericColorChannel, c: VanityNumericColorChannel, h: VanityHueChannel, alpha?: VanityNumericColorChannel): VanityColor<'static'>
  /** CSS relative-color syntax with foldable channel operations. */
  from: <S extends VanityColorish>(base: S, channels: VanityOklchChannels) => VanityColor<VanityModeOf<S>>
}

/**
 * OKLCH constructor plus typed relative-color composition:
 * `oklch.from(base, { c: channel.multiply(0.5), alpha: 0.2 })`.
 */
export const oklch: VanityOklchFunction = Object.assign(createOklch, {
  from<S extends VanityColorish>(base: S, channels: VanityOklchChannels): VanityColor<VanityModeOf<S>> {
    validateChannels(channels)
    return overExpr(base, input => ({ kind: 'channels', input, channels })) as unknown as VanityColor<VanityModeOf<S>>
  },
})

function createLch(l: VanityNumericColorChannel, c: VanityNumericColorChannel, h: VanityHueChannel, alpha?: VanityNumericColorChannel): VanityColor<'static'> {
  return functionalColor('lch', [l, c, h], alpha, { hueIndices: new Set([2]) })
}

function createLab(l: VanityNumericColorChannel, a: VanityNumericColorChannel, b: VanityNumericColorChannel, alpha?: VanityNumericColorChannel): VanityColor<'static'> {
  return functionalColor('lab', [l, a, b], alpha)
}

function createOklab(l: VanityNumericColorChannel, a: VanityNumericColorChannel, b: VanityNumericColorChannel, alpha?: VanityNumericColorChannel): VanityColor<'static'> {
  return functionalColor('oklab', [l, a, b], alpha)
}

function createHsl(h: VanityHueChannel, s: VanityNumericColorChannel, l: VanityNumericColorChannel, alpha?: VanityNumericColorChannel): VanityColor<'static'> {
  return functionalColor('hsl', [h, s, l], alpha, { hueIndices: new Set([0]), percentNumbers: new Set([1, 2]) })
}

function createHwb(h: VanityHueChannel, w: VanityNumericColorChannel, b: VanityNumericColorChannel, alpha?: VanityNumericColorChannel): VanityColor<'static'> {
  return functionalColor('hwb', [h, w, b], alpha, { hueIndices: new Set([0]), percentNumbers: new Set([1, 2]) })
}

function createRgb(r: VanityNumericColorChannel, g: VanityNumericColorChannel, b: VanityNumericColorChannel, alpha?: VanityNumericColorChannel): VanityColor<'static'> {
  return functionalColor('rgb', [r, g, b], alpha)
}

interface VanityRelativeColorFunction<Channels, Args extends readonly unknown[]> {
  (...args: Args): VanityColor<'static'>
  from: <S extends VanityColorish>(base: S, channels: Channels) => VanityColor<VanityModeOf<S>>
}

export type VanityRgbFunction = VanityRelativeColorFunction<
  VanityRgbChannels,
  readonly [
    r: VanityNumericColorChannel,
    g: VanityNumericColorChannel,
    b: VanityNumericColorChannel,
    alpha?: VanityNumericColorChannel,
  ]
>
export type VanityHslFunction = VanityRelativeColorFunction<
  VanityHslChannels,
  readonly [
    h: VanityHueChannel,
    s: VanityNumericColorChannel,
    l: VanityNumericColorChannel,
    alpha?: VanityNumericColorChannel,
  ]
>
export type VanityHwbFunction = VanityRelativeColorFunction<
  VanityHwbChannels,
  readonly [
    h: VanityHueChannel,
    w: VanityNumericColorChannel,
    b: VanityNumericColorChannel,
    alpha?: VanityNumericColorChannel,
  ]
>
export type VanityLabFunction = VanityRelativeColorFunction<
  VanityLabChannels,
  readonly [
    l: VanityNumericColorChannel,
    a: VanityNumericColorChannel,
    b: VanityNumericColorChannel,
    alpha?: VanityNumericColorChannel,
  ]
>
export type VanityLchFunction = VanityRelativeColorFunction<
  VanityLchChannels,
  readonly [
    l: VanityNumericColorChannel,
    c: VanityNumericColorChannel,
    h: VanityHueChannel,
    alpha?: VanityNumericColorChannel,
  ]
>
export type VanityOklabFunction = VanityRelativeColorFunction<
  VanityOklabChannels,
  readonly [
    l: VanityNumericColorChannel,
    a: VanityNumericColorChannel,
    b: VanityNumericColorChannel,
    alpha?: VanityNumericColorChannel,
  ]
>

/** sRGB plus typed CSS relative-color syntax. */
export const rgb: VanityRgbFunction = withRelative(createRgb, 'rgb', ['r', 'g', 'b'])
/** HSL plus typed CSS relative-color syntax. */
export const hsl: VanityHslFunction = withRelative(createHsl, 'hsl', ['h', 's', 'l'])
/** HWB plus typed CSS relative-color syntax. */
export const hwb: VanityHwbFunction = withRelative(createHwb, 'hwb', ['h', 'w', 'b'])
/** CIE Lab; `a` is the color axis and alpha is spelled `alpha`. */
export const lab: VanityLabFunction = withRelative(createLab, 'lab', ['l', 'a', 'b'])
/** CIE LCH plus typed CSS relative-color syntax. */
export const lch: VanityLchFunction = withRelative(createLch, 'lch', ['l', 'c', 'h'])
/** OKLab; `a` is the color axis and alpha is spelled `alpha`. */
export const oklab: VanityOklabFunction = withRelative(createOklab, 'oklab', ['l', 'a', 'b'])

export type VanityPredefinedColorSpace
  = | 'srgb' | 'srgb-linear' | 'display-p3' | 'display-p3-linear' | 'a98-rgb' | 'prophoto-rgb' | 'rec2020'
    | 'xyz' | 'xyz-d50' | 'xyz-d65'
export type VanityCssColorSpace = VanityPredefinedColorSpace | `--${string}`

/** CSS `color(<predefined-space> …)` with typed channel expressions. */
export function colorSpace(
  space: VanityCssColorSpace,
  c1: VanityNumericColorChannel,
  c2: VanityNumericColorChannel,
  c3: VanityNumericColorChannel,
  alpha?: VanityNumericColorChannel,
): VanityColor<'static'> {
  return functionalColor(`color(${space}`, [c1, c2, c3], alpha)
}

/** Custom profiles may define a channel count other than three. */
export function profiledColor(
  space: VanityCssColorSpace,
  channels: readonly [VanityNumericColorChannel, ...VanityNumericColorChannel[]],
  alpha?: VanityNumericColorChannel,
): VanityColor<'static'> {
  return functionalColor(`color(${space}`, channels, alpha)
}

/** Display-P3 convenience over the standards-shaped `color()` constructor. */
export function displayP3(r: VanityNumericColorChannel, g: VanityNumericColorChannel, b: VanityNumericColorChannel, alpha?: VanityNumericColorChannel): VanityColor<'static'> {
  return colorSpace('display-p3', r, g, b, alpha)
}

function withRelative<
  Channels extends object,
  Args extends readonly unknown[],
>(
  absolute: (...args: Args) => VanityColor<'static'>,
  fn: Exclude<Extract<VanityColorExpr, { kind: 'relative' }>['function'], 'color'>,
  names: readonly string[],
): VanityRelativeColorFunction<Channels, Args> {
  return Object.assign(absolute, {
    from<S extends VanityColorish>(
      base: S,
      channels: Channels,
    ): VanityColor<VanityModeOf<S>> {
      const record = channels as Record<string, VanityColorChannel | VanityChannelOperation | undefined>
      return relativeColor(
        base,
        fn,
        names,
        names.map(name => record[name]),
        record.alpha as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      ) as unknown as VanityColor<VanityModeOf<S>>
    },
  })
}

function relativeColor(
  base: VanityColorish,
  fn: Extract<VanityColorExpr, { kind: 'relative' }>['function'],
  names: readonly string[],
  channels: readonly (VanityColorChannel | VanityChannelOperation | undefined)[],
  alpha?: VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel>,
  space?: VanityCssColorSpace,
): ColorValue {
  channels.forEach((value, index) =>
    validateRelativeChannel(`${fn}.from ${names[index] ?? `channel ${index + 1}`}`, value, names[index] === 'h'))
  validateRelativeChannel(`${fn}.from alpha`, alpha, false)
  return overExpr(base, input => ({
    kind: 'relative',
    input,
    function: fn,
    ...(space === undefined ? {} : { space }),
    channelNames: names,
    channels,
    ...(alpha === undefined ? {} : { alpha }),
  }))
}

function colorSpaceChannelNames(space: VanityCssColorSpace, count: number): readonly string[] {
  if (space.startsWith('--'))
    return Array.from({ length: count }, (_, index) => `c${index + 1}`)
  if (space.startsWith('xyz'))
    return ['x', 'y', 'z'].slice(0, count)
  return ['r', 'g', 'b'].slice(0, count)
}

type VanityChannelOperationKind = VanityChannelOperation['operations'][number]['kind']

function operation<const Value extends VanityColorChannel>(
  kind: VanityChannelOperationKind,
  value: Value,
): VanityChannelOperation<Value> {
  return channelExpression([{ kind, value }])
}

function channelExpression<const Value extends VanityColorChannel>(
  operations: readonly {
    readonly kind: VanityChannelOperationKind
    readonly value: VanityColorChannel
  }[],
): VanityChannelOperation<Value> {
  const last = operations.at(-1)!
  const kind = last.kind
  const value = last.value
  if (typeof value === 'number')
    finiteChannels(`channel.${kind}`, [value])

  if (kind === 'divide' && typeof value === 'number' && value === 0)
    throw new RangeError('[vanity] channel.divide() cannot divide by zero')

  const append = <const Next extends VanityColorChannel>(
    nextKind: VanityChannelOperationKind,
    next: Next,
  ): VanityChannelOperation<Value | Next> =>
    channelExpression<Value | Next>([...operations, { kind: nextKind, value: next }])

  return Object.freeze({
    kind: 'channel-expression',
    operations: Object.freeze([...operations]),
    add: <const Next extends VanityColorChannel>(next: Next) => append('add', next),
    subtract: <const Next extends VanityColorChannel>(next: Next) => append('subtract', next),
    multiply: <const Next extends VanityColorChannel>(next: Next) => append('multiply', next),
    divide: <const Next extends VanityColorChannel>(next: Next) => append('divide', next),
  }) as VanityChannelOperation<Value>
}

/** Composable operations over a relative-color channel. Plain numbers mean `set`. */
export const channel = {
  set: <const Value extends VanityColorChannel>(value: Value): VanityChannelOperation<Value> => operation('set', value),
  add: <const Value extends VanityColorChannel>(value: Value): VanityChannelOperation<Value> => operation('add', value),
  subtract: <const Value extends VanityColorChannel>(value: Value): VanityChannelOperation<Value> => operation('subtract', value),
  multiply: <const Value extends VanityColorChannel>(value: Value): VanityChannelOperation<Value> => operation('multiply', value),
  divide: <const Value extends VanityColorChannel>(value: Value): VanityChannelOperation<Value> => operation('divide', value),
} as const

export interface VanityColorFunction {
  (css: string): VanityColor<'static'>
  (
    space: VanityCssColorSpace,
    c1: VanityNumericColorChannel,
    c2: VanityNumericColorChannel,
    c3: VanityNumericColorChannel,
    alpha?: VanityNumericColorChannel,
  ): VanityColor<'static'>
  (
    space: VanityCssColorSpace,
    channels: readonly [VanityNumericColorChannel, ...VanityNumericColorChannel[]],
    options?: { alpha?: VanityNumericColorChannel },
  ): VanityColor<'static'>
  from: <S extends VanityColorish>(
    base: S,
    channels: VanityColorFunctionChannels,
  ) => VanityColor<VanityModeOf<S>>
}

function createColor(
  cssOrSpace: string,
  c1?: VanityNumericColorChannel | readonly [VanityNumericColorChannel, ...VanityNumericColorChannel[]],
  c2?: VanityNumericColorChannel | { alpha?: VanityNumericColorChannel },
  c3?: VanityNumericColorChannel,
  alpha?: VanityNumericColorChannel,
): VanityColor<'static'> {
  if (Array.isArray(c1)) {
    const options = c2 as { alpha?: VanityNumericColorChannel } | undefined
    return profiledColor(
      cssOrSpace as VanityCssColorSpace,
      c1 as unknown as readonly [VanityNumericColorChannel, ...VanityNumericColorChannel[]],
      options?.alpha,
    )
  }
  if (c1 !== undefined && c2 !== undefined && c3 !== undefined)
    return colorSpace(cssOrSpace as VanityCssColorSpace, c1 as VanityNumericColorChannel, c2 as VanityNumericColorChannel, c3, alpha)
  return new ColorValue({ kind: 'parse', css: cssOrSpace }) as unknown as VanityColor<'static'>
}

/** Any CSS color literal, CSS `color(<space> …)`, or typed relative `color()`. */
export const color: VanityColorFunction = Object.assign(createColor, {
  from<S extends VanityColorish>(
    base: S,
    input: VanityColorFunctionChannels,
  ): VanityColor<VanityModeOf<S>> {
    const names = colorSpaceChannelNames(input.space, input.channels?.length ?? 3)
    return relativeColor(
      base,
      'color',
      names,
      input.channels ?? [],
      input.alpha,
      input.space,
    ) as unknown as VanityColor<VanityModeOf<S>>
  },
})

export type VanityImage
  = | VanityCssValue<string, 'image'>
    | VanityTokenInput<'image'>
export type VanityLightDarkImage = VanityImage | 'none'

/**
 * Select a color or image from the consuming element's used `color-scheme`.
 *
 * @example
 * ```ts
 * ds.lightDark(ds.oklch(0.98, 0.01, 270), ds.oklch(0.16, 0.02, 270))
 * ds.lightDark(ds.rawValue.image('url(day.png)'), ds.rawValue.image('url(night.png)'))
 * ```
 *
 * The overloads mirror CSS Color 5: both inputs must be colors, or both must
 * be images/`none`; a mixed color/image pair is rejected.
 */
export function lightDark(light: VanityLightDarkImage, dark: VanityLightDarkImage): VanityCssValue<string, 'image'>
export function lightDark(light: VanityColorish, dark: VanityColorish): VanityColor<'scheme'>
export function lightDark(
  light: VanityColorish | VanityLightDarkImage,
  dark: VanityColorish | VanityLightDarkImage,
): VanityColor<'scheme'> | VanityCssValue<string, 'image'> {
  if (isImageInput(light) || isImageInput(dark)) {
    if (!isImageInput(light) || !isImageInput(dark))
      throw new TypeError('[vanity] lightDark() cannot mix <color> and <image> inputs')

    return new ExpressionValue(compositeNode({
      type: 'image',
      parts: ['light-dark(', imageNode(light), ', ', imageNode(dark), ')'],
      requirements: ['light-dark'],
      source: { helper: 'lightDark' },
    }))
  }

  return new ColorValue({ kind: 'scheme', light: toExpr(light), dark: toExpr(dark) }) as unknown as VanityColor<'scheme'>
}

function isImageValue(value: unknown): value is VanityImage {
  return (isNodeValue(value) && nodeOf(value).type === 'image')
    || (isHandle(value) && value.$type === 'image')
}

function isImageInput(value: unknown): value is VanityLightDarkImage {
  return value === 'none' || isImageValue(value)
}

function imageNode(value: VanityLightDarkImage) {
  return value === 'none'
    ? rawNode('image', 'none', { helper: 'lightDark' })
    : inputNode(value, 'image')
}

export interface VanityLegibleOptions {
  /** Minimum APCA Lc contrast score; defaults to 60. */
  contrast?: number
}

/**
 * The color legible on `target` — named for what it produces, carrying its
 * check ([spec-tokens.md §5]). Checked at build over build-known targets;
 * over a live target it uses a fallback selected from the target's authored
 * token defaults. That static pick remains in use if runtime values later
 * drift far from those defaults.
 */
export function legibleOn<S extends VanityColorish>(
  target: S,
  options: VanityLegibleOptions = {},
): VanityContrast<VanityGuaranteeOf<VanityModeOf<S>>> {
  return new ContrastValue({
    kind: 'contrast',
    target: toExpr(target),
    contrast: options.contrast ?? 60,
    explicitContrast: options.contrast !== undefined,
  }) as unknown as VanityContrast<VanityGuaranteeOf<VanityModeOf<S>>>
}

// ─── Standalone helpers — every method, callable ─────────────────────────────

type SameMode<S extends VanityColorish> = VanityColor<VanityModeOf<S>>

function overExpr(input: VanityColorish, expr: (input: VanityColorExpr) => VanityColorExpr): ColorValue {
  const value = new ColorValue(expr(toExpr(input)))

  if (isColorValue(input)) {
    value.markedLive = input.markedLive
    Object.assign(value.meta, input.meta)
  }

  return value
}

export function alpha<S extends VanityColorish>(color: S, amount: number): SameMode<S> {
  return overExpr(color, input => ({ kind: 'alpha', input, amount })) as unknown as SameMode<S>
}

export function lighten<S extends VanityColorish>(color: S, amount: number): SameMode<S> {
  return overExpr(color, input => ({ kind: 'adjust', input, channel: 'l', delta: amount })) as unknown as SameMode<S>
}

export function darken<S extends VanityColorish>(color: S, amount: number): SameMode<S> {
  return overExpr(color, input => ({ kind: 'adjust', input, channel: 'l', delta: -amount })) as unknown as SameMode<S>
}

export function saturate<S extends VanityColorish>(color: S, amount: number): SameMode<S> {
  return overExpr(color, input => ({ kind: 'adjust', input, channel: 'c', delta: amount })) as unknown as SameMode<S>
}

export function desaturate<S extends VanityColorish>(color: S, amount: number): SameMode<S> {
  return overExpr(color, input => ({ kind: 'adjust', input, channel: 'c', delta: -amount })) as unknown as SameMode<S>
}

export function rotate<S extends VanityColorish>(color: S, degrees: number): SameMode<S> {
  return overExpr(color, input => ({ kind: 'adjust', input, channel: 'h', delta: degrees })) as unknown as SameMode<S>
}

export function mix<A extends VanityColorish, B extends VanityColorish>(
  color: A,
  other: B,
  amount: number,
): VanityInterpolatedColor<VanityColorMode> {
  const value = overExpr(color, input => ({ kind: 'mix', input, other: toExpr(other), amount, space: 'oklab' }))
  value.markedLive ||= isColorValue(other) && other.markedLive
  return interpolated(value) as unknown as VanityInterpolatedColor<VanityColorMode>
}

export type VanityColorMixPercentage = number | VanityCssValue<string, 'percentage'>
export type VanityColorMixItem = VanityColorish | readonly [VanityColorish, VanityColorMixPercentage]
export interface VanityColorMixOptions {
  in?: VanityColorInterpolationSpace
  hue?: VanityHueInterpolation
}

/** Full CSS `color-mix()` list grammar; `mix(a, b, amount)` remains its two-color shorthand. */
export function colorMix(
  items: readonly [VanityColorMixItem, ...VanityColorMixItem[]],
  options: VanityColorMixOptions = {},
): VanityColor<'static'> {
  const space = options.in
  if (options.hue && (!space || !isPolarSpace(space)))
    throw new TypeError(`[vanity] ${space ?? 'the default color space'} has no hue interpolation path`)

  const normalized = items.map((item) => {
    const [color, percentage] = Array.isArray(item) ? item : [item, undefined] as const
    if (typeof percentage === 'number' && (percentage < 0 || percentage > 100 || !Number.isFinite(percentage)))
      throw new RangeError(`[vanity] colorMix() percentages must be finite and between 0 and 100; received ${percentage}`)
    return { color: toExpr(color as VanityColorish), percentage: percentage as VanityColorMixPercentage | undefined }
  })

  const dependencies = normalized.flatMap(item => [
    ...commonValueNodes(item.color),
    ...(item.percentage && typeof item.percentage !== 'number' ? [nodeOf(item.percentage)] : []),
  ])
  const value = new ExpressionValue(pluginNode({
    type: 'color',
    extension: { id: 'org.vanity.core.color-mix', version: 1 },
    dependencies,
    requirements: ['color-mix'],
    source: { helper: 'colorMix' },
    serialize(context) {
      const interpolation = space ? `in ${space}${options.hue ? ` ${options.hue} hue` : ''}, ` : ''
      const serialized = normalized.map((item) => {
        const percentage = item.percentage === undefined
          ? ''
          : ` ${typeof item.percentage === 'number' ? `${number(item.percentage)}%` : context.serialize(item.percentage)}`
        return `${serializeExpr(item.color, standaloneResolver, context)}${percentage}`
      })
      return `color-mix(${interpolation}${serialized.join(', ')})`
    },
  }))
  return new ColorValue({ kind: 'value', value }) as unknown as VanityColor<'static'>
}

/** The color methods every graph handle carries, so derivations read as `color.brand.lighten(0.06)`. */
export function handleColorMethods(handle: VanityInternalTokenHandle): Record<string, (...args: never[]) => unknown> {
  const ref = (): VanityColorExpr => ({ kind: 'ref', handle })

  return {
    alpha: (amount: number) => new ColorValue({ kind: 'alpha', input: ref(), amount }),
    lighten: (amount: number) => new ColorValue({ kind: 'adjust', input: ref(), channel: 'l', delta: amount }),
    darken: (amount: number) => new ColorValue({ kind: 'adjust', input: ref(), channel: 'l', delta: -amount }),
    saturate: (amount: number) => new ColorValue({ kind: 'adjust', input: ref(), channel: 'c', delta: amount }),
    desaturate: (amount: number) => new ColorValue({ kind: 'adjust', input: ref(), channel: 'c', delta: -amount }),
    rotate: (degrees: number) => new ColorValue({ kind: 'adjust', input: ref(), channel: 'h', delta: degrees }),
    mix: (other: VanityColorish, amount: number) => interpolated(new ColorValue({ kind: 'mix', input: ref(), other: toExpr(other), amount, space: 'oklab' })),
  }
}

function interpolated(value: ColorValue): ColorValue & VanityInterpolatedColor<VanityColorMode> {
  const withSpace = (
    space: VanityColorInterpolationSpace,
    options?: { hue: VanityHueInterpolation },
  ): ColorValue & VanityInterpolatedColor<VanityColorMode> => {
    if (value.expr.kind !== 'mix')
      throw new TypeError('[vanity] .in() is available only on an interpolation operation')
    if (options && !isPolarSpace(space))
      throw new TypeError(`[vanity] ${space} has no hue interpolation path`)
    const next = copyColorValue(value, { ...value.expr, space, ...(options ? { hue: options.hue } : { hue: undefined }) })
    return interpolated(next)
  }

  Object.defineProperty(value, 'in', { value: withSpace, enumerable: false })
  return value as ColorValue & VanityInterpolatedColor<VanityColorMode>
}

function isPolarSpace(space: VanityColorInterpolationSpace): space is VanityPolarColorSpace {
  return space === 'hsl' || space === 'hwb' || space === 'lch' || space === 'oklch'
}

function functionalColor(
  name: string,
  channels: readonly VanityColorChannel[],
  alpha?: VanityNumericColorChannel,
  options: {
    hueIndices?: ReadonlySet<number>
    percentNumbers?: ReadonlySet<number>
  } = {},
): VanityColor<'static'> {
  const colorFunction = name.startsWith('color(')
  const requirement: import('../values/protocol').VanityCssFeature
    = colorFunction && (name.startsWith('color(--') || name === 'color(display-p3-linear')
      ? 'color-level-5'
      : 'color-level-4'
  const parts: Array<string | ReturnType<typeof inputNode>> = [colorFunction ? `${name} ` : `${name}(`]

  channels.forEach((value, index) => {
    if (index > 0)
      parts.push(' ')
    parts.push(colorChannelNode(
      value,
      options.percentNumbers?.has(index) ?? false,
      `${name} channel ${index + 1}`,
      options.hueIndices?.has(index) ? 'hue' : 'numeric',
    ))
  })

  if (alpha !== undefined && !(typeof alpha === 'number' && alpha === 1)) {
    parts.push(' / ')
    parts.push(colorChannelNode(alpha, false, `${name} alpha`, 'numeric'))
  }
  parts.push(')')

  const portable = new ExpressionValue(compositeNode({
    type: 'color',
    parts,
    requirements: [requirement],
    source: { helper: colorFunction ? 'color' : name },
  }))
  const dependencies = parts.filter((part): part is ReturnType<typeof inputNode> => typeof part !== 'string')
  const value = colorFunction && dependencies.every(node => node.dependencies.length === 0)
    && !parseColor(portable.css)
    ? new ExpressionValue(pluginNode({
        type: 'color',
        extension: { id: 'org.vanity.core.color-function', version: 1 },
        dependencies,
        requirements: [requirement],
        source: { helper: 'color' },
        serialize: context => context.serialize(portable),
      }))
    : portable
  return new ColorValue({ kind: 'value', value }) as unknown as VanityColor<'static'>
}

function colorChannelNode(
  value: VanityColorChannel,
  percentNumber: boolean,
  label: string,
  accepted: 'numeric' | 'hue',
) {
  if (typeof value === 'number') {
    finiteChannels(label, [value])
    return literalNode(percentNumber ? 'percentage' : 'number', percentNumber ? `${number(value)}%` : value)
  }
  if (value === 'none')
    return rawNode('unknown', 'none', { helper: label })
  if ((typeof value === 'object' || typeof value === 'function') && value !== null && ('var' in value || '$var' in value))
    return inputNode(value)
  if (!isNodeValue(value))
    throw new TypeError(`[vanity] ${label} is not a number, percentage, angle, calc(), var(), or none`)
  const node = nodeOf(value)
  const compatible = accepted === 'hue'
    ? ['unknown', 'number', 'integer', 'angle'].includes(node.type)
    : ['unknown', 'number', 'integer', 'percentage', 'number-percentage'].includes(node.type)
  if (!compatible)
    throw new TypeError(`[vanity] ${label} cannot use a <${node.type}> value in a ${accepted} color component`)
  return node
}

function colorExpressionNode(expr: VanityColorExpr) {
  const dependencies = commonValueNodes(expr)
  return pluginNode({
    type: 'color',
    extension: { id: 'org.vanity.core.color', version: 1 },
    dependencies,
    requirements: [...colorRequirements(expr)],
    source: { helper: `color.${expr.kind}` },
    serialize: context => serializeExpr(expr, standaloneResolver, context),
    fold: () => ({ kind: 'preserve', reason: 'color-or-gamut-semantics' }),
  })
}

function commonValueNodes(expr: VanityColorExpr): import('../values/protocol').VanityExpressionNode[] {
  switch (expr.kind) {
    case 'oklch':
    case 'parse':
      return []
    case 'value':
      return [nodeOf(expr.value)]
    case 'ref':
      return [inputNode(expr.handle as unknown as VanityCssInput)]
    case 'alpha':
    case 'adjust':
      return commonValueNodes(expr.input)
    case 'channels':
      return [
        ...commonValueNodes(expr.input),
        ...Object.values(expr.channels).flatMap(channelValueNodes),
      ]
    case 'relative':
      return [
        ...commonValueNodes(expr.input),
        ...expr.channels.flatMap(channelValueNodes),
        ...channelValueNodes(expr.alpha),
      ]
    case 'mix':
      return [...commonValueNodes(expr.input), ...commonValueNodes(expr.other)]
    case 'scheme':
      return [...commonValueNodes(expr.light), ...commonValueNodes(expr.dark)]
    case 'contrast':
      return commonValueNodes(expr.target)
  }
}

function channelValueNodes(
  value: VanityColorChannel | VanityChannelOperation | undefined,
): VanityExpressionNode[] {
  if (value === undefined || typeof value === 'number' || value === 'none')
    return []
  if (isChannelOperation(value))
    return value.operations.flatMap(operation => channelValueNodes(operation.value))
  if ((typeof value === 'object' || typeof value === 'function') && value !== null && ('var' in value || '$var' in value))
    return [inputNode(value)]
  return isNodeValue(value) ? [nodeOf(value)] : []
}

export function colorRequirements(expr: VanityColorExpr): Set<import('../values/protocol').VanityCssFeature> {
  const requirements = new Set<import('../values/protocol').VanityCssFeature>(['color-level-4'])

  if (colorExpressionFoldable(expr))
    return requirements

  switch (expr.kind) {
    case 'alpha':
    case 'adjust':
    case 'channels':
    case 'relative':
      requirements.add('relative-color')
      colorRequirements(expr.input).forEach(value => requirements.add(value))
      break
    case 'mix':
      requirements.add('color-mix')
      colorRequirements(expr.input).forEach(value => requirements.add(value))
      colorRequirements(expr.other).forEach(value => requirements.add(value))
      break
    case 'scheme':
      requirements.add('light-dark')
      colorRequirements(expr.light).forEach(value => requirements.add(value))
      colorRequirements(expr.dark).forEach(value => requirements.add(value))
      break
    case 'contrast':
      colorRequirements(expr.target).forEach(value => requirements.add(value))
      break
    case 'value':
      nodeOf(expr.value).requirements.forEach(value => requirements.add(value))
      break
    case 'oklch':
    case 'parse':
    case 'ref':
      break
  }
  return requirements
}

function colorExpressionFoldable(expr: VanityColorExpr): boolean {
  switch (expr.kind) {
    case 'oklch':
    case 'parse':
      return true
    case 'value': {
      const node = nodeOf(expr.value)
      if (node.dependencies.length > 0 || node.kind === 'raw' || node.kind === 'plugin')
        return false
      if (node.kind === 'function')
        return node.values.every(valueNodeFoldable)
      if (node.kind === 'operation')
        return valueNodeFoldable(node.left) && valueNodeFoldable(node.right)
      if (node.kind === 'composite')
        return node.parts.every(part => typeof part === 'string' || valueNodeFoldable(part))
      return node.kind === 'literal'
    }
    case 'ref':
    case 'scheme':
      return false
    case 'alpha':
    case 'adjust':
      return colorExpressionFoldable(expr.input)
    case 'channels':
      return colorExpressionFoldable(expr.input)
        && Object.values(expr.channels).every(value => channelFoldable(value))
    case 'relative':
      return false
    case 'mix':
      return expr.space === 'oklab' && expr.hue === undefined
        && colorExpressionFoldable(expr.input) && colorExpressionFoldable(expr.other)
    case 'contrast':
      return colorExpressionFoldable(expr.target)
  }
}

function valueNodeFoldable(node: import('../values/protocol').VanityExpressionNode): boolean {
  if (node.dependencies.length > 0 || node.kind === 'raw' || node.kind === 'plugin' || node.kind === 'var')
    return false
  if (node.kind === 'function')
    return node.values.every(valueNodeFoldable)
  if (node.kind === 'operation')
    return valueNodeFoldable(node.left) && valueNodeFoldable(node.right)
  if (node.kind === 'composite')
    return node.parts.every(part => typeof part === 'string' || valueNodeFoldable(part))
  return true
}

function channelFoldable(value: VanityColorChannel | VanityChannelOperation | undefined): boolean {
  if (value === undefined || typeof value === 'number')
    return true
  if (value === 'none')
    return false
  if (isChannelOperation(value))
    return value.operations.every(operation => typeof operation.value === 'number')
  return false
}

function isChannelOperation(value: unknown): value is VanityChannelOperation {
  return typeof value === 'object' && value !== null
    && (value as VanityChannelOperation).kind === 'channel-expression'
    && Array.isArray((value as VanityChannelOperation).operations)
}

function validateChannels(channels: VanityOklchChannels): void {
  for (const [name, value] of Object.entries(channels)) {
    const operations = isChannelOperation(value)
      ? value.operations
      : [{ kind: 'set' as const, value }]
    for (const operation of operations) {
      const channelValue = operation.value
      if (typeof channelValue === 'number')
        finiteChannels(`oklch.from ${name}`, [channelValue])
      if (channelValue !== undefined) {
        colorChannelNode(
          channelValue,
          false,
          `oklch.from ${name}`,
          name === 'h' ? 'hue' : 'numeric',
        )
      }

      if (operation.kind === 'divide' && typeof channelValue === 'number' && channelValue === 0)
        throw new RangeError(`[vanity] oklch.from ${name} cannot divide by zero`)
    }
  }
}

function validateRelativeChannel(
  label: string,
  value: VanityColorChannel | VanityChannelOperation | undefined,
  hue: boolean,
): void {
  const operations = isChannelOperation(value)
    ? value.operations
    : [{ kind: 'set' as const, value }]
  for (const operation of operations) {
    if (operation.value === undefined)
      continue
    colorChannelNode(operation.value, false, label, hue ? 'hue' : 'numeric')
    if (operation.kind === 'divide' && operation.value === 0)
      throw new RangeError(`[vanity] ${label} cannot divide by zero`)
  }
}

function finiteChannels(name: string, values: Array<number | undefined>): void {
  for (const value of values) {
    if (value !== undefined && !Number.isFinite(value))
      throw new RangeError(`[vanity] ${name} channels must be finite; received ${value}`)
  }
}

function number(value: number): string {
  return String(Object.is(value, -0) ? 0 : value)
}
