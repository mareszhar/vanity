import type {
  HailControlName,
  HailControlResolution,
  HailOptions,
  HailPresetName,
  HailRange,
  HailRangeName,
} from './types'
import { VanityError } from '../../diagnostics'

const HAIL_PRESET_NAMES = [
  'reset',
  'palette',
  'roles',
  'sizes',
  'breakpoints',
  'motion',
  'theming',
  'icons',
] as const satisfies readonly HailPresetName[]

const HAIL_RANGE_NAMES = [
  'l',
  'c',
  'h',
  's',
  'w',
  'a',
  'b',
  'alpha',
  'e',
] as const satisfies readonly HailRangeName[]

export interface HailNormalizedOptions {
  readonly base: number
  readonly remTarget: number
  readonly contrastPivotL: number
  readonly elevation: boolean
  readonly ranges: Readonly<Partial<Record<HailRangeName, HailRange>>>
  readonly resolution: (control: HailControlName) => HailControlResolution
  readonly spanName: string
  readonly exactName: string
  readonly presets: ReadonlySet<HailPresetName>
}

export function normalizeHailOptions(options: HailOptions = {}): HailNormalizedOptions {
  const base = options.size?.base ?? 8
  const remTarget = options.size?.remTarget ?? 16
  const contrastPivotL = options.color?.contrastPivotL ?? 0.65
  validateFinitePositive(base, 'size.base')
  validateFinitePositive(remTarget, 'size.remTarget')
  validateFinite(contrastPivotL, 'color.contrastPivotL')

  const ranges = options.color?.ranges ?? {}
  for (const name of HAIL_RANGE_NAMES) {
    const range = ranges[name]
    if (range === undefined)
      continue
    validateRange(name, range)
  }

  const controls = options.controls
  const defaultResolution = typeof controls === 'string'
    ? controls
    : controls?.default ?? 'static'
  const overrides = typeof controls === 'object' ? controls.overrides ?? {} : {}
  const resolution = (control: HailControlName): HailControlResolution =>
    overrides[control] ?? defaultResolution

  const spanName = options.color?.markers?.span ?? 'span'
  const exactName = options.color?.markers?.exact ?? 'exact'
  validateMemberName(spanName, 'color.markers.span')
  validateMemberName(exactName, 'color.markers.exact')
  if (spanName === exactName) {
    throw new VanityError({
      code: 'VANITY_HAIL_INVALID_CONFIG',
      message: `span and exact markers cannot share the name '${spanName}'`,
      path: ['color', 'markers'],
      fix: 'Give color.markers.span and color.markers.exact distinct names.',
    })
  }
  for (const reserved of ['size', 'bem', 'contrastOf', 'mx']) {
    if (spanName === reserved || exactName === reserved) {
      throw new VanityError({
        code: 'VANITY_HAIL_INVALID_CONFIG',
        message: `marker name '${reserved}' collides with Hail's '${reserved}' utility`,
        path: ['color', 'markers'],
        fix: 'Choose marker names that do not collide with Hail utilities.',
      })
    }
  }

  const presets = selectPresets(options)
  if (presets.has('roles') && !presets.has('palette')) {
    throw new VanityError({
      code: 'VANITY_HAIL_INVALID_CONFIG',
      message: 'the \'roles\' preset requires \'palette\'; include palette or exclude roles',
      path: ['presets'],
      fix: 'Include \'palette\' when enabling \'roles\', or exclude \'roles\'.',
    })
  }
  if (presets.has('theming') && !presets.has('roles')) {
    throw new VanityError({
      code: 'VANITY_HAIL_INVALID_CONFIG',
      message: 'the \'theming\' preset requires \'roles\'; include roles or exclude theming',
      path: ['presets'],
      fix: 'Include \'roles\' when enabling \'theming\', or exclude \'theming\'.',
    })
  }

  return Object.freeze({
    base,
    remTarget,
    contrastPivotL,
    elevation: options.color?.elevation === true,
    ranges: Object.freeze({ ...ranges }),
    resolution,
    spanName,
    exactName,
    presets,
  })
}

function selectPresets(options: HailOptions): ReadonlySet<HailPresetName> {
  if (options.presets === undefined)
    return new Set()

  const listed = new Set(options.presets.listed)
  return options.presets.mode === 'opt-in'
    ? listed
    : new Set(HAIL_PRESET_NAMES.filter(name => !listed.has(name)))
}

function validateRange(name: HailRangeName, range: HailRange): void {
  const [minimum, maximum] = range
  validateFinite(minimum, `color.ranges.${name}[0]`)
  validateFinite(maximum, `color.ranges.${name}[1]`)
  if (name === 'h') {
    if (minimum < 0 || minimum > 360 || maximum < 0 || maximum > 360 || minimum === maximum) {
      throw new VanityError({
        code: 'VANITY_HAIL_INVALID_CONFIG',
        message: `color.ranges.h endpoints must be distinct values within 0..360; received ${minimum}..${maximum}`,
        path: ['color', 'ranges', name],
        fix: 'Use distinct hue endpoints between 0 and 360.',
      })
    }
    return
  }
  if (minimum > maximum) {
    throw new VanityError({
      code: 'VANITY_HAIL_INVALID_CONFIG',
      message: `color.ranges.${name} must be ordered [minimum, maximum]; received ${minimum}..${maximum}`,
      path: ['color', 'ranges', name],
      fix: 'Order the range as [minimum, maximum].',
    })
  }
}

function validateMemberName(name: string, path: string): void {
  if (!/^[A-Z_]\w*$/i.test(name) || name.startsWith('$')) {
    throw new VanityError({
      code: 'VANITY_HAIL_INVALID_CONFIG',
      message: `${path} must be a non-$ TypeScript identifier; received '${name}'`,
      path: path.split('.'),
      fix: 'Use a non-$ TypeScript identifier for the marker name.',
    })
  }
}

function validateFinite(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new VanityError({
      code: 'VANITY_HAIL_INVALID_CONFIG',
      message: `${path} must be finite; received ${value}`,
      path: path.split('.'),
      fix: 'Use a finite numeric value.',
    })
  }
}

function validateFinitePositive(value: number, path: string): void {
  validateFinite(value, path)
  if (value <= 0) {
    throw new VanityError({
      code: 'VANITY_HAIL_INVALID_CONFIG',
      message: `${path} must be greater than zero; received ${value}`,
      path: path.split('.'),
      fix: 'Use a finite value greater than zero.',
    })
  }
}
