/**
 * Color values are expression trees, not eager computations
 * ([spec-values.md §8–9]): the compiler either folds a tree with build-time
 * math or serializes it to live CSS, choosing per liveness. The helper set is
 * finite and closed — a helper that cannot compile to CSS under liveness
 * doesn't ship — and every helper exists both as a method and standalone.
 */

import type { VanityExpressionNode } from '../values/protocol'
import type {
  VanityCssInput,
  VanityCssReference,
  VanityCssValue,
  VanityTokenInput,
} from '../values/types'
import type { VanityResolver } from './expressions'
import type { VanityInternalTokenHandle } from './handle'
import type {
  VanityAuthoredColor,
  VanityAuthoredContrast,
  VanityAuthoredInterpolatedColor,
  VanityAuthoredInterpolation,
  VanityColorAdjustmentNamespace,
  VanityColorInterpolationSpace,
  VanityColorish,
  VanityColorMixConstructor,
  VanityColorMixItem,
  VanityColorMixPercentage,
  VanityHueInterpolation,
  VanityPolarColorSpace,
} from './types'
import { VanityError } from '../diagnostics'
import {
  createCompositeNode,
  createInputNode,
  createLiteralNode,
  createPluginNode,
  createRawNode,
  ExpressionValue,
  getNode,
  isNodeValue,
  VANITY_NODE,
} from '../values/protocol'
import { VANITY_VALUE } from '../values/types'
import { foldColorCss, isMixShapeFoldable, serializeExpr } from './expressions'
import { isHandle, readHandlePath } from './handle'
import { canFoldColorAdjustmentInSpace, parseColor } from './math'

// ─── The expression tree ─────────────────────────────────────────────────────

export type VanityColorExpr
  = | { kind: 'oklch', l: number, c: number, h: number, alpha?: number }
    | { kind: 'parse', css: string }
    | { kind: 'value', value: VanityCssValue<string, 'color'> }
    | { kind: 'ref', handle: VanityInternalTokenHandle }
    | { kind: 'alpha', input: VanityColorExpr, amount: number }
    | { kind: 'adjust', input: VanityColorExpr, space?: VanityPolarColorSpace, channel: 'l' | 'c' | 'h' | 's', delta: number }
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
      inputPercentage?: VanityColorMixPercentage
      otherPercentage?: VanityColorMixPercentage
      space?: VanityColorInterpolationSpace
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
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_COLOR',
      message: `cannot fold ${readHandlePath(handle)} without its token module`,
      path: readHandlePath(handle),
      fix: 'resolve the color expression through its owning token module',
    })
  },
  foldRefForContrast(handle: VanityInternalTokenHandle): never {
    return standaloneResolver.foldRef(handle)
  },
  getRefTraits: (handle: VanityInternalTokenHandle) => ({
    cssLive: handle.$reference === 'var',
    volatile: handle.$mutable,
    conditional: false,
  }),
  invalidColor(detail: string, fix?: string): never {
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_COLOR',
      message: `cannot resolve color expression: ${detail}`,
      path: ['color'],
      fix: fix ?? 'provide a valid color value or reference a color token',
    })
  },
}

function getStandaloneResolver(adjustSpace?: VanityPolarColorSpace): VanityResolver {
  if (adjustSpace === undefined)
    return standaloneResolver
  return {
    ...standaloneResolver,
    policies: { color: { adjustSpace } },
  }
}

// ─── Color values ────────────────────────────────────────────────────────────

class ColorValue {
  readonly type = 'color' as const
  declare readonly [VANITY_VALUE]: { readonly resolution: 'self' }
  readonly [VANITY_NODE]: import('../values/protocol').VanityExpressionNode<'color'>

  constructor(readonly expr: VanityColorExpr) {
    Object.defineProperty(this, COLOR_VALUE, { value: true })
    Object.defineProperty(this, VANITY_VALUE, { value: Object.freeze({ resolution: 'self' }) })
    this[VANITY_NODE] = createColorExpressionNode(expr)
  }

  alpha(amount: number): ColorValue {
    return copyColorValue(this, createAlphaExpression(this.expr, amount))
  }

  lighten(amount: number): ColorValue {
    return copyColorValue(this, createAdjustExpression(this.expr, undefined, 'l', amount))
  }

  darken(amount: number): ColorValue {
    return copyColorValue(this, createAdjustExpression(this.expr, undefined, 'l', -amount))
  }

  saturate(amount: number): ColorValue {
    return copyColorValue(this, createAdjustExpression(this.expr, undefined, 'c', amount))
  }

  desaturate(amount: number): ColorValue {
    return copyColorValue(this, createAdjustExpression(this.expr, undefined, 'c', -amount))
  }

  rotate(degrees: number): ColorValue {
    return copyColorValue(this, createAdjustExpression(this.expr, undefined, 'h', degrees))
  }

  mix(other: VanityColorish, percentage?: VanityColorMixPercentage): ColorValue & VanityAuthoredInterpolation {
    if (percentage !== undefined)
      validateColorMixPercentage(percentage)
    return createInterpolatedColor(copyColorValue(this, {
      kind: 'mix',
      input: this.expr,
      other: convertToExpression(other),
      ...(percentage === undefined ? {} : { otherPercentage: percentage }),
    }))
  }
}

function copyColorValue(value: ColorValue, expr: VanityColorExpr = value.expr): ColorValue {
  return new ColorValue(expr)
}

