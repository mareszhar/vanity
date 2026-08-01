import type {
  HailControlName,
  HailControlResolution,
  HailOptions,
  HailPresetName,
  HailRange,
  HailRangeName,
} from './types'

export const HAIL_PRESET_NAMES = [
  'reset',
  'palette',
  'roles',
  'sizes',
  'breakpoints',
  'motion',
  'theming',
  'icons',
] as const satisfies readonly HailPresetName[]

export const HAIL_RANGE_NAMES = [
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
  finitePositive(base, 'size.base')
  finitePositive(remTarget, 'size.remTarget')
  finite(contrastPivotL, 'color.contrastPivotL')

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
  if (spanName === exactName)
    throw new TypeError(`[hail] span and exact markers cannot share the name '${spanName}'`)
  for (const reserved of ['size', 'bem', 'contrastOf', 'mx']) {
    if (spanName === reserved || exactName === reserved)
      throw new TypeError(`[hail] marker name '${reserved}' collides with Hail's '${reserved}' utility`)
  }

  const presets = selectedPresets(options)
  if (presets.has('roles') && !presets.has('palette'))
    throw new TypeError('[hail] the \'roles\' preset requires \'palette\'; include palette or exclude roles')
  if (presets.has('theming') && !presets.has('roles'))
    throw new TypeError('[hail] the \'theming\' preset requires \'roles\'; include roles or exclude theming')

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

function selectedPresets(options: HailOptions): ReadonlySet<HailPresetName> {
  if (options.presets === undefined)
    return new Set()

  const listed = new Set(options.presets.listed)
  return options.presets.mode === 'opt-in'
    ? listed
    : new Set(HAIL_PRESET_NAMES.filter(name => !listed.has(name)))
}

function validateRange(name: HailRangeName, range: HailRange): void {
  const [minimum, maximum] = range
  finite(minimum, `color.ranges.${name}[0]`)
  finite(maximum, `color.ranges.${name}[1]`)
  if (name === 'h') {
    if (minimum < 0 || minimum > 360 || maximum < 0 || maximum > 360 || minimum === maximum) {
      throw new RangeError(
        `[hail] color.ranges.h endpoints must be distinct values within 0..360; received ${minimum}..${maximum}`,
      )
    }
    return
  }
  if (minimum > maximum) {
    throw new RangeError(
      `[hail] color.ranges.${name} must be ordered [minimum, maximum]; received ${minimum}..${maximum}`,
    )
  }
}

function validateMemberName(name: string, path: string): void {
  if (!/^[A-Z_]\w*$/i.test(name) || name.startsWith('$'))
    throw new TypeError(`[hail] ${path} must be a non-$ TypeScript identifier; received '${name}'`)
}

function finite(value: number, path: string): void {
  if (!Number.isFinite(value))
    throw new RangeError(`[hail] ${path} must be finite; received ${value}`)
}

function finitePositive(value: number, path: string): void {
  finite(value, path)
  if (value <= 0)
    throw new RangeError(`[hail] ${path} must be greater than zero; received ${value}`)
}
