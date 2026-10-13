import type { VanityCssDataType } from '../values/types'

interface ComparableValue {
  numerator: bigint
  denominator: bigint
  family: string
}

// CSS Values defines exact absolute-unit ratios. Every other length unit
// compares only with itself; radians likewise have their own unit family.
const unitFactors = {
  length: { px: [1, 1], cm: [4800, 127], mm: [480, 127], q: [120, 127], in: [96, 1], pt: [4, 3], pc: [16, 1] },
  angle: { deg: [1, 1], grad: [9, 10], turn: [360, 1] },
  time: { ms: [1, 1], s: [1000, 1] },
} as const

/** The same exact comparison validates definitions, runtime output, and samples. */
export function getTokenRangeError(type: VanityCssDataType, range: readonly [string, string], value?: string): string | undefined {
  if (!['number', 'integer', 'percentage', 'angle', 'time', 'length'].includes(type))
    return 'range supports number, integer, percentage, angle, time and length tokens'
  const min = parseComparableValue(type, range[0])
  const max = parseComparableValue(type, range[1])
  if (!min || !max || min.family !== max.family)
    return `range [${range.join(', ')}] needs bounds in one comparable unit family`
  if (compareValues(min, max) > 0)
    return `range [${range.join(', ')}] needs its minimum before its maximum`
  if (value === undefined)
    return
  const units = min.family === 'absolute-length'
    ? 'px, cm, mm, Q, in, pt, pc'
    : type === 'angle'
      ? min.family === 'rad' ? 'rad' : 'deg, grad, turn'
      : type === 'time'
        ? 'ms, s'
        : type === 'percentage'
          ? 'plain numbers or %'
          : type === 'length' ? min.family : 'plain numbers'
  const parsed = parseComparableValue(type, value)
  if (!parsed || parsed.family !== min.family)
    return `value '${value}' cannot be compared with range [${range.join(', ')}]; accepted units: ${units}; calc() and var() cannot be compared without layout`
  if (compareValues(parsed, min) < 0 || compareValues(parsed, max) > 0)
    return `value '${value}' is outside inclusive range [${range.join(', ')}]; accepted units: ${units}`
}

function parseComparableValue(type: VanityCssDataType, source: string): ComparableValue | undefined {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/i.exec(source.trim())
  if (!match || !Number.isFinite(Number(match[1])))
    return
  const unit = match[2]!.toLowerCase()
  const [mantissa, exponent = '0'] = match[1]!.toLowerCase().split('e')
  const digits = mantissa!.replace('.', '')
  const places = (mantissa!.split('.')[1]?.length ?? 0) - Number(exponent)
  let numerator = BigInt(digits.startsWith('+') ? digits.slice(1) : digits)
  let denominator = 1n
  if (places > 0)
    denominator = 10n ** BigInt(places)
  else
    numerator *= 10n ** BigInt(-places)
  let family: string = type
  let factor: readonly [number, number] = [1, 1]
  if (type === 'number' || type === 'integer') {
    if (unit || (type === 'integer' && numerator % denominator !== 0n))
      return
  }
  else if (type === 'percentage') {
    if (unit && unit !== '%')
      return
  }
  else if (type === 'length' || type === 'angle' || type === 'time') {
    const factors: Readonly<Record<string, readonly [number, number]>> = unitFactors[type]
    const conversion = Object.hasOwn(factors, unit) ? factors[unit] : undefined
    if (conversion) {
      factor = conversion
      if (type === 'length')
        family = 'absolute-length'
    }
    else if ((type === 'length' && unit && unit !== '%') || (type === 'angle' && unit === 'rad')) {
      family = unit
    }
    else {
      return
    }
  }
  else {
    return
  }
  return { numerator: numerator * BigInt(factor[0]), denominator: denominator * BigInt(factor[1]), family }
}

function compareValues(left: ComparableValue, right: ComparableValue): number {
  const a = left.numerator * right.denominator
  const b = right.numerator * left.denominator
  return a < b ? -1 : a > b ? 1 : 0
}

/** Generated import target for systems that declare a range. */
export function restoreRuntimeRange(): typeof getTokenRangeError {
  return getTokenRangeError
}