class ContrastValue {
  constructor(readonly expr: Extract<VanityColorExpr, { kind: 'contrast' }>) {
    Object.defineProperty(this, CONTRAST_VALUE, { value: true })
  }
}

export function isColorValue(value: unknown): value is ColorValue {
  return typeof value === 'object' && value !== null && COLOR_VALUE in value
}

export function isContrastValue(value: unknown): value is ContrastValue {
  return typeof value === 'object' && value !== null && CONTRAST_VALUE in value
}

/** A colorish input, normalized to an expression: values unwrap, handles become graph edges, strings parse. */
export function convertToExpression(color: VanityColorish | ColorValue | ContrastValue): VanityColorExpr {
  if (isColorValue(color) || isContrastValue(color))
    return color.expr

  if (isHandle(color))
    return { kind: 'ref', handle: color }

  if ((typeof color === 'object' || typeof color === 'function') && color !== null && '$var' in color) {
    return {
      kind: 'value',
      value: new ExpressionValue<'color'>(
        createInputNode(color as VanityCssInput, 'color') as VanityExpressionNode<'color'>,
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
): VanityAuthoredColor {
  if (typeof l === 'number' && typeof c === 'number' && typeof h === 'number'
    && (alpha === undefined || typeof alpha === 'number')) {
    validateFiniteChannels('oklch', [l, c, h, alpha])
    return new ColorValue({ kind: 'oklch', l, c, h, ...(alpha === undefined || alpha === 1 ? {} : { alpha }) }) as unknown as VanityAuthoredColor
  }

  return createFunctionalColor('oklch', [l, c, h], alpha, { hueIndices: new Set([2]) })
}

export interface VanityOklchFunction extends VanityColorAdjustmentNamespace<'oklch'> {
  (l: VanityNumericColorChannel, c: VanityNumericColorChannel, h: VanityHueChannel, alpha?: VanityNumericColorChannel): VanityAuthoredColor
  /** CSS relative-color syntax with foldable channel operations. */
  from: <S extends VanityColorish>(base: S, channels: VanityOklchChannels) => VanityAuthoredColor
}

/**
 * OKLCH constructor plus typed relative-color composition:
 * `oklch.from(base, { c: channel.multiply(0.5), alpha: 0.2 })`.
 */
export const oklch: VanityOklchFunction = Object.assign(createOklch, createColorAdjustmentMethods('oklch'), {
  from<S extends VanityColorish>(base: S, channels: VanityOklchChannels): VanityAuthoredColor {
    validateChannels(channels)
    return applyColorExpression(base, input => ({ kind: 'channels', input, channels })) as unknown as VanityAuthoredColor
  },
})

function createLch(l: VanityNumericColorChannel, c: VanityNumericColorChannel, h: VanityHueChannel, alpha?: VanityNumericColorChannel): VanityAuthoredColor {
  return createFunctionalColor('lch', [l, c, h], alpha, { hueIndices: new Set([2]) })
}

function createLab(l: VanityNumericColorChannel, a: VanityNumericColorChannel, b: VanityNumericColorChannel, alpha?: VanityNumericColorChannel): VanityAuthoredColor {
  return createFunctionalColor('lab', [l, a, b], alpha)
}

function createOklab(l: VanityNumericColorChannel, a: VanityNumericColorChannel, b: VanityNumericColorChannel, alpha?: VanityNumericColorChannel): VanityAuthoredColor {
  return createFunctionalColor('oklab', [l, a, b], alpha)
}

function createHsl(h: VanityHueChannel, s: VanityNumericColorChannel, l: VanityNumericColorChannel, alpha?: VanityNumericColorChannel): VanityAuthoredColor {
  return createFunctionalColor('hsl', [h, s, l], alpha, { hueIndices: new Set([0]), percentNumbers: new Set([1, 2]) })
}

function createHwb(h: VanityHueChannel, w: VanityNumericColorChannel, b: VanityNumericColorChannel, alpha?: VanityNumericColorChannel): VanityAuthoredColor {
  return createFunctionalColor('hwb', [h, w, b], alpha, { hueIndices: new Set([0]), percentNumbers: new Set([1, 2]) })
}

function createRgb(r: VanityNumericColorChannel, g: VanityNumericColorChannel, b: VanityNumericColorChannel, alpha?: VanityNumericColorChannel): VanityAuthoredColor {
  return createFunctionalColor('rgb', [r, g, b], alpha)
}

type VanityRelativeColorFunction<
  Channels,
  Args extends readonly unknown[],
  Space extends VanityPolarColorSpace | undefined = undefined,
> = {
  (...args: Args): VanityAuthoredColor
  from: <S extends VanityColorish>(base: S, channels: Channels) => VanityAuthoredColor
} & ([Space] extends [undefined] ? object : VanityColorAdjustmentNamespace<Exclude<Space, undefined>>)

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
  ],
  'hsl'
>
export type VanityHwbFunction = VanityRelativeColorFunction<
  VanityHwbChannels,
  readonly [
    h: VanityHueChannel,
    w: VanityNumericColorChannel,
    b: VanityNumericColorChannel,
    alpha?: VanityNumericColorChannel,
  ],
  'hwb'
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
  ],
  'lch'
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
export const rgb: VanityRgbFunction = createRelativeFunction(createRgb, 'rgb', ['r', 'g', 'b'])
/** HSL plus typed CSS relative-color syntax. */
export const hsl: VanityHslFunction = createRelativeFunction(createHsl, 'hsl', ['h', 's', 'l'], 'hsl')
/** HWB plus typed CSS relative-color syntax. */
export const hwb: VanityHwbFunction = createRelativeFunction(createHwb, 'hwb', ['h', 'w', 'b'], 'hwb')
/** CIE Lab; `a` is the color axis and alpha is spelled `alpha`. */
export const lab: VanityLabFunction = createRelativeFunction(createLab, 'lab', ['l', 'a', 'b'])
/** CIE LCH plus typed CSS relative-color syntax. */
export const lch: VanityLchFunction = createRelativeFunction(createLch, 'lch', ['l', 'c', 'h'], 'lch')
/** OKLab; `a` is the color axis and alpha is spelled `alpha`. */
export const oklab: VanityOklabFunction = createRelativeFunction(createOklab, 'oklab', ['l', 'a', 'b'])

export type VanityPredefinedColorSpace
  = | 'srgb' | 'srgb-linear' | 'display-p3' | 'display-p3-linear' | 'a98-rgb' | 'prophoto-rgb' | 'rec2020'
    | 'xyz' | 'xyz-d50' | 'xyz-d65'
export type VanityCssColorSpace = VanityPredefinedColorSpace | `--${string}`

/** CSS `color(<predefined-space> …)` with typed channel expressions. */
function createColorSpace(
  space: VanityCssColorSpace,
  c1: VanityNumericColorChannel,
  c2: VanityNumericColorChannel,
  c3: VanityNumericColorChannel,
  alpha?: VanityNumericColorChannel,
): VanityAuthoredColor {
  return createFunctionalColor(`color(${space}`, [c1, c2, c3], alpha)
}

/** Custom profiles may define a channel count other than three. */
function createProfiledColor(
  space: VanityCssColorSpace,
  channels: readonly [VanityNumericColorChannel, ...VanityNumericColorChannel[]],
  alpha?: VanityNumericColorChannel,
): VanityAuthoredColor {
  return createFunctionalColor(`color(${space}`, channels, alpha)
}

function createRelativeFunction<
  Channels extends object,
  Args extends readonly unknown[],
  Space extends VanityPolarColorSpace | undefined = undefined,
>(
  absolute: (...args: Args) => VanityAuthoredColor,
  fn: Exclude<Extract<VanityColorExpr, { kind: 'relative' }>['function'], 'color'>,
  names: readonly string[],
  space?: Space,
): VanityRelativeColorFunction<Channels, Args, Space> {
  return Object.assign(absolute, {
    ...(space === undefined ? {} : createColorAdjustmentMethods(space)),
    from<S extends VanityColorish>(
      base: S,
      channels: Channels,
    ): VanityAuthoredColor {
      const record = channels as Record<string, VanityColorChannel | VanityChannelOperation | undefined>
      return createRelativeColor(
        base,
        fn,
        names,
        names.map(name => record[name]),
        record.alpha as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      ) as unknown as VanityAuthoredColor
    },
  }) as VanityRelativeColorFunction<Channels, Args, Space>
}

function createRelativeColor(
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
  return applyColorExpression(base, input => ({
    kind: 'relative',
    input,
    function: fn,
    ...(space === undefined ? {} : { space }),
    channelNames: names,
    channels,
    ...(alpha === undefined ? {} : { alpha }),
  }))
}

type VanityColorAdjustmentVerb = 'lighten' | 'darken' | 'saturate' | 'desaturate' | 'rotate'

function createAlphaExpression(
  input: VanityColorExpr,
  amount: number,
): Extract<VanityColorExpr, { kind: 'alpha' }> {
  return { kind: 'alpha', input, amount }
}

function createAdjustExpression(
  input: VanityColorExpr,
  space: VanityPolarColorSpace | undefined,
  channel: Extract<VanityColorExpr, { kind: 'adjust' }>['channel'],
  delta: number,
): Extract<VanityColorExpr, { kind: 'adjust' }> {
  return { kind: 'adjust', input, ...(space === undefined ? {} : { space }), channel, delta }
}

/** Build the explicit, space-owned channel sugar that sits beside a polar `.from()`. */
function createColorAdjustmentMethods<const Space extends VanityPolarColorSpace>(space: Space): VanityColorAdjustmentNamespace<Space> {
  const createMethod = (verb: VanityColorAdjustmentVerb) => (color: VanityColorish, amount: number) =>
    applyColorExpression(color, (input) => {
      const channel = getAdjustmentChannel(space, verb)
      if (channel === undefined) {
        throw new VanityError({
          code: 'VANITY_TOKENS_INVALID_COLOR',
          message: `${space}.${verb}() cannot address a channel that ${space} does not expose`,
          path: [space, verb],
          fix: `use ${space}.from(color, { alpha }), ${space}.rotate(), or the channel operations supported by ${space}`,
        })
      }

      const direction = verb === 'darken' || verb === 'desaturate' ? -1 : 1
      return createAdjustExpression(input, space, channel, direction * amount)
    }) as unknown as VanityAuthoredColor

  const methods: Record<string, (color: VanityColorish, amount: number) => VanityAuthoredColor> = {
    rotate: createMethod('rotate'),
  }
  if (space !== 'hwb') {
    methods.lighten = createMethod('lighten')
    methods.darken = createMethod('darken')
    methods.saturate = createMethod('saturate')
    methods.desaturate = createMethod('desaturate')
  }
  return methods as unknown as VanityColorAdjustmentNamespace<Space>
}

function getAdjustmentChannel(
  space: VanityPolarColorSpace,
  verb: VanityColorAdjustmentVerb,
): 'l' | 'c' | 'h' | 's' | undefined {
  if (verb === 'rotate')
    return 'h'
  if (space === 'hwb')
    return undefined
  if (verb === 'lighten' || verb === 'darken')
    return 'l'
  return space === 'hsl' ? 's' : 'c'
}

function getColorSpaceChannelNames(space: VanityCssColorSpace, count: number): readonly string[] {
  if (space.startsWith('--'))
    return Array.from({ length: count }, (_, index) => `c${index + 1}`)
  if (space.startsWith('xyz'))
    return ['x', 'y', 'z'].slice(0, count)
  return ['r', 'g', 'b'].slice(0, count)
}

type VanityChannelOperationKind = VanityChannelOperation['operations'][number]['kind']

function createChannelOperation<const Value extends VanityColorChannel>(
  kind: VanityChannelOperationKind,
  value: Value,
): VanityChannelOperation<Value> {
  return createChannelExpression([{ kind, value }])
}

function createChannelExpression<const Value extends VanityColorChannel>(
  operations: readonly {
    readonly kind: VanityChannelOperationKind
    readonly value: VanityColorChannel
  }[],
): VanityChannelOperation<Value> {
  const last = operations.at(-1)!
  const kind = last.kind
  const value = last.value
  if (typeof value === 'number')
    validateFiniteChannels(`channel.${kind}`, [value])

  if (kind === 'divide' && typeof value === 'number' && value === 0) {
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_COLOR',
      message: 'channel.divide() cannot divide by zero',
      path: ['channel', 'divide'],
      fix: 'divide by a non-zero channel value',
    })
  }

  const append = <const Next extends VanityColorChannel>(
    nextKind: VanityChannelOperationKind,
    next: Next,
  ): VanityChannelOperation<Value | Next> =>
    createChannelExpression<Value | Next>([...operations, { kind: nextKind, value: next }])

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
  set: <const Value extends VanityColorChannel>(value: Value): VanityChannelOperation<Value> => createChannelOperation('set', value),
  add: <const Value extends VanityColorChannel>(value: Value): VanityChannelOperation<Value> => createChannelOperation('add', value),
  subtract: <const Value extends VanityColorChannel>(value: Value): VanityChannelOperation<Value> => createChannelOperation('subtract', value),
  multiply: <const Value extends VanityColorChannel>(value: Value): VanityChannelOperation<Value> => createChannelOperation('multiply', value),
  divide: <const Value extends VanityColorChannel>(value: Value): VanityChannelOperation<Value> => createChannelOperation('divide', value),
} as const

