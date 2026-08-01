/** CSS math on the shared value IR: immutable, typed, and precedence-safe. */

import type { VanityExpressionNode, VanityOperationNode } from './protocol'
import type { VanityCssDataType, VanityCssInput, VanityCssValue, VanityValue } from './types'
import {
  compositeNode,
  ExpressionValue,
  functionNode,
  inputNode,
  operationNode,
} from './protocol'

export type VanityMathDimension
  = | 'number'
    | 'none'
    | 'length'
    | 'percentage'
    | 'length-percentage'
    | 'angle'
    | 'time'
    | 'frequency'
    | 'resolution'
    | 'flex'
    | 'unknown'

type LengthUnit
  = | 'cap' | 'ch' | 'cm' | 'cqb' | 'cqh' | 'cqi' | 'cqmax' | 'cqmin' | 'cqw'
    | 'dvb' | 'dvh' | 'dvi' | 'dvmax' | 'dvmin' | 'dvw' | 'em' | 'ex' | 'ic'
    | 'in' | 'lh' | 'lvb' | 'lvh' | 'lvi' | 'lvmax' | 'lvmin' | 'lvw' | 'mm'
    | 'pc' | 'pt' | 'px' | 'q' | 'rcap' | 'rch' | 'rem' | 'rex' | 'ric' | 'rlh'
    | 'svb' | 'svh' | 'svi' | 'svmax' | 'svmin' | 'svw' | 'vb' | 'vh' | 'vi'
    | 'vmax' | 'vmin' | 'vw'
type AngleUnit = 'deg' | 'grad' | 'rad' | 'turn'
type TimeUnit = 'ms' | 's'
type FrequencyUnit = 'Hz' | 'kHz'
type ResolutionUnit = 'dpcm' | 'dpi' | 'dppx' | 'x'

type DimensionOfDataType<Type extends VanityCssDataType>
  = Type extends 'number' | 'integer' ? 'number'
    : Type extends VanityMathDimension ? Type
      : Type extends 'number-percentage' ? 'unknown'
        : 'unknown'

export type VanityDimensionOf<Value>
  = Value extends VanityMathValue<infer Dimension> ? Dimension
    : Value extends VanityValue<infer Type> ? DimensionOfDataType<Type>
      : Value extends { readonly $type: infer Type extends VanityCssDataType } ? DimensionOfDataType<Type>
        : Value extends { readonly value: infer Inner } ? VanityDimensionOf<Inner>
          : Value extends { readonly defaultValue: infer Inner } ? VanityDimensionOf<Inner>
            : Value extends 'none' ? 'none'
              : Value extends number ? 'number'
                : Value extends `${number}%` ? 'percentage'
                  : Value extends `${number}${LengthUnit}` ? 'length'
                    : Value extends `${number}${AngleUnit}` ? 'angle'
                      : Value extends `${number}${TimeUnit}` ? 'time'
                        : Value extends `${number}${FrequencyUnit}` ? 'frequency'
                          : Value extends `${number}${ResolutionUnit}` ? 'resolution'
                            : Value extends `${number}fr` ? 'flex'
                              : 'unknown'

export type VanitySumDimension<
  A extends VanityMathDimension,
  B extends VanityMathDimension,
> = A extends 'none' ? B
  : B extends 'none' ? A
    : 'unknown' extends A | B ? 'unknown'
      : A extends B ? A
        : A extends 'length' | 'percentage' | 'length-percentage'
          ? B extends 'length' | 'percentage' | 'length-percentage' ? 'length-percentage' : never
          : never

export type VanityProductDimension<
  A extends VanityMathDimension,
  B extends VanityMathDimension,
> = 'unknown' extends A | B ? 'unknown'
  : A extends 'number' ? B
    : B extends 'number' ? A
      : 'unknown'

export type VanityQuotientDimension<
  A extends VanityMathDimension,
  B extends VanityMathDimension,
> = 'unknown' extends A | B ? 'unknown'
  : B extends 'number' ? A
    : A extends B ? 'number'
      : 'unknown'

type SumInput<Dimension extends VanityMathDimension, Input extends VanityCssInput>
  = Input & (VanitySumDimension<Dimension, VanityDimensionOf<Input>> extends never ? never : unknown)

