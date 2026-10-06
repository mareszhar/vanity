/** CSS units are constructors of data types, not data types themselves. */

import type { VanityCssDataType, VanityCssValue } from './types'
import { throwValueError } from './error'
import { defineCssValue } from './extensions'
import { createLiteralNode, createPluginNode, ExpressionValue } from './protocol'

/** CSS length unit names available through explicit length constructors. */
export type VanityLengthUnit = keyof VanityLengthUnits<'length'>
/** CSS angle unit names: deg, grad, rad and turn. */
export type VanityAngleUnit = keyof VanityAngleUnits<'angle'>
/** CSS duration unit names: ms and s. */
export type VanityTimeUnit = keyof VanityTimeUnits<'time'>
/** CSS frequency unit names: Hz and kHz. */
export type VanityFrequencyUnit = keyof VanityFrequencyUnits<'frequency'>
/** CSS resolution unit names: dpcm, dpi, dppx and its x alias. */
export type VanityResolutionUnit = keyof VanityResolutionUnits<'resolution'>
/** CSS grid flex unit name: fr. */
export type VanityFlexUnit = keyof VanityFlexUnits<'flex'>

/** Construct one explicit CSS unit while retaining its numeric literal. */
interface VanityUnitConstructor<Type extends VanityCssDataType, Unit extends string> {
  /**
   * Create an explicit CSS unit value, preserving its numeric literal.
   * @param value - A finite number in this unit; negative and fractional values are allowed.
   */
  <const Value extends number>(value: Value): VanityUnitValue<Type, Unit, Value>
}