export interface VanityColorFunction {
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
  from: <S extends VanityColorish>(
    base: S,
    channels: VanityColorFunctionChannels,
  ) => VanityAuthoredColor
}

function createColor(
  cssOrSpace: string,
  c1?: VanityNumericColorChannel | readonly [VanityNumericColorChannel, ...VanityNumericColorChannel[]],
  c2?: VanityNumericColorChannel | { alpha?: VanityNumericColorChannel },
  c3?: VanityNumericColorChannel,
  alpha?: VanityNumericColorChannel,
): VanityAuthoredColor {
  if (Array.isArray(c1)) {
    const options = c2 as { alpha?: VanityNumericColorChannel } | undefined
    return createProfiledColor(
      cssOrSpace as VanityCssColorSpace,
      c1 as unknown as readonly [VanityNumericColorChannel, ...VanityNumericColorChannel[]],
      options?.alpha,
    )
  }
  if (c1 !== undefined && c2 !== undefined && c3 !== undefined)
    return createColorSpace(cssOrSpace as VanityCssColorSpace, c1 as VanityNumericColorChannel, c2 as VanityNumericColorChannel, c3, alpha)
  return new ColorValue({ kind: 'parse', css: cssOrSpace }) as unknown as VanityAuthoredColor
}

/** Any CSS color literal, CSS `color(<space> …)`, or typed relative `color()`. */
export const color: VanityColorFunction = Object.assign(createColor, {
  from<S extends VanityColorish>(
    base: S,
    input: VanityColorFunctionChannels,
  ): VanityAuthoredColor {
    const names = getColorSpaceChannelNames(input.space, input.channels?.length ?? 3)
    return createRelativeColor(
      base,
      'color',
      names,
      input.channels ?? [],
      input.alpha,
      input.space,
    ) as unknown as VanityAuthoredColor
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
export function lightDark(light: VanityColorish, dark: VanityColorish): VanityAuthoredColor
export function lightDark(
  light: VanityColorish | VanityLightDarkImage,
  dark: VanityColorish | VanityLightDarkImage,
): VanityAuthoredColor | VanityCssValue<string, 'image'> {
  if (isImageInput(light) || isImageInput(dark)) {
    if (!isImageInput(light) || !isImageInput(dark)) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_COLOR',
        message: 'lightDark() cannot mix <color> and <image> inputs',
        path: ['lightDark'],
        fix: 'pass two colors, or pass two images/none values',
      })
    }

    return new ExpressionValue(createCompositeNode({
      type: 'image',
      parts: ['light-dark(', createImageNode(light), ', ', createImageNode(dark), ')'],
      requirements: ['light-dark'],
      source: { helper: 'lightDark' },
    }))
  }

  return new ColorValue({ kind: 'scheme', light: convertToExpression(light), dark: convertToExpression(dark) }) as unknown as VanityAuthoredColor
}

