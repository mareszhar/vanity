import type {
  VanityAuthoredColor,
  VanityChannelOperation,
  VanityColorFunctionChannels,
  VanityColorish,
  VanityCssColorSpace,
  VanityCssInput,
  VanityHueChannel,
  VanityNumericColorChannel,
  VanityOpenSystemBase,
} from '@mszr/vanity'
import type { HailNormalizedOptions } from './config'
import type {
  HailColorx,
  HailColorxChannels,
  HailHslxChannels,
  HailHueInput,
  HailHwbxChannels,
  HailLabxChannels,
  HailLchxChannels,
  HailNumericInput,
  HailOklchxChannels,
  HailRangeName,
  HailRelativeHueInput,
  HailRelativeNumericInput,
  HailRgbxChannels,
} from './types'
import { defineConstructors } from '@mszr/vanity'
import { isHailExact, isHailSpan } from './markers'

type NumericCssInput = VanityCssInput<'number' | 'integer' | 'percentage' | 'number-percentage'>

export interface HailColorControls {
  readonly ranges: Readonly<Record<
    HailRangeName,
    { readonly minimum: NumericCssInput, readonly maximum: NumericCssInput }
  >>
  readonly contrastPivotL: NumericCssInput
  readonly mostElevatedL?: NumericCssInput
}

interface ChannelSpec {
  readonly name: HailRangeName
  readonly hue?: boolean
  /** Absolute HSL/HWB channels serialize computed normalized values as percentages. */
  readonly percent?: boolean
}