type JoinDimensions<
  Inputs extends readonly VanityCssInput[],
  Accumulator extends VanityMathDimension | undefined = undefined,
> = Inputs extends readonly [infer Head extends VanityCssInput, ...infer Tail extends readonly VanityCssInput[]]
  ? Accumulator extends VanityMathDimension
    ? VanitySumDimension<Accumulator, VanityDimensionOf<Head>> extends infer Joined
      ? Joined extends VanityMathDimension ? JoinDimensions<Tail, Joined> : never
      : never
    : JoinDimensions<Tail, VanityDimensionOf<Head>>
  : Accumulator extends VanityMathDimension ? Accumulator : 'unknown'

type CompatibleMathInputs<Inputs extends readonly VanityCssInput[]> = JoinDimensions<Inputs> extends never ? never : Inputs

type DataTypeOfDimension<Dimension extends VanityMathDimension>
  = Dimension extends 'unknown' | 'none' ? 'unknown' : Dimension

export interface VanityMathValue<Dimension extends VanityMathDimension = VanityMathDimension>
  extends VanityCssValue<string, DataTypeOfDimension<Dimension>> {
  readonly dimension: Dimension
}

export interface VanityCalc<Dimension extends VanityMathDimension = VanityMathDimension> extends VanityMathValue<Dimension> {
  add: <const Input extends VanityCssInput>(value: SumInput<Dimension, Input>) => VanityCalc<VanitySumDimension<Dimension, VanityDimensionOf<Input>>>
  subtract: <const Input extends VanityCssInput>(value: SumInput<Dimension, Input>) => VanityCalc<VanitySumDimension<Dimension, VanityDimensionOf<Input>>>
  multiply: <const Input extends VanityCssInput>(value: Input) => VanityCalc<VanityProductDimension<Dimension, VanityDimensionOf<Input>>>
  divide: <const Input extends VanityCssInput>(value: Input) => VanityCalc<VanityQuotientDimension<Dimension, VanityDimensionOf<Input>>>
  negate: () => VanityCalc<Dimension>
}

class CalcValue<Dimension extends VanityMathDimension> extends ExpressionValue<DataTypeOfDimension<Dimension>> implements VanityCalc<Dimension> {
  constructor(
    readonly expression: VanityExpressionNode,
    readonly dimension: Dimension,
  ) {
    super(compositeNode({
      type: dataType(dimension),
      parts: ['calc(', expression, ')'],
      requirements: ['calc-basic'],
      source: { helper: 'calc' },
    }) as VanityExpressionNode<DataTypeOfDimension<Dimension>>)
  }

  add<const Input extends VanityCssInput>(value: SumInput<Dimension, Input>): VanityCalc<VanitySumDimension<Dimension, VanityDimensionOf<Input>>> {
    const other = dimensionOf(value)
    return binary(this.expression, '+', mathNode(value), sumRuntime(this.dimension, other)) as never
  }

  subtract<const Input extends VanityCssInput>(value: SumInput<Dimension, Input>): VanityCalc<VanitySumDimension<Dimension, VanityDimensionOf<Input>>> {
    const other = dimensionOf(value)
    return binary(this.expression, '-', mathNode(value), sumRuntime(this.dimension, other)) as never
  }

  multiply<const Input extends VanityCssInput>(value: Input): VanityCalc<VanityProductDimension<Dimension, VanityDimensionOf<Input>>> {
    finiteOperand('multiply', value)
    const other = dimensionOf(value)
    return binary(this.expression, '*', mathNode(value), productRuntime(this.dimension, other), typedArithmetic(this.dimension, other)) as never
  }

  divide<const Input extends VanityCssInput>(value: Input): VanityCalc<VanityQuotientDimension<Dimension, VanityDimensionOf<Input>>> {
    finiteOperand('divide', value)
    if (typeof value === 'number' && value === 0)
      throw new RangeError('[vanity] calc().divide() cannot divide by zero')
    const other = dimensionOf(value)
    return binary(this.expression, '/', mathNode(value), quotientRuntime(this.dimension, other), typedArithmetic(this.dimension, other)) as never
  }