function isImageValue(value: unknown): value is VanityImage {
  return (isNodeValue(value) && getNode(value).type === 'image')
    || (isHandle(value) && value.$type === 'image')
}

function isImageInput(value: unknown): value is VanityLightDarkImage {
  return value === 'none' || isImageValue(value)
}

function createImageNode(value: VanityLightDarkImage) {
  return value === 'none'
    ? createRawNode('image', 'none', { helper: 'lightDark' })
    : createInputNode(value, 'image')
}

/** Configure the minimum APCA contrast score required by `legibleOn()`. */
export interface VanityLegibleOptions {
  /** Minimum APCA Lc contrast score; defaults to 60. */
  contrast?: number
}

/**
 * The color legible on `target` — named for what it produces, carrying its
 * check ([spec-tokens.md §12]). Checked at build over exactly foldable targets;
 * over a live or deliberately unfoldable target it uses a representative
 * selected from the target's authored defaults. That static pick remains in
 * use if runtime values later drift far from those defaults, and the
 * approximation is retained in introspection and the contrast audit.
 */
export function legibleOn<S extends VanityColorish>(
  target: S,
  options: VanityLegibleOptions = {},
): VanityAuthoredContrast {
  return new ContrastValue({
    kind: 'contrast',
    target: convertToExpression(target),
    contrast: options.contrast ?? 60,
    explicitContrast: options.contrast !== undefined,
  }) as unknown as VanityAuthoredContrast
}

