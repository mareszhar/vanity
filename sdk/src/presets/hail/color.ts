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

export function hailColorConstructors(
  ds: VanityOpenSystemBase,
  options: HailNormalizedOptions,
  controls: HailColorControls,
) {
  const absolute = (
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
      return round(minimum + span * input)
    }
    const { minimum } = controls.ranges[name]
    return ds.calc(minimum).add(spanOf(name).multiply(input))
  }

  function spanOf(name: HailRangeName) {
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

  const relative = (
    spec: ChannelSpec,
    input: HailRelativeNumericInput | HailRelativeHueInput | undefined,
  ): VanityNumericColorChannel | VanityHueChannel | VanityChannelOperation | undefined => {
    if (input === undefined || isChannelOperation(input))
      return input
    if (isHailSpan(input)) {
      const delta = staticSpanDelta(spec.name, input.input)
        ?? (options.ranges[spec.name] === undefined
          ? input.input
          : spanOf(spec.name).multiply(input.input))
      return ds.channel.add(delta as VanityNumericColorChannel)
    }
    return absolute(spec, input)
  }

  function staticSpanDelta(
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
    return round(span * input)
  }

  const elevationCoordinate = (input: HailNumericInput): NumericCssInput => {
    const coordinate = absolute({ name: 'e' }, input) as NumericCssInput
    const mostElevated = controls.mostElevatedL
    if (mostElevated === undefined)
      throw new TypeError('[hail] elevation needs the scheme coordinate installed by color.elevation')
    const schemePosition = ds.calc(1)
      .subtract(coordinate)
      .add(ds.calc(mostElevated).multiply(ds.calc(coordinate).multiply(2).subtract(1)))
    return normalized('l', schemePosition)
  }

  const relativeElevation = (
    input: HailRelativeNumericInput | undefined,
  ): VanityNumericColorChannel | VanityChannelOperation | undefined => {
    if (input === undefined)
      return undefined
    if (isHailSpan(input)) {
      const mostElevated = controls.mostElevatedL
      if (mostElevated === undefined)
        throw new TypeError('[hail] elevation needs the scheme coordinate installed by color.elevation')
      const elevationSpan = staticSpanDelta('e', input.input)
        ?? (options.ranges.e === undefined
          ? input.input
          : spanOf('e').multiply(input.input))
      const lightnessSpan = typeof elevationSpan === 'number'
        ? staticSpanDelta('l', elevationSpan)
        ?? (options.ranges.l === undefined ? elevationSpan : spanOf('l').multiply(elevationSpan))
        : options.ranges.l === undefined
          ? elevationSpan
          : spanOf('l').multiply(elevationSpan)
      const direction = ds.calc(mostElevated).multiply(2).subtract(1)
      return ds.channel.add(ds.calc(lightnessSpan).multiply(direction))
    }
    if (isChannelOperation(input))
      return input
    return elevationCoordinate(input) as VanityNumericColorChannel
  }

  const rgbxFrom = <Base extends VanityColorish>(base: Base, channels: HailRgbxChannels): VanityAuthoredColor =>
    ds.rgb.from(base, {
      r: channels.r,
      g: channels.g,
      b: channels.b,
      alpha: relative({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })

  const hslxFrom = <Base extends VanityColorish>(base: Base, channels: HailHslxChannels): VanityAuthoredColor =>
    ds.hsl.from(base, {
      h: relative({ name: 'h', hue: true }, channels.h) as VanityHueChannel | VanityChannelOperation<VanityHueChannel> | undefined,
      s: relative({ name: 's' }, channels.s) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      l: relative({ name: 'l' }, channels.l) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      alpha: relative({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })

  const hwbxFrom = <Base extends VanityColorish>(base: Base, channels: HailHwbxChannels): VanityAuthoredColor =>
    ds.hwb.from(base, {
      h: relative({ name: 'h', hue: true }, channels.h) as VanityHueChannel | VanityChannelOperation<VanityHueChannel> | undefined,
      w: relative({ name: 'w' }, channels.w) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      b: relative({ name: 'b' }, channels.b) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      alpha: relative({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })

  const labxFrom = <Base extends VanityColorish>(base: Base, channels: HailLabxChannels): VanityAuthoredColor =>
    ds.lab.from(base, {
      l: relative({ name: 'l' }, channels.l) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      a: relative({ name: 'a' }, channels.a) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      b: relative({ name: 'b' }, channels.b) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      alpha: relative({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })

  const lchxFrom = <Base extends VanityColorish>(base: Base, channels: HailLchxChannels): VanityAuthoredColor =>
    ds.lch.from(base, {
      l: relative({ name: 'l' }, channels.l) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      c: relative({ name: 'c' }, channels.c) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      h: relative({ name: 'h', hue: true }, channels.h) as VanityHueChannel | VanityChannelOperation<VanityHueChannel> | undefined,
      alpha: relative({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })

  const oklabxFrom = <Base extends VanityColorish>(base: Base, channels: HailLabxChannels): VanityAuthoredColor =>
    ds.oklab.from(base, {
      l: relative({ name: 'l' }, channels.l) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      a: relative({ name: 'a' }, channels.a) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      b: relative({ name: 'b' }, channels.b) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      alpha: relative({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })

  const oklchxFrom = <Base extends VanityColorish>(
    base: Base,
    channels: HailOklchxChannels<boolean>,
  ): VanityAuthoredColor => {
    if ('e' in channels && channels.e !== undefined && channels.l !== undefined)
      throw new TypeError('[hail] oklchx.from() accepts either l or e, never both')
    return ds.oklch.from(base, {
      l: ('e' in channels && channels.e !== undefined
        ? relativeElevation(channels.e)
        : relative({ name: 'l' }, channels.l)) as
        | VanityNumericColorChannel
        | VanityChannelOperation<VanityNumericColorChannel>
        | undefined,
      c: relative({ name: 'c' }, channels.c) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
      h: relative({ name: 'h', hue: true }, channels.h) as VanityHueChannel | VanityChannelOperation<VanityHueChannel> | undefined,
      alpha: relative({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
    })
  }

  const colorxFrom = <Base extends VanityColorish>(base: Base, channels: HailColorxChannels): VanityAuthoredColor =>
    ds.color.from(base, {
      ...channels,
      alpha: relative({ name: 'alpha' }, channels.alpha) as VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel> | undefined,
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
          : { alpha: absolute({ name: 'alpha' }, optionsInput.alpha) as VanityNumericColorChannel },
      )
    }
    return ds.color(
      space as VanityCssColorSpace,
      first as VanityNumericColorChannel,
      second as VanityNumericColorChannel,
      third as VanityNumericColorChannel,
      alpha === undefined
        ? undefined
        : absolute({ name: 'alpha' }, alpha as HailNumericInput) as VanityNumericColorChannel,
    )
  }) as HailColorx

  return defineConstructors({
    rgbx: {
      call: (
        r: VanityNumericColorChannel,
        g: VanityNumericColorChannel,
        b: VanityNumericColorChannel,
        alpha?: HailNumericInput,
      ) => ds.rgb(r, g, b, alpha === undefined ? undefined : absolute({ name: 'alpha' }, alpha) as VanityNumericColorChannel),
      from: rgbxFrom,
    },
    hslx: {
      call: (h: HailHueInput, s: HailNumericInput, l: HailNumericInput, alpha?: HailNumericInput) =>
        ds.hsl(
          absolute({ name: 'h', hue: true }, h) as VanityHueChannel,
          absolute({ name: 's', percent: true }, s) as VanityNumericColorChannel,
          absolute({ name: 'l', percent: true }, l) as VanityNumericColorChannel,
          alpha === undefined ? undefined : absolute({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
        ),
      from: hslxFrom,
    },
    hwbx: {
      call: (h: HailHueInput, w: HailNumericInput, b: HailNumericInput, alpha?: HailNumericInput) =>
        ds.hwb(
          absolute({ name: 'h', hue: true }, h) as VanityHueChannel,
          absolute({ name: 'w', percent: true }, w) as VanityNumericColorChannel,
          absolute({ name: 'b', percent: true }, b) as VanityNumericColorChannel,
          alpha === undefined ? undefined : absolute({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
        ),
      from: hwbxFrom,
    },
    labx: {
      call: (l: HailNumericInput, a: HailNumericInput, b: HailNumericInput, alpha?: HailNumericInput) =>
        ds.lab(
          absolute({ name: 'l' }, l) as VanityNumericColorChannel,
          absolute({ name: 'a' }, a) as VanityNumericColorChannel,
          absolute({ name: 'b' }, b) as VanityNumericColorChannel,
          alpha === undefined ? undefined : absolute({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
        ),
      from: labxFrom,
    },
    lchx: {
      call: (l: HailNumericInput, c: HailNumericInput, h: HailHueInput, alpha?: HailNumericInput) =>
        ds.lch(
          absolute({ name: 'l' }, l) as VanityNumericColorChannel,
          absolute({ name: 'c' }, c) as VanityNumericColorChannel,
          absolute({ name: 'h', hue: true }, h) as VanityHueChannel,
          alpha === undefined ? undefined : absolute({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
        ),
      from: lchxFrom,
    },
    oklabx: {
      call: (l: HailNumericInput, a: HailNumericInput, b: HailNumericInput, alpha?: HailNumericInput) =>
        ds.oklab(
          absolute({ name: 'l' }, l) as VanityNumericColorChannel,
          absolute({ name: 'a' }, a) as VanityNumericColorChannel,
          absolute({ name: 'b' }, b) as VanityNumericColorChannel,
          alpha === undefined ? undefined : absolute({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
        ),
      from: oklabxFrom,
    },
    oklchx: {
      call: (l: HailNumericInput, c: HailNumericInput, h: HailHueInput, alpha?: HailNumericInput) =>
        ds.oklch(
          absolute({ name: 'l' }, l) as VanityNumericColorChannel,
          absolute({ name: 'c' }, c) as VanityNumericColorChannel,
          absolute({ name: 'h', hue: true }, h) as VanityHueChannel,
          alpha === undefined ? undefined : absolute({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
        ),
      from: oklchxFrom,
      ...(options.elevation
        ? {
            inE: (e: HailNumericInput, c: HailNumericInput, h: HailHueInput, alpha?: HailNumericInput) =>
              ds.oklch(
                elevationCoordinate(e) as VanityNumericColorChannel,
                absolute({ name: 'c' }, c) as VanityNumericColorChannel,
                absolute({ name: 'h', hue: true }, h) as VanityHueChannel,
                alpha === undefined ? undefined : absolute({ name: 'alpha' }, alpha) as VanityNumericColorChannel,
              ),
          }
        : {}),
    },
    colorx: {
      call: colorxCall,
      from: colorxFrom,
    },
  })
}

function isChannelOperation(value: unknown): value is VanityChannelOperation {
  return typeof value === 'object'
    && value !== null
    && 'kind' in value
    && value.kind === 'channel-expression'
}

function round(value: number): number {
  return Math.round(value * 1e12) / 1e12
}