interface VanityLengthUnits<Type extends VanityCssDataType> {
  /** Create a CSS cap value measured in the element’s cap height. */
  readonly cap: VanityUnitConstructor<Type, 'cap'>
  /** Create a CSS ch value measured in the advance of the element’s zero glyph. */
  readonly ch: VanityUnitConstructor<Type, 'ch'>
  /** Create a CSS cm value measured in centimeters. */
  readonly cm: VanityUnitConstructor<Type, 'cm'>
  /** Create a CSS cqb value measured in 1% of the query container’s block size. */
  readonly cqb: VanityUnitConstructor<Type, 'cqb'>
  /** Create a CSS cqh value measured in 1% of the query container’s height. */
  readonly cqh: VanityUnitConstructor<Type, 'cqh'>
  /** Create a CSS cqi value measured in 1% of the query container’s inline size. */
  readonly cqi: VanityUnitConstructor<Type, 'cqi'>
  /** Create a CSS cqmax value measured in the larger of cqi and cqb. */
  readonly cqmax: VanityUnitConstructor<Type, 'cqmax'>
  /** Create a CSS cqmin value measured in the smaller of cqi and cqb. */
  readonly cqmin: VanityUnitConstructor<Type, 'cqmin'>
  /** Create a CSS cqw value measured in 1% of the query container’s width. */
  readonly cqw: VanityUnitConstructor<Type, 'cqw'>
  /** Create a CSS dvb value measured in 1% of the dynamic viewport’s block size. */
  readonly dvb: VanityUnitConstructor<Type, 'dvb'>
  /** Create a CSS dvh value measured in 1% of the dynamic viewport’s height. */
  readonly dvh: VanityUnitConstructor<Type, 'dvh'>
  /** Create a CSS dvi value measured in 1% of the dynamic viewport’s inline size. */
  readonly dvi: VanityUnitConstructor<Type, 'dvi'>
  /** Create a CSS dvmax value measured in 1% of the dynamic viewport’s larger of width and height. */
  readonly dvmax: VanityUnitConstructor<Type, 'dvmax'>
  /** Create a CSS dvmin value measured in 1% of the dynamic viewport’s smaller of width and height. */
  readonly dvmin: VanityUnitConstructor<Type, 'dvmin'>
  /** Create a CSS dvw value measured in 1% of the dynamic viewport’s width. */
  readonly dvw: VanityUnitConstructor<Type, 'dvw'>
  /** Create a CSS em value measured in the element’s font size; font-size uses the parent’s size. */
  readonly em: VanityUnitConstructor<Type, 'em'>
  /** Create a CSS ex value measured in the element’s x-height. */
  readonly ex: VanityUnitConstructor<Type, 'ex'>
  /** Create a CSS ic value measured in the advance of the element’s ideographic water glyph. */
  readonly ic: VanityUnitConstructor<Type, 'ic'>
  /** Create a CSS in value measured in inches. */
  readonly in: VanityUnitConstructor<Type, 'in'>
  /** Create a CSS lh value measured in the element’s line height. */
  readonly lh: VanityUnitConstructor<Type, 'lh'>
  /** Create a CSS lvb value measured in 1% of the large viewport’s block size. */
  readonly lvb: VanityUnitConstructor<Type, 'lvb'>
  /** Create a CSS lvh value measured in 1% of the large viewport’s height. */
  readonly lvh: VanityUnitConstructor<Type, 'lvh'>
  /** Create a CSS lvi value measured in 1% of the large viewport’s inline size. */
  readonly lvi: VanityUnitConstructor<Type, 'lvi'>
  /** Create a CSS lvmax value measured in 1% of the large viewport’s larger of width and height. */
  readonly lvmax: VanityUnitConstructor<Type, 'lvmax'>
  /** Create a CSS lvmin value measured in 1% of the large viewport’s smaller of width and height. */
  readonly lvmin: VanityUnitConstructor<Type, 'lvmin'>
  /** Create a CSS lvw value measured in 1% of the large viewport’s width. */
  readonly lvw: VanityUnitConstructor<Type, 'lvw'>
  /** Create a CSS mm value measured in millimeters. */
  readonly mm: VanityUnitConstructor<Type, 'mm'>
  /** Create a CSS pc value measured in picas (12 CSS points). */
  readonly pc: VanityUnitConstructor<Type, 'pc'>
  /** Create a CSS pt value measured in points (1/72 CSS inch). */
  readonly pt: VanityUnitConstructor<Type, 'pt'>
  /** Create a CSS px value measured in CSS reference pixels. */
  readonly px: VanityUnitConstructor<Type, 'px'>
  /** Create a CSS q value measured in quarter-millimeters. */
  readonly q: VanityUnitConstructor<Type, 'q'>
  /** Create a CSS rcap value measured in the root element’s cap height. */
  readonly rcap: VanityUnitConstructor<Type, 'rcap'>
  /** Create a CSS rch value measured in the advance of the root element’s zero glyph. */
  readonly rch: VanityUnitConstructor<Type, 'rch'>
  /** Create a CSS rem value measured in the root element’s font size. */
  readonly rem: VanityUnitConstructor<Type, 'rem'>
  /** Create a CSS rex value measured in the root element’s x-height. */
  readonly rex: VanityUnitConstructor<Type, 'rex'>
  /** Create a CSS ric value measured in the advance of the root element’s ideographic water glyph. */
  readonly ric: VanityUnitConstructor<Type, 'ric'>
  /** Create a CSS rlh value measured in the root element’s line height. */
  readonly rlh: VanityUnitConstructor<Type, 'rlh'>
  /** Create a CSS svb value measured in 1% of the small viewport’s block size. */
  readonly svb: VanityUnitConstructor<Type, 'svb'>
  /** Create a CSS svh value measured in 1% of the small viewport’s height. */
  readonly svh: VanityUnitConstructor<Type, 'svh'>
  /** Create a CSS svi value measured in 1% of the small viewport’s inline size. */
  readonly svi: VanityUnitConstructor<Type, 'svi'>
  /** Create a CSS svmax value measured in 1% of the small viewport’s larger of width and height. */
  readonly svmax: VanityUnitConstructor<Type, 'svmax'>
  /** Create a CSS svmin value measured in 1% of the small viewport’s smaller of width and height. */
  readonly svmin: VanityUnitConstructor<Type, 'svmin'>
  /** Create a CSS svw value measured in 1% of the small viewport’s width. */
  readonly svw: VanityUnitConstructor<Type, 'svw'>
  /** Create a CSS vb value measured in 1% of the large viewport’s block size. */
  readonly vb: VanityUnitConstructor<Type, 'vb'>
  /** Create a CSS vh value measured in 1% of the large viewport’s height. */
  readonly vh: VanityUnitConstructor<Type, 'vh'>
  /** Create a CSS vi value measured in 1% of the large viewport’s inline size. */
  readonly vi: VanityUnitConstructor<Type, 'vi'>
  /** Create a CSS vmax value measured in 1% of the large viewport’s larger of width and height. */
  readonly vmax: VanityUnitConstructor<Type, 'vmax'>
  /** Create a CSS vmin value measured in 1% of the large viewport’s smaller of width and height. */
  readonly vmin: VanityUnitConstructor<Type, 'vmin'>
  /** Create a CSS vw value measured in 1% of the large viewport’s width. */
  readonly vw: VanityUnitConstructor<Type, 'vw'>
}