// ─── Standalone helpers — every method, callable ─────────────────────────────

type SameColor = VanityAuthoredColor

function applyColorExpression(input: VanityColorish, expr: (input: VanityColorExpr) => VanityColorExpr): ColorValue {
  const value = new ColorValue(expr(convertToExpression(input)))

  return value
}

/**
 * Replace a color's alpha channel without selecting a polar working space.
 * Static leaves preserve their authored notation; live references use
 * Vanity's stable `oklch(from … l c h / alpha)` form.
 */
export function alpha(color: VanityColorish, amount: number): SameColor {
  return applyColorExpression(color, input => createAlphaExpression(input, amount)) as unknown as SameColor
}

export function lighten(color: VanityColorish, amount: number): SameColor {
  return applyColorExpression(color, input => createAdjustExpression(input, undefined, 'l', amount)) as unknown as SameColor
}

export function darken(color: VanityColorish, amount: number): SameColor {
  return applyColorExpression(color, input => createAdjustExpression(input, undefined, 'l', -amount)) as unknown as SameColor
}

export function saturate(color: VanityColorish, amount: number): SameColor {
  return applyColorExpression(color, input => createAdjustExpression(input, undefined, 'c', amount)) as unknown as SameColor
}

export function desaturate(color: VanityColorish, amount: number): SameColor {
  return applyColorExpression(color, input => createAdjustExpression(input, undefined, 'c', -amount)) as unknown as SameColor
}

export function rotate(color: VanityColorish, degrees: number): SameColor {
  return applyColorExpression(color, input => createAdjustExpression(input, undefined, 'h', degrees)) as unknown as SameColor
}

/**
 * Create the shared color-mix expression used by the free constructor and
 * color-value/token-handle method forms. Both percentages are validated here
 * so the CSS rule that a zero total is invalid fails at the authoring site.
 */
function createColorMixValue(
  items: readonly [VanityColorMixItem, VanityColorMixItem],
  space?: VanityColorInterpolationSpace,
): ColorValue & VanityAuthoredInterpolation {
  if (!Array.isArray(items) || items.length !== 2) {
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_COLOR',
      message: `colorMix() needs exactly two color items; received ${Array.isArray(items) ? items.length : 'a non-array value'}`,
      path: ['colorMix', 'items'],
      fix: 'pass a two-item colorMix tuple, with an optional percentage on each item',
    })
  }

  const normalized = items.map(normalizeColorMixItem) as [
    NormalizedColorMixItem,
    NormalizedColorMixItem,
  ]
  if (typeof normalized[0].percentage === 'number'
    && typeof normalized[1].percentage === 'number'
    && normalized[0].percentage + normalized[1].percentage === 0) {
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_COLOR',
      message: 'colorMix() cannot use two percentages that sum to 0',
      path: ['colorMix', 'percentage'],
      fix: 'give at least one color a positive percentage',
    })
  }
  const value = new ColorValue({
    kind: 'mix',
    input: normalized[0].color,
    other: normalized[1].color,
    ...(normalized[0].percentage === undefined ? {} : { inputPercentage: normalized[0].percentage }),
    ...(normalized[1].percentage === undefined ? {} : { otherPercentage: normalized[1].percentage }),
    ...(space === undefined ? {} : { space }),
  })
  return createInterpolatedColor(value)
}

interface NormalizedColorMixItem {
  readonly color: VanityColorExpr
  readonly percentage?: VanityColorMixPercentage
}

function normalizeColorMixItem(item: VanityColorMixItem): NormalizedColorMixItem {
  const [color, percentage] = Array.isArray(item) ? item : [item, undefined] as const
  if (percentage !== undefined)
    validateColorMixPercentage(percentage)
  return {
    color: convertToExpression(color),
    ...(percentage === undefined ? {} : { percentage }),
  }
}

