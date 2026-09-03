import type {
  VanityConfiguredTokenShape,
  VanityOpenSystemBase,
} from '@mszr/vanity'
import type { HailNormalizedOptions } from './config'
import type {
  HailControlName,
  HailControlResolution,
  HailRange,
  HailRangeName,
} from './types'

const NATIVE_RANGES = {
  l: [0, 1],
  c: [0, 1],
  h: [0, 360],
  s: [0, 100],
  w: [0, 100],
  a: [-125, 125],
  b: [-125, 125],
  alpha: [0, 1],
  e: [0, 1],
} as const satisfies Readonly<Record<HailRangeName, HailRange>>

export type HailControlDefinition = VanityConfiguredTokenShape<object, 'number'>

export function createHailControl(
  ds: VanityOpenSystemBase,
  name: HailControlName,
  value: number,
  options: HailNormalizedOptions,
): HailControlDefinition {
  return defineControl(
    ds,
    value,
    options.resolution(name),
    `Hail ${name} control (${options.resolution(name)} resolution).`,
  )
}

export function createHailRange(
  ds: VanityOpenSystemBase,
  name: HailRangeName,
  options: HailNormalizedOptions,
): readonly [minimum: HailControlDefinition, maximum: HailControlDefinition] {
  const [minimum, maximum] = options.ranges[name] ?? NATIVE_RANGES[name]
  return [
    createHailControl(ds, name, minimum, options),
    createHailControl(ds, name, maximum, options),
  ]
}

function defineControl(
  ds: VanityOpenSystemBase,
  value: number,
  resolution: HailControlResolution,
  description: string,
): HailControlDefinition {
  if (resolution === 'mutable') {
    return ds.tdef.number({
      val: value,
      emit: true,
      reference: 'var',
      mutable: true,
      register: true,
      description,
    })
  }
  if (resolution === 'token') {
    return ds.tdef.number({
      val: value,
      emit: true,
      reference: 'var',
      description,
    })
  }
  return ds.tdef.number({
    val: value,
    emit: false,
    reference: 'val',
    description,
  })
}