  negate(): VanityCalc<Dimension> {
    return binary(inputNode(-1, 'number'), '*', this.expression, this.dimension) as VanityCalc<Dimension>
  }
}

class FunctionValue<Dimension extends VanityMathDimension> extends ExpressionValue<DataTypeOfDimension<Dimension>> implements VanityMathValue<Dimension> {
  constructor(
    name: 'min' | 'max' | 'clamp',
    values: readonly VanityCssInput[],
    readonly dimension: Dimension,
  ) {
    super(functionNode({
      type: dataType(dimension),
      name,
      values: values.map(value => inputNode(value)),
      separator: ', ',
      requirements: ['calc-basic'],
      source: { helper: name, parents: values.map(sourceOf) },
    }) as VanityExpressionNode<DataTypeOfDimension<Dimension>>)
  }
}

/** Start an immutable CSS calculation. Nested calculations preserve precedence. */
export function calc<const Input extends VanityCssInput>(value: Input): VanityCalc<VanityDimensionOf<Input>> {
  return new CalcValue(mathNode(value), dimensionOf(value) as VanityDimensionOf<Input>)
}

/** The smallest of one or more compatible CSS numeric values. */
export function min<const Inputs extends readonly [VanityCssInput, ...VanityCssInput[]]>(
  ...values: Inputs & CompatibleMathInputs<Inputs>
): VanityMathValue<JoinDimensions<Inputs>> {
  return mathFunction('min', values) as VanityMathValue<JoinDimensions<Inputs>>
}

/** The largest of one or more compatible CSS numeric values. */
export function max<const Inputs extends readonly [VanityCssInput, ...VanityCssInput[]]>(
  ...values: Inputs & CompatibleMathInputs<Inputs>
): VanityMathValue<JoinDimensions<Inputs>> {
  return mathFunction('max', values) as VanityMathValue<JoinDimensions<Inputs>>
}

/** Clamp a preferred CSS numeric value between compatible minimum and maximum values. */
export function clamp<
  const Minimum extends VanityCssInput,
  const Preferred extends VanityCssInput,
  const Maximum extends VanityCssInput,
>(
  minimum: Minimum,
  preferred: Preferred & (JoinDimensions<[Minimum, Preferred, Maximum]> extends never ? never : unknown),
  maximum: Maximum,
): VanityMathValue<JoinDimensions<[Minimum, Preferred, Maximum]>> {
  const values = [minimum, preferred, maximum] as const
  return mathFunction('clamp', values) as VanityMathValue<JoinDimensions<[Minimum, Preferred, Maximum]>>
}

function mathFunction(name: 'min' | 'max' | 'clamp', values: readonly VanityCssInput[]): VanityMathValue {
  const dimension = commonRuntime(values)
  return new FunctionValue(name, values, dimension)
}

function binary(
  left: VanityExpressionNode,
  operator: VanityOperationNode['operator'],
  right: VanityExpressionNode,
  dimension: VanityMathDimension,
  needsTypedArithmetic = false,
): CalcValue<any> {
  const precedence = operationPrecedence(operator)
  const leftNode = parenthesizeFor(left, precedence, false, operator)
  const rightNode = parenthesizeFor(right, precedence, true, operator)
  return new CalcValue(operationNode({
    type: dataType(dimension),
    operator,
    left: leftNode,
    right: rightNode,
    requirements: needsTypedArithmetic ? ['calc-basic', 'calc-typed-arithmetic'] : ['calc-basic'],
    source: { helper: `calc.${operationName(operator)}`, parents: [left.source ?? {}, right.source ?? {}] },
  }), dimension) as CalcValue<any>
}

function mathNode(value: VanityCssInput): VanityExpressionNode {
  return value instanceof CalcValue ? value.expression : inputNode(value)
}

function parenthesizeFor(
  node: VanityExpressionNode,
  parentPrecedence: number,
  right: boolean,
  operator: VanityOperationNode['operator'],
): VanityExpressionNode {
  if (node.kind !== 'operation')
    return node
  const childPrecedence = operationPrecedence(node.operator)
  const required = childPrecedence < parentPrecedence
    || (right && childPrecedence === parentPrecedence && (operator === '-' || operator === '/'))
  return required ? { ...node, parenthesize: true } : node
}