function validateColorMixPercentage(value: VanityColorMixPercentage): void {
  if (typeof value === 'number') {
    if (value < 0 || value > 100 || !Number.isFinite(value)) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_COLOR',
        message: `colorMix() percentages must be finite and between 0 and 100; received ${value}`,
        path: ['colorMix', 'percentage'],
        fix: 'pass a finite percentage from 0 through 100',
      })
    }
    return
  }

  const declaredType = (typeof value === 'object' || typeof value === 'function') && value !== null && '$type' in value
    ? value.$type
    : undefined
  if (declaredType !== undefined && declaredType !== 'percentage' && declaredType !== 'unknown') {
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_COLOR',
      message: `colorMix() percentage cannot use a <${declaredType}> value`,
      path: ['colorMix', 'percentage'],
      fix: 'pass percent(), a percentage token, or a compatible percentage value',
    })
  }

  const node = isNodeValue(value)
    ? getNode(value)
    : createInputNode(value as VanityCssInput, 'percentage')
  if (node.type !== 'percentage' && node.type !== 'unknown') {
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_COLOR',
      message: `colorMix() percentage cannot use a <${node.type}> value`,
      path: ['colorMix', 'percentage'],
      fix: 'pass percent(), a percentage token, or a compatible percentage value',
    })
  }
}

/** CSS-exact `color-mix()`; choose its required interpolation space with `.in()`. */
export function colorMix(items: readonly [VanityColorMixItem, VanityColorMixItem]): VanityAuthoredInterpolation {
  return createColorMixValue(items)
}

/** Bind colorMix() to a system policy without changing its CSS-shaped call signature. */
export function bindColorMix(defaultSpace: undefined): VanityColorMixConstructor
export function bindColorMix<Space extends VanityColorInterpolationSpace>(defaultSpace: Space): VanityColorMixConstructor<Space>
export function bindColorMix(defaultSpace: VanityColorInterpolationSpace | undefined): VanityColorMixConstructor
export function bindColorMix(defaultSpace: VanityColorInterpolationSpace | undefined): VanityColorMixConstructor {
  return ((items: readonly [VanityColorMixItem, VanityColorMixItem]) =>
    createColorMixValue(items, defaultSpace)) as VanityColorMixConstructor
}

/** The color methods every graph handle carries, so derivations read as `color.brand.lighten(0.06)`. */
export function handleColorMethods(handle: VanityInternalTokenHandle): Record<string, (...args: never[]) => unknown> {
  const getColorReference = (): VanityColorExpr => ({ kind: 'ref', handle })

  return {
    alpha: (amount: number) => new ColorValue(createAlphaExpression(getColorReference(), amount)),
    lighten: (amount: number) => new ColorValue(createAdjustExpression(getColorReference(), undefined, 'l', amount)),
    darken: (amount: number) => new ColorValue(createAdjustExpression(getColorReference(), undefined, 'l', -amount)),
    saturate: (amount: number) => new ColorValue(createAdjustExpression(getColorReference(), undefined, 'c', amount)),
    desaturate: (amount: number) => new ColorValue(createAdjustExpression(getColorReference(), undefined, 'c', -amount)),
    rotate: (degrees: number) => new ColorValue(createAdjustExpression(getColorReference(), undefined, 'h', degrees)),
    mix: (other: VanityColorish, percentage?: VanityColorMixPercentage) => {
      if (percentage !== undefined)
        validateColorMixPercentage(percentage)
      return createInterpolatedColor(new ColorValue({
        kind: 'mix',
        input: getColorReference(),
        other: convertToExpression(other),
        ...(percentage === undefined ? {} : { otherPercentage: percentage }),
      }))
    },
  }
}

function createInterpolatedColor(value: ColorValue): ColorValue & VanityAuthoredInterpolation {
  const createInterpolationSpace = (
    space: VanityColorInterpolationSpace,
    options?: { hue: VanityHueInterpolation },
  ): ColorValue & VanityAuthoredInterpolatedColor => {
    if (value.expr.kind !== 'mix') {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_COLOR',
        message: '.in() is available only on an interpolation operation',
        path: ['color', 'in'],
        fix: 'call .in() on the result of a color interpolation',
      })
    }
    if (options && !isPolarSpace(space)) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_COLOR',
        message: `${space} has no hue interpolation path`,
        path: ['color', 'in'],
        fix: 'choose a polar interpolation space before selecting a hue path',
      })
    }
    const next = copyColorValue(value, { ...value.expr, space, ...(options ? { hue: options.hue } : { hue: undefined }) })
    return createInterpolatedColor(next)
  }

  Object.defineProperty(value, 'in', { value: createInterpolationSpace, enumerable: false })
  return value as ColorValue & VanityAuthoredInterpolation
}

function isPolarSpace(space: VanityColorInterpolationSpace): space is VanityPolarColorSpace {
  return space === 'hsl' || space === 'hwb' || space === 'lch' || space === 'oklch'
}