interface VanityAngleUnits<Type extends VanityCssDataType> {
  /** Create a CSS deg value measured in degrees. */
  readonly deg: VanityUnitConstructor<Type, 'deg'>
  /** Create a CSS grad value measured in gradians. */
  readonly grad: VanityUnitConstructor<Type, 'grad'>
  /** Create a CSS rad value measured in radians. */
  readonly rad: VanityUnitConstructor<Type, 'rad'>
  /** Create a CSS turn value measured in turns. */
  readonly turn: VanityUnitConstructor<Type, 'turn'>
}

interface VanityTimeUnits<Type extends VanityCssDataType> {
  /** Create a CSS ms value measured in milliseconds. */
  readonly ms: VanityUnitConstructor<Type, 'ms'>
  /** Create a CSS s value measured in seconds. */
  readonly s: VanityUnitConstructor<Type, 's'>
}

interface VanityFrequencyUnits<Type extends VanityCssDataType> {
  /** Create a CSS Hz value measured in hertz. */
  readonly Hz: VanityUnitConstructor<Type, 'Hz'>
  /** Create a CSS kHz value measured in kilohertz. */
  readonly kHz: VanityUnitConstructor<Type, 'kHz'>
}

interface VanityResolutionUnits<Type extends VanityCssDataType> {
  /** Create a CSS dpcm value measured in dots per CSS centimeter. */
  readonly dpcm: VanityUnitConstructor<Type, 'dpcm'>
  /** Create a CSS dpi value measured in dots per CSS inch. */
  readonly dpi: VanityUnitConstructor<Type, 'dpi'>
  /** Create a CSS dppx value measured in dots per CSS pixel. */
  readonly dppx: VanityUnitConstructor<Type, 'dppx'>
  /** Create a CSS x value measured in dots per CSS pixel (alias of dppx). */
  readonly x: VanityUnitConstructor<Type, 'x'>
}

interface VanityFlexUnits<Type extends VanityCssDataType> {
  /** Create a CSS fr value measured in fractions of available grid space. */
  readonly fr: VanityUnitConstructor<Type, 'fr'>
}

interface VanityUnitConstructors<Type extends VanityCssDataType> extends VanityLengthUnits<Type>, VanityAngleUnits<Type>, VanityTimeUnits<Type>, VanityFrequencyUnits<Type>, VanityResolutionUnits<Type>, VanityFlexUnits<Type> {}

export type VanityUnitValue<
  Type extends VanityCssDataType,
  Unit extends string,
  Value extends number = number,
> = VanityCssValue<`${Value}${Unit}`, Type>

/** Pick preserves each public unit's documentation through bound constructors. */
type UnitMethods<Type extends VanityCssDataType, Unit extends string>
  = Pick<VanityUnitConstructors<Type>, Unit & keyof VanityUnitConstructors<Type>>

export type VanityLengthConstructor<DefaultUnit extends VanityLengthUnit = 'px'> = {
  <const Value extends number>(value: Value): VanityUnitValue<'length', DefaultUnit, Value>
} & UnitMethods<'length', VanityLengthUnit>

export type VanityAngleConstructor = UnitMethods<'angle', VanityAngleUnit>
export type VanityTimeConstructor = UnitMethods<'time', VanityTimeUnit>
export type VanityFrequencyConstructor = UnitMethods<'frequency', VanityFrequencyUnit>
export type VanityResolutionConstructor = UnitMethods<'resolution', VanityResolutionUnit>
export type VanityFlexConstructor = UnitMethods<'flex', VanityFlexUnit>

const lengthUnits: readonly VanityLengthUnit[] = [
  'cap',
  'ch',
  'cm',
  'cqb',
  'cqh',
  'cqi',
  'cqmax',
  'cqmin',
  'cqw',
  'dvb',
  'dvh',
  'dvi',
  'dvmax',
  'dvmin',
  'dvw',
  'em',
  'ex',
  'ic',
  'in',
  'lh',
  'lvb',
  'lvh',
  'lvi',
  'lvmax',
  'lvmin',
  'lvw',
  'mm',
  'pc',
  'pt',
  'px',
  'q',
  'rcap',
  'rch',
  'rem',
  'rex',
  'ric',
  'rlh',
  'svb',
  'svh',
  'svi',
  'svmax',
  'svmin',
  'svw',
  'vb',
  'vh',
  'vi',
  'vmax',
  'vmin',
  'vw',
]

