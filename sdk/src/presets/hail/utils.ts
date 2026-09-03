import type {
  VanityCssInput,
  VanityFragment,
  VanityNumericColorChannel,
  VanityOpenSystemBase,
  VanityUtilTree,
} from '@mszr/vanity'
import type { HailColorControls } from './color'
import type { HailNormalizedOptions } from './config'
import type {
  HailBem,
  HailMixins,
  HailSize,
} from './types'
import { defineUtils } from '@mszr/vanity'
import { hailExact, hailSpan } from './markers'

export function createHailUtils(
  ds: VanityOpenSystemBase,
  options: HailNormalizedOptions,
  controls: HailColorControls & {
    readonly base: VanityCssInput<'number' | 'integer'>
    readonly remTarget: VanityCssInput<'number' | 'integer'>
  },
) {
  const size = ((step: VanityCssInput, unit?: 'px' | 'rem' | 'bem') => {
    if (typeof step === 'number' && options.resolution('base') === 'static') {
      const value = options.base * step
      if (unit === undefined)
        return value
      if (unit === 'px')
        return ds.length.px(value)
      if (options.resolution('remTarget') === 'static')
        return ds.length.rem(value / options.remTarget)
    }
    const scaled = ds.calc(controls.base as number).multiply(step as number)
    if (unit === undefined)
      return scaled
    if (unit === 'px')
      return scaled.multiply(ds.length.px(1))
    return scaled.divide(controls.remTarget as number).multiply(ds.length.rem(1))
  }) as HailSize

  const createBem: HailBem = step => size(step, 'bem')

  const mx: HailMixins = {
    square: dimension => fragment({
      inlineSize: dimension,
      blockSize: dimension,
    }),
    circle: dimension => fragment({
      inlineSize: dimension,
      blockSize: dimension,
      borderRadius: '50%',
    }),
    truncate: (lines = 1) => {
      if (!Number.isInteger(lines) || lines < 1)
        throw new RangeError(`[hail] mx.truncate() lines must be a positive integer; received ${lines}`)
      return lines === 1
        ? fragment({
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          })
        : fragment({
            display: '-webkit-box',
            overflow: 'hidden',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: lines,
          })
    },
  }

  const getContrastOf = <Base extends Parameters<typeof ds.oklch.from>[0]>(base: Base) =>
    ds.oklch.from(base, {
      l: ds.channel
        .subtract(controls.contrastPivotL as VanityNumericColorChannel)
        .multiply(-1000) as import('@mszr/vanity').VanityChannelOperation<VanityNumericColorChannel>,
      c: 0.04,
    })

  return defineUtils({
    [options.spanName]: hailSpan,
    [options.exactName]: hailExact,
    size,
    bem: createBem,
    contrastOf: getContrastOf,
    mx: mx as unknown as VanityUtilTree,
  })
}

function fragment<const Fragment extends VanityFragment>(value: Fragment): Fragment {
  return value
}