function createFunctionalColor(
  name: string,
  channels: readonly VanityColorChannel[],
  alpha?: VanityNumericColorChannel,
  options: {
    hueIndices?: ReadonlySet<number>
    percentNumbers?: ReadonlySet<number>
  } = {},
): VanityAuthoredColor {
  const colorFunction = name.startsWith('color(')
  const requirement: import('../values/protocol').VanityCssFeature
    = colorFunction && (name.startsWith('color(--') || name === 'color(display-p3-linear')
      ? 'color-level-5'
      : 'color-level-4'
  const parts: Array<string | ReturnType<typeof createInputNode>> = [colorFunction ? `${name} ` : `${name}(`]

  channels.forEach((value, index) => {
    if (index > 0)
      parts.push(' ')
    parts.push(createColorChannelNode(
      value,
      options.percentNumbers?.has(index) ?? false,
      `${name} channel ${index + 1}`,
      options.hueIndices?.has(index) ? 'hue' : 'numeric',
    ))
  })

  if (alpha !== undefined && !(typeof alpha === 'number' && alpha === 1)) {
    parts.push(' / ')
    parts.push(createColorChannelNode(alpha, false, `${name} alpha`, 'numeric'))
  }
  parts.push(')')

  const portable = new ExpressionValue(createCompositeNode({
    type: 'color',
    parts,
    requirements: [requirement],
    source: { helper: colorFunction ? 'color' : name },
  }))
  const dependencies = parts.filter((part): part is ReturnType<typeof createInputNode> => typeof part !== 'string')
  const value = colorFunction && dependencies.every(node => node.dependencies.length === 0)
    && !parseColor(portable.css)
    ? new ExpressionValue(createPluginNode({
        type: 'color',
        extension: { id: 'org.vanity.core.color-function', version: 1 },
        dependencies,
        requirements: [requirement],
        source: { helper: 'color' },
        serialize: context => context.serialize(portable),
      }))
    : portable
  return new ColorValue({ kind: 'value', value }) as unknown as VanityAuthoredColor
}

function createColorChannelNode(
  value: VanityColorChannel,
  percentNumber: boolean,
  label: string,
  accepted: 'numeric' | 'hue',
) {
  if (typeof value === 'number') {
    validateFiniteChannels(label, [value])
    return createLiteralNode(percentNumber ? 'percentage' : 'number', percentNumber ? `${number(value)}%` : value)
  }
  if (value === 'none')
    return createRawNode('unknown', 'none', { helper: label })
  if ((typeof value === 'object' || typeof value === 'function') && value !== null && ('var' in value || '$var' in value))
    return createInputNode(value)
  if (!isNodeValue(value)) {
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_COLOR',
      message: `${label} is not a number, percentage, angle, calc(), var(), or none`,
      path: [label],
      fix: 'provide a compatible CSS numeric value, token, var(), or none',
    })
  }
  const node = getNode(value)
  const compatible = accepted === 'hue'
    ? ['unknown', 'number', 'integer', 'angle'].includes(node.type)
    : ['unknown', 'number', 'integer', 'percentage', 'number-percentage'].includes(node.type)
  if (!compatible) {
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_COLOR',
      message: `${label} cannot use a <${node.type}> value in a ${accepted} color component`,
      path: [label],
      fix: `provide a ${accepted} color component value`,
    })
  }
  return node
}

function createColorExpressionNode(expr: VanityColorExpr) {
  const dependencies = collectCommonValueNodes(expr)
  return createPluginNode({
    type: 'color',
    extension: { id: 'org.vanity.core.color', version: 1 },
    dependencies,
    requirements: [...getColorRequirements(expr)],
    source: { helper: `color.${expr.kind}` },
    serialize: context => serializeExpr(expr, standaloneResolver, context),
    fold: () => ({ kind: 'preserve', reason: 'color-or-gamut-semantics' }),
  })
}

function collectCommonValueNodes(expr: VanityColorExpr): import('../values/protocol').VanityExpressionNode[] {
  switch (expr.kind) {
    case 'oklch':
    case 'parse':
      return []
    case 'value':
      return [getNode(expr.value)]
    case 'ref':
      return [createInputNode(expr.handle as unknown as VanityCssInput)]
    case 'alpha':
    case 'adjust':
      return collectCommonValueNodes(expr.input)
    case 'channels':
      return [
        ...collectCommonValueNodes(expr.input),
        ...Object.values(expr.channels).flatMap(collectChannelValueNodes),
      ]
    case 'relative':
      return [
        ...collectCommonValueNodes(expr.input),
        ...expr.channels.flatMap(collectChannelValueNodes),
        ...collectChannelValueNodes(expr.alpha),
      ]
    case 'mix':
      return [
        ...collectCommonValueNodes(expr.input),
        ...collectCommonValueNodes(expr.other),
        ...collectColorMixPercentageNodes(expr.inputPercentage),
        ...collectColorMixPercentageNodes(expr.otherPercentage),
      ]
    case 'scheme':
      return [...collectCommonValueNodes(expr.light), ...collectCommonValueNodes(expr.dark)]
    case 'contrast':
      return collectCommonValueNodes(expr.target)
  }
}

function collectColorMixPercentageNodes(
  value: VanityColorMixPercentage | undefined,
): VanityExpressionNode[] {
  if (value === undefined || typeof value === 'number')
    return []
  return [isNodeValue(value) ? getNode(value) : createInputNode(value as VanityCssInput, 'percentage')]
}

function collectChannelValueNodes(
  value: VanityColorChannel | VanityChannelOperation | undefined,
): VanityExpressionNode[] {
  if (value === undefined || typeof value === 'number' || value === 'none')
    return []
  if (isChannelOperation(value))
    return value.operations.flatMap(operation => collectChannelValueNodes(operation.value))
  if ((typeof value === 'object' || typeof value === 'function') && value !== null && ('var' in value || '$var' in value))
    return [createInputNode(value)]
  return isNodeValue(value) ? [getNode(value)] : []
}