function operationPrecedence(operator: VanityOperationNode['operator']): number {
  return operator === '+' || operator === '-' ? 1 : 2
}

function operationName(operator: VanityOperationNode['operator']): string {
  return operator === '+' ? 'add' : operator === '-' ? 'subtract' : operator === '*' ? 'multiply' : 'divide'
}

function dimensionOf(value: VanityCssInput): VanityMathDimension {
  if ((typeof value === 'object' || typeof value === 'function') && value !== null) {
    if ('dimension' in value)
      return (value as VanityMathValue).dimension
    if ('type' in value)
      return dimensionFromType((value as VanityValue).type)
    if ('$type' in value && typeof value.$type === 'string')
      return dimensionFromType(value.$type as VanityCssDataType)
  }

  if (typeof value === 'number')
    return 'number'

  const text = typeof value === 'string' ? value : 'var' in value ? value.var : String(value)
  if (text === 'none')
    return 'none'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(text))
    return 'percentage'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:px|rem|em|vh|vw|vmin|vmax|ch|ex|lh|rlh|cm|mm|in|pt|pc|q|cap|ic|vb|vi|svh|svw|lvh|lvw|dvh|dvw|cqw|cqh|cqi|cqb|cqmin|cqmax)$/.test(text))
    return 'length'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:deg|grad|rad|turn)$/.test(text))
    return 'angle'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:ms|s)$/.test(text))
    return 'time'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:Hz|kHz)$/.test(text))
    return 'frequency'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:dpcm|dpi|dppx|x)$/.test(text))
    return 'resolution'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)fr$/.test(text))
    return 'flex'
  return 'unknown'
}

function dimensionFromType(type: VanityCssDataType): VanityMathDimension {
  if (type === 'integer')
    return 'number'
  return ['number', 'length', 'percentage', 'length-percentage', 'angle', 'time', 'frequency', 'resolution', 'flex'].includes(type)
    ? type as VanityMathDimension
    : 'unknown'
}

function commonRuntime(values: readonly VanityCssInput[]): VanityMathDimension {
  let dimension = dimensionOf(values[0]!)
  for (const value of values.slice(1))
    dimension = sumRuntime(dimension, dimensionOf(value))
  return dimension
}

function sumRuntime(a: VanityMathDimension, b: VanityMathDimension): VanityMathDimension {
  if (a === 'none')
    return b
  if (b === 'none')
    return a
  if (a === 'unknown' || b === 'unknown')
    return 'unknown'
  if (a === b)
    return a
  if (isLengthPercentage(a) && isLengthPercentage(b))
    return 'length-percentage'
  throw new TypeError(`[vanity] CSS math cannot combine ${a} and ${b} in an additive comparison`)
}

function productRuntime(a: VanityMathDimension, b: VanityMathDimension): VanityMathDimension {
  if (a === 'unknown' || b === 'unknown')
    return 'unknown'
  if (a === 'number')
    return b
  if (b === 'number')
    return a
  return 'unknown'
}

function quotientRuntime(a: VanityMathDimension, b: VanityMathDimension): VanityMathDimension {
  if (a === 'unknown' || b === 'unknown')
    return 'unknown'
  if (b === 'number')
    return a
  if (a === b)
    return 'number'
  return 'unknown'
}

function typedArithmetic(a: VanityMathDimension, b: VanityMathDimension): boolean {
  return a !== 'unknown' && b !== 'unknown' && a !== 'none' && b !== 'none' && a !== 'number' && b !== 'number'
}

function isLengthPercentage(value: VanityMathDimension): boolean {
  return value === 'length' || value === 'percentage' || value === 'length-percentage'
}

function dataType<Dimension extends VanityMathDimension>(dimension: Dimension): DataTypeOfDimension<Dimension> {
  return dimension as DataTypeOfDimension<Dimension>
}

function finiteOperand(operation: string, value: VanityCssInput): void {
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new RangeError(`[vanity] calc().${operation}() needs a finite number; received ${value}`)
}

function sourceOf(value: VanityCssInput) {
  try {
    return mathNode(value).source ?? {}
  }
  catch {
    return {}
  }
}