export function createHailColorConstructors(
  ds: VanityOpenSystemBase,
  options: HailNormalizedOptions,
  controls: HailColorControls,
) {
  const resolveAbsoluteChannel = (
    spec: ChannelSpec,
    input: HailNumericInput | HailHueInput,
  ): VanityNumericColorChannel | VanityHueChannel => {
    if (isHailSpan(input))
      throw new TypeError(`[hail] span() is relative and cannot occupy absolute '${spec.name}' position; use exact() or a bare value`)
    if (isHailExact(input))
      return input.input as VanityNumericColorChannel | VanityHueChannel
    if (typeof input !== 'number' || options.ranges[spec.name] === undefined)
      return input
    const value = normalized(spec.name, input)
    return spec.percent && typeof value !== 'number'
      ? ds.calc(value).multiply(ds.percent(1))
      : value as VanityNumericColorChannel
  }

  function normalized(name: HailRangeName, input: NumericCssInput): NumericCssInput {
    if (options.ranges[name] === undefined)
      return input
    if (typeof input === 'number' && options.resolution(name) === 'static') {
      const [minimum, maximum] = options.ranges[name]
      const span = name === 'h' && minimum > maximum
        ? maximum - minimum + 360
        : maximum - minimum
      return roundNumber(minimum + span * input)
    }
    const { minimum } = controls.ranges[name]
    return ds.calc(minimum).add(getChannelSpan(name).multiply(input))
  }

  function getChannelSpan(name: HailRangeName) {
    if (options.ranges[name] !== undefined && options.resolution(name) === 'static') {
      const [minimum, maximum] = options.ranges[name]
      return ds.calc(name === 'h' && minimum > maximum
        ? maximum - minimum + 360
        : maximum - minimum)
    }
    const { minimum, maximum } = controls.ranges[name]
    const span = ds.calc(maximum).subtract(minimum)
    return name === 'h' && options.ranges.h !== undefined && options.ranges.h[0] > options.ranges.h[1]
      ? span.add(360)
      : span
  }

  const resolveRelativeChannel = (
    spec: ChannelSpec,
    input: HailRelativeNumericInput | HailRelativeHueInput | undefined,
  ): VanityNumericColorChannel | VanityHueChannel | VanityChannelOperation | undefined => {
    if (input === undefined || isChannelOperation(input))
      return input
    if (isHailSpan(input)) {
      const delta = getStaticSpanDelta(spec.name, input.input)
        ?? (options.ranges[spec.name] === undefined
          ? input.input
          : getChannelSpan(spec.name).multiply(input.input))
      return ds.channel.add(delta as VanityNumericColorChannel)
    }
    return resolveAbsoluteChannel(spec, input)
  }

  function getStaticSpanDelta(
    name: HailRangeName,
    input: VanityCssInput,
  ): number | undefined {
    const range = options.ranges[name]
    if (range === undefined || options.resolution(name) !== 'static' || typeof input !== 'number')
      return undefined
    const [minimum, maximum] = range
    const span = name === 'h' && minimum > maximum
      ? maximum - minimum + 360
      : maximum - minimum
    return roundNumber(span * input)
  }

  const getElevationCoordinate = (input: HailNumericInput): NumericCssInput => {
    const coordinate = resolveAbsoluteChannel({ name: 'e' }, input) as NumericCssInput
    const mostElevated = controls.mostElevatedL
    if (mostElevated === undefined)
      throw new TypeError('[hail] elevation needs the scheme coordinate installed by color.elevation')
    const schemePosition = ds.calc(1)
      .subtract(coordinate)
      .add(ds.calc(mostElevated).multiply(ds.calc(coordinate).multiply(2).subtract(1)))
    return normalized('l', schemePosition)
  }

  const resolveRelativeElevation = (
    input: HailRelativeNumericInput | undefined,
  ): VanityNumericColorChannel | VanityChannelOperation | undefined => {
    if (input === undefined)
      return undefined
    if (isHailSpan(input)) {
      const mostElevated = controls.mostElevatedL
      if (mostElevated === undefined)
        throw new TypeError('[hail] elevation needs the scheme coordinate installed by color.elevation')
      const elevationSpan = getStaticSpanDelta('e', input.input)
        ?? (options.ranges.e === undefined
          ? input.input
          : getChannelSpan('e').multiply(input.input))
      const lightnessSpan = typeof elevationSpan === 'number'
        ? getStaticSpanDelta('l', elevationSpan)
        ?? (options.ranges.l === undefined ? elevationSpan : getChannelSpan('l').multiply(elevationSpan))
        : options.ranges.l === undefined
          ? elevationSpan
          : getChannelSpan('l').multiply(elevationSpan)
      const direction = ds.calc(mostElevated).multiply(2).subtract(1)
      return ds.channel.add(ds.calc(lightnessSpan).multiply(direction))
    }
    if (isChannelOperation(input))
      return input
    return getElevationCoordinate(input) as VanityNumericColorChannel
  }

  const createRgbxFrom = <Base extends VanityColorish>(base: Base, channels: HailRgbxChannels): VanityAuthoredColor =>
    ds.rgb.from(base, {
      r: channels.r,
      g: channels.g,
      b: channels.b,
      alpha: resolveRelativeChannel({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })

  const createHslxFrom = <Base extends VanityColorish>(base: Base, channels: HailHslxChannels): VanityAuthoredColor =>
    ds.hsl.from(base, {
      h: resolveRelativeChannel({ name: 'h', hue: true }, channels.h) as VanityHueChannel | VanityChannelOperation<VanityHueChannel> | undefined,
      s: resolveRelativeChannel({ name: 's' }, channels.s) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      l: resolveRelativeChannel({ name: 'l' }, channels.l) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      alpha: resolveRelativeChannel({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })

  const createHwbxFrom = <Base extends VanityColorish>(base: Base, channels: HailHwbxChannels): VanityAuthoredColor =>
    ds.hwb.from(base, {
      h: resolveRelativeChannel({ name: 'h', hue: true }, channels.h) as VanityHueChannel | VanityChannelOperation<VanityHueChannel> | undefined,
      w: resolveRelativeChannel({ name: 'w' }, channels.w) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      b: resolveRelativeChannel({ name: 'b' }, channels.b) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      alpha: resolveRelativeChannel({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })

  const createLabxFrom = <Base extends VanityColorish>(base: Base, channels: HailLabxChannels): VanityAuthoredColor =>
    ds.lab.from(base, {
      l: resolveRelativeChannel({ name: 'l' }, channels.l) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      a: resolveRelativeChannel({ name: 'a' }, channels.a) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      b: resolveRelativeChannel({ name: 'b' }, channels.b) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      alpha: resolveRelativeChannel({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })

  const createLchxFrom = <Base extends VanityColorish>(base: Base, channels: HailLchxChannels): VanityAuthoredColor =>
    ds.lch.from(base, {
      l: resolveRelativeChannel({ name: 'l' }, channels.l) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      c: resolveRelativeChannel({ name: 'c' }, channels.c) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      h: resolveRelativeChannel({ name: 'h', hue: true }, channels.h) as VanityHueChannel | VanityChannelOperation<VanityHueChannel> | undefined,
      alpha: resolveRelativeChannel({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })

  const createOklabxFrom = <Base extends VanityColorish>(base: Base, channels: HailLabxChannels): VanityAuthoredColor =>
    ds.oklab.from(base, {
      l: resolveRelativeChannel({ name: 'l' }, channels.l) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      a: resolveRelativeChannel({ name: 'a' }, channels.a) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      b: resolveRelativeChannel({ name: 'b' }, channels.b) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      alpha: resolveRelativeChannel({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })

  const createOklchxFrom = <Base extends VanityColorish>(
    base: Base,
    channels: HailOklchxChannels<boolean>,
  ): VanityAuthoredColor => {
    if ('e' in channels && channels.e !== undefined && channels.l !== undefined)
      throw new TypeError('[hail] oklchx.from() accepts either l or e, never both')
    return ds.oklch.from(base, {
      l: ('e' in channels && channels.e !== undefined
        ? resolveRelativeElevation(channels.e)
        : resolveRelativeChannel({ name: 'l' }, channels.l)) as
        | VanityNumericColorChannel
        | VanityChannelOperation<VanityNumericColorChannel>
        | undefined,
      c: resolveRelativeChannel({ name: 'c' }, channels.c) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      h: resolveRelativeChannel({ name: 'h', hue: true }, channels.h) as VanityHueChannel | VanityChannelOperation<VanityHueChannel> | undefined,
      alpha: resolveRelativeChannel({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })
  }

  const createColorxFrom = <Base extends VanityColorish>(base: Base, channels: HailColorxChannels): VanityAuthoredColor =>
    ds.color.from(base, {
      ...channels,
      alpha: resolveRelativeChannel({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    } as VanityColorFunctionChannels)

  const colorxCall = ((...args: readonly unknown[]): VanityAuthoredColor => {
    if (args.length === 1)
      return ds.color(args[0] as string)
    const [space, first, second, third, alpha] = args
    if (Array.isArray(first)) {
      const optionsInput = second as { readonly alpha?: HailNumericInput } | undefined
      return ds.color(
        space as VanityCssColorSpace,
        first as [VanityNumericColorChannel, ...VanityNumericColorChannel[]],
        optionsInput?.alpha === undefined
          ? undefined
          : { alpha: resolveAbsoluteChannel({ name: 'alpha' }, optionsInput.alpha) as VanityNumericColorChannel },
      )
    }
    return ds.color(
      space as VanityCssColorSpace,
      first as VanityNumericColorChannel,
      second as VanityNumericColorChannel,
      third as VanityNumericColorChannel,
      alpha === undefined
        ? undefined
        : resolveAbsoluteChannel({ name: 'alpha' }, alpha as HailNumericInput) as VanityNumericColorChannel,
    )
  }) as HailColorx

  return defineConstructors({
    rgbx: {
      call: (
        r: VanityNumericColorChannel,
        g: VanityNumericColorChannel,
        b: VanityNumericColorChannel,
        alpha?: HailNumericInput,
      ) => ds.rgb(r, g, b, alpha === undefined ? undefined : resolveAbsoluteChannel({ name: 'alpha' }, alpha) as VanityNumericColorChannel),
      from: createRgbxFrom,
    },
    hslx: {
      call: (h: HailHueInput, s: HailNumericInput, l: HailNumericInput, alpha?: HailNumericInput) =>
        ds.hsl(
          resolveAbsoluteChannel({ name: 'h', hue: true }, h) as VanityHueChannel,
          resolveAbsoluteChannel({ name: 's', percent: true }, s) as VanityNumericColorChannel,
          resolveAbsoluteChannel({ name: 'l', percent: true }, l) as VanityNumericColorChannel,
          alpha === undefined ? undefined : resolveAbsoluteChannel({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
        ),
      from: createHslxFrom,
    },
    hwbx: {
      call: (h: HailHueInput, w: HailNumericInput, b: HailNumericInput, alpha?: HailNumericInput) =>
        ds.hwb(
          resolveAbsoluteChannel({ name: 'h', hue: true }, h) as VanityHueChannel,
          resolveAbsoluteChannel({ name: 'w', percent: true }, w) as VanityNumericColorChannel,
          resolveAbsoluteChannel({ name: 'b', percent: true }, b) as VanityNumericColorChannel,
          alpha === undefined ? undefined : resolveAbsoluteChannel({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
        ),
      from: createHwbxFrom,
    },
    labx: {
      call: (l: HailNumericInput, a: HailNumericInput, b: HailNumericInput, alpha?: HailNumericInput) =>
        ds.lab(
          resolveAbsoluteChannel({ name: 'l' }, l) as VanityNumericColorChannel,
          resolveAbsoluteChannel({ name: 'a' }, a) as VanityNumericColorChannel,
          resolveAbsoluteChannel({ name: 'b' }, b) as VanityNumericColorChannel,
          alpha === undefined ? undefined : resolveAbsoluteChannel({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
        ),
      from: createLabxFrom,
    },
    lchx: {
      call: (l: HailNumericInput, c: HailNumericInput, h: HailHueInput, alpha?: HailNumericInput) =>
        ds.lch(
          resolveAbsoluteChannel({ name: 'l' }, l) as VanityNumericColorChannel,
          resolveAbsoluteChannel({ name: 'c' }, c) as VanityNumericColorChannel,
          resolveAbsoluteChannel({ name: 'h', hue: true }, h) as VanityHueChannel,
          alpha === undefined ? undefined : resolveAbsoluteChannel({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
        ),
      from: createLchxFrom,
    },
    oklabx: {
      call: (l: HailNumericInput, a: HailNumericInput, b: HailNumericInput, alpha?: HailNumericInput) =>
        ds.oklab(
          resolveAbsoluteChannel({ name: 'l' }, l) as VanityNumericColorChannel,
          resolveAbsoluteChannel({ name: 'a' }, a) as VanityNumericColorChannel,
          resolveAbsoluteChannel({ name: 'b' }, b) as VanityNumericColorChannel,
          alpha === undefined ? undefined : resolveAbsoluteChannel({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
        ),
      from: createOklabxFrom,
    },
    oklchx: {
      call: (l: HailNumericInput, c: HailNumericInput, h: HailHueInput, alpha?: HailNumericInput) =>
        ds.oklch(
          resolveAbsoluteChannel({ name: 'l' }, l) as VanityNumericColorChannel,
          resolveAbsoluteChannel({ name: 'c' }, c) as VanityNumericColorChannel,
          resolveAbsoluteChannel({ name: 'h', hue: true }, h) as VanityHueChannel,
          alpha === undefined ? undefined : resolveAbsoluteChannel({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
        ),
      from: createOklchxFrom,
      ...(options.elevation
        ? {
            inE: (e: HailNumericInput, c: HailNumericInput, h: HailHueInput, alpha?: HailNumericInput) =>
              ds.oklch(
                getElevationCoordinate(e) as VanityNumericColorChannel,
                resolveAbsoluteChannel({ name: 'c' }, c) as VanityNumericColorChannel,
                resolveAbsoluteChannel({ name: 'h', hue: true }, h) as VanityHueChannel,
                alpha === undefined ? undefined : resolveAbsoluteChannel({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
              ),
          }
        : {}),
    },
    colorx: {
      call: colorxCall,
      from: createColorxFrom,
    },
  })
}

function isChannelOperation(value: unknown): value is VanityChannelOperation {
  return typeof value === 'object'
    && value !== null
    && 'kind' in value
    && value.kind === 'channel-expression'
}

function roundNumber(value: number): number {
  return Math.round(value * 1e12) / 1e12
}