export function getColorRequirements(
  expr: VanityColorExpr,
  adjustSpace?: VanityPolarColorSpace,
): Set<import('../values/protocol').VanityCssFeature> {
  const requirements = new Set<import('../values/protocol').VanityCssFeature>(['color-level-4'])

  switch (expr.kind) {
    case 'alpha':
      if (!isColorExpressionFoldable(expr, adjustSpace))
        requirements.add('relative-color')
      getColorRequirements(expr.input, adjustSpace).forEach(value => requirements.add(value))
      break
    case 'adjust':
      if (!isColorExpressionFoldable(expr, adjustSpace))
        requirements.add('relative-color')
      getColorRequirements(expr.input, adjustSpace).forEach(value => requirements.add(value))
      break
    case 'channels':
      if (!isColorExpressionFoldable(expr, adjustSpace))
        requirements.add('relative-color')
      getColorRequirements(expr.input, adjustSpace).forEach(value => requirements.add(value))
      break
    case 'relative':
      requirements.add('relative-color')
      getColorRequirements(expr.input, adjustSpace).forEach(value => requirements.add(value))
      break
    case 'mix':
      requirements.add('color-mix')
      getColorRequirements(expr.input, adjustSpace).forEach(value => requirements.add(value))
      getColorRequirements(expr.other, adjustSpace).forEach(value => requirements.add(value))
      break
    case 'scheme':
      requirements.add('light-dark')
      getColorRequirements(expr.light, adjustSpace).forEach(value => requirements.add(value))
      getColorRequirements(expr.dark, adjustSpace).forEach(value => requirements.add(value))
      break
    case 'contrast':
      getColorRequirements(expr.target, adjustSpace).forEach(value => requirements.add(value))
      break
    case 'value':
      getNode(expr.value).requirements.forEach(value => requirements.add(value))
      break
    case 'oklch':
    case 'parse':
    case 'ref':
      break
  }
  return requirements
}

function isColorExpressionFoldable(expr: VanityColorExpr, adjustSpace?: VanityPolarColorSpace): boolean {
  switch (expr.kind) {
    case 'oklch':
    case 'parse':
      return true
    case 'value': {
      const node = getNode(expr.value)
      if (node.dependencies.length > 0 || node.kind === 'raw' || node.kind === 'plugin')
        return false
      if (node.kind === 'function')
        return node.values.every(isValueNodeFoldable)
      if (node.kind === 'operation')
        return isValueNodeFoldable(node.left) && isValueNodeFoldable(node.right)
      if (node.kind === 'composite')
        return node.parts.every(part => typeof part === 'string' || isValueNodeFoldable(part))
      return node.kind === 'literal'
    }
    case 'ref':
    case 'scheme':
      return false
    case 'alpha':
      return isColorExpressionFoldable(expr.input, adjustSpace)
    case 'adjust': {
      const space = expr.space ?? adjustSpace
      return space !== undefined
        && isColorExpressionFoldable(expr.input, adjustSpace)
        && canFoldColorAdjustmentInSpace(foldColorCss(expr.input, 'light', getStandaloneResolver(adjustSpace)), space)
    }
    case 'channels':
      return isColorExpressionFoldable(expr.input, adjustSpace)
        && Object.values(expr.channels).every(value => isChannelFoldable(value))
    case 'relative':
      return false
    case 'mix':
      return isMixShapeFoldable(expr)
        && isColorExpressionFoldable(expr.input, adjustSpace) && isColorExpressionFoldable(expr.other, adjustSpace)
    case 'contrast':
      return isColorExpressionFoldable(expr.target, adjustSpace)
  }
}

function isValueNodeFoldable(node: import('../values/protocol').VanityExpressionNode): boolean {
  if (node.dependencies.length > 0 || node.kind === 'raw' || node.kind === 'plugin' || node.kind === 'var')
    return false
  if (node.kind === 'function')
    return node.values.every(isValueNodeFoldable)
  if (node.kind === 'operation')
    return isValueNodeFoldable(node.left) && isValueNodeFoldable(node.right)
  if (node.kind === 'composite')
    return node.parts.every(part => typeof part === 'string' || isValueNodeFoldable(part))
  return true
}

function isChannelFoldable(value: VanityColorChannel | VanityChannelOperation | undefined): boolean {
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
        validateFiniteChannels(`oklch.from ${name}`, [channelValue])
      if (channelValue !== undefined) {
        createColorChannelNode(
          channelValue,
          false,
          `oklch.from ${name}`,
          name === 'h' ? 'hue' : 'numeric',
        )
      }

      if (operation.kind === 'divide' && typeof channelValue === 'number' && channelValue === 0) {
        throw new VanityError({
          code: 'VANITY_TOKENS_INVALID_COLOR',
          message: `oklch.from ${name} cannot divide by zero`,
          path: ['oklch', 'from', name],
          fix: 'divide by a non-zero channel value',
        })
      }
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
    createColorChannelNode(operation.value, false, label, hue ? 'hue' : 'numeric')
    if (operation.kind === 'divide' && operation.value === 0) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_COLOR',
        message: `${label} cannot divide by zero`,
        path: [label],
        fix: 'divide by a non-zero channel value',
      })
    }
  }
}

function validateFiniteChannels(name: string, values: Array<number | undefined>): void {
  for (const value of values) {
    if (value !== undefined && !Number.isFinite(value)) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_COLOR',
        message: `${name} channels must be finite; received ${value}`,
        path: [name],
        fix: 'pass finite channel values',
      })
    }
  }
}

function number(value: number): string {
  return String(Object.is(value, -0) ? 0 : value)
}