function createUnitFactory<Type extends VanityCssDataType, Unit extends string>(type: Type, unit: Unit) {
  // This simple built-in intentionally dogfoods the public lowering contract:
  // `defineCssValue` sees only another public value, so no opaque identity is
  // required and extension authors have the same route.
  return defineCssValue({
    type,
    create(value: number) {
      validateFinite(value, `${type}.${unit}`)
      return new ExpressionValue(createLiteralNode(type, `${format(value)}${unit}`, { helper: `${type}.${unit}` }))
    },
  }) as <const Value extends number>(value: Value) => VanityUnitValue<Type, Unit, Value>
}

function createUnitGroup<Type extends VanityCssDataType, Unit extends string>(
  type: Type,
  units: readonly Unit[],
): UnitMethods<Type, Unit> {
  return Object.freeze(Object.fromEntries(units.map(unit => [unit, createUnitFactory(type, unit)]))) as UnitMethods<Type, Unit>
}

const explicitLength = createUnitGroup('length', lengthUnits)
export function createLengthConstructor<const DefaultUnit extends VanityLengthUnit>(
  defaultUnit: DefaultUnit,
): VanityLengthConstructor<DefaultUnit> {
  return Object.freeze(Object.assign(
    <const Value extends number>(value: Value) => createAdaptiveLength(value, defaultUnit),
    explicitLength,
  )) as VanityLengthConstructor<DefaultUnit>
}

function createAdaptiveLength<const Unit extends VanityLengthUnit, const Value extends number>(
  value: Value,
  fallbackUnit: Unit,
): VanityUnitValue<'length', Unit, Value> {
  validateFinite(value, 'length')
  return new ExpressionValue(createPluginNode({
    type: 'length',
    extension: { id: 'org.vanity.core.adaptive-length', version: 1 },
    dependencies: [],
    source: { helper: 'length' },
    serialize(context) {
      const configured = context.policies.constructors.length?.unitless
      const unit = configured ?? fallbackUnit
      return `${format(value)}${unit}`
    },
  })) as VanityUnitValue<'length', Unit, Value>
}

/** Create a length using system policy, or select an explicit unit such as length.rem(). */
export const length: VanityLengthConstructor<VanityLengthUnit> = createLengthConstructor('px')
export const angle: VanityAngleConstructor = createUnitGroup('angle', ['deg', 'grad', 'rad', 'turn'])
export const time: VanityTimeConstructor = createUnitGroup('time', ['ms', 's'])
export const frequency: VanityFrequencyConstructor = createUnitGroup('frequency', ['Hz', 'kHz'])
export const resolution: VanityResolutionConstructor = createUnitGroup('resolution', ['dpcm', 'dpi', 'dppx', 'x'])
export const flex: VanityFlexConstructor = createUnitGroup('flex', ['fr'])

export function percent<const Value extends number>(value: Value): VanityUnitValue<'percentage', '%', Value> {
  validateFinite(value, 'percent')
  return new ExpressionValue(createLiteralNode('percentage', `${format(value)}%`, { helper: 'percent' })) as VanityUnitValue<'percentage', '%', Value>
}

export function cssNumber<const Value extends number>(value: Value): VanityCssValue<`${Value}`, 'number'> {
  validateFinite(value, 'number')
  return new ExpressionValue(createLiteralNode('number', value, { helper: 'number' })) as VanityCssValue<`${Value}`, 'number'>
}

export function integer<const Value extends number>(value: Value): VanityCssValue<`${Value}`, 'integer'> {
  validateFinite(value, 'integer')
  if (!Number.isInteger(value)) {
    throwValueError(
      'VANITY_CSS_INVALID_VALUE',
      `integer() needs an integer; received ${value}`,
      'integer',
      'pass a whole number to integer()',
    )
  }
  return new ExpressionValue(createLiteralNode('integer', value, { helper: 'integer' })) as VanityCssValue<`${Value}`, 'integer'>
}

function validateFinite(value: number, helper: string): void {
  if (!Number.isFinite(value)) {
    throwValueError(
      'VANITY_CSS_INVALID_VALUE',
      `${helper}() needs a finite number; received ${value}`,
      helper,
      'pass a finite number',
    )
  }
}

function format(value: number): string {
  return String(Object.is(value, -0) ? 0 : value)
}
