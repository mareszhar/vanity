/** CSS math on the shared value IR: immutable, typed, and precedence-safe. */

import type { VanityExpressionNode, VanityOperationNode } from './protocol'
import type { VanityCssDataType, VanityCssInput, VanityCssValue, VanityValue } from './types'
import { throwValueError } from './error'
import {
  createCompositeNode,
  createFunctionNode,
  createInputNode,
  createOperationNode,
  ExpressionValue,
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
    super(createCompositeNode({
      type: getDataType(dimension),
      parts: ['calc(', expression, ')'],
      requirements: ['calc-basic'],
      source: { helper: 'calc' },
    }) as VanityExpressionNode<DataTypeOfDimension<Dimension>>)
  }

  add<const Input extends VanityCssInput>(value: SumInput<Dimension, Input>): VanityCalc<VanitySumDimension<Dimension, VanityDimensionOf<Input>>> {
    const other = getDimension(value)
    return createBinaryOperation(this.expression, '+', createMathNode(value), getSumRuntimeDimension(this.dimension, other)) as never
  }

  subtract<const Input extends VanityCssInput>(value: SumInput<Dimension, Input>): VanityCalc<VanitySumDimension<Dimension, VanityDimensionOf<Input>>> {
    const other = getDimension(value)
    return createBinaryOperation(this.expression, '-', createMathNode(value), getSumRuntimeDimension(this.dimension, other)) as never
  }

  multiply<const Input extends VanityCssInput>(value: Input): VanityCalc<VanityProductDimension<Dimension, VanityDimensionOf<Input>>> {
    validateFiniteOperand('multiply', value)
    const other = getDimension(value)
    return createBinaryOperation(this.expression, '*', createMathNode(value), getProductRuntimeDimension(this.dimension, other), requireTypedArithmetic(this.dimension, other)) as never
  }

  divide<const Input extends VanityCssInput>(value: Input): VanityCalc<VanityQuotientDimension<Dimension, VanityDimensionOf<Input>>> {
    validateFiniteOperand('divide', value)
    if (typeof value === 'number' && value === 0) {
      throwValueError(
        'VANITY_CSS_INVALID_VALUE',
        'calc().divide() cannot divide by zero',
        'calc.divide',
        'use a non-zero divisor',
      )
    }
    const other = getDimension(value)
    return createBinaryOperation(this.expression, '/', createMathNode(value), getQuotientRuntimeDimension(this.dimension, other), requireTypedArithmetic(this.dimension, other)) as never
  }

  negate(): VanityCalc<Dimension> {
    return createBinaryOperation(createInputNode(-1, 'number'), '*', this.expression, this.dimension) as VanityCalc<Dimension>
  }
}

class FunctionValue<Dimension extends VanityMathDimension> extends ExpressionValue<DataTypeOfDimension<Dimension>> implements VanityMathValue<Dimension> {
  constructor(
    name: 'min' | 'max' | 'clamp',
    values: readonly VanityCssInput[],
    readonly dimension: Dimension,
  ) {
    super(createFunctionNode({
      type: getDataType(dimension),
      name,
      values: values.map(value => createInputNode(value)),
      separator: ', ',
      requirements: ['calc-basic'],
      source: { helper: name, parents: values.map(getValueSource) },
    }) as VanityExpressionNode<DataTypeOfDimension<Dimension>>)
  }
}

/** Start an immutable CSS calculation. Nested calculations preserve precedence. */
export function calc<const Input extends VanityCssInput>(value: Input): VanityCalc<VanityDimensionOf<Input>> {
  return new CalcValue(createMathNode(value), getDimension(value) as VanityDimensionOf<Input>)
}

/** The smallest of one or more compatible CSS numeric values. */
export function min<const Inputs extends readonly [VanityCssInput, ...VanityCssInput[]]>(
  ...values: Inputs & CompatibleMathInputs<Inputs>
): VanityMathValue<JoinDimensions<Inputs>> {
  return createMathFunction('min', values) as VanityMathValue<JoinDimensions<Inputs>>
}

/** The largest of one or more compatible CSS numeric values. */
export function max<const Inputs extends readonly [VanityCssInput, ...VanityCssInput[]]>(
  ...values: Inputs & CompatibleMathInputs<Inputs>
): VanityMathValue<JoinDimensions<Inputs>> {
  return createMathFunction('max', values) as VanityMathValue<JoinDimensions<Inputs>>
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
  return createMathFunction('clamp', values) as VanityMathValue<JoinDimensions<[Minimum, Preferred, Maximum]>>
}

function createMathFunction(name: 'min' | 'max' | 'clamp', values: readonly VanityCssInput[]): VanityMathValue {
  const dimension = getCommonRuntimeDimension(values)
  return new FunctionValue(name, values, dimension)
}

function createBinaryOperation(
  left: VanityExpressionNode,
  operator: VanityOperationNode['operator'],
  right: VanityExpressionNode,
  dimension: VanityMathDimension,
  needsTypedArithmetic = false,
): CalcValue<any> {
  const precedence = getOperationPrecedence(operator)
  const leftNode = parenthesizeForOperation(left, precedence, false, operator)
  const rightNode = parenthesizeForOperation(right, precedence, true, operator)
  return new CalcValue(createOperationNode({
    type: getDataType(dimension),
    operator,
    left: leftNode,
    right: rightNode,
    requirements: needsTypedArithmetic ? ['calc-basic', 'calc-typed-arithmetic'] : ['calc-basic'],
    source: { helper: `calc.${getOperationName(operator)}`, parents: [left.source ?? {}, right.source ?? {}] },
  }), dimension) as CalcValue<any>
}

function createMathNode(value: VanityCssInput): VanityExpressionNode {
  return value instanceof CalcValue ? value.expression : createInputNode(value)
}

function parenthesizeForOperation(
  node: VanityExpressionNode,
  parentPrecedence: number,
  right: boolean,
  operator: VanityOperationNode['operator'],
): VanityExpressionNode {
  if (node.kind !== 'operation')
    return node
  const childPrecedence = getOperationPrecedence(node.operator)
  const required = childPrecedence < parentPrecedence
    || (right && childPrecedence === parentPrecedence && (operator === '-' || operator === '/'))
  return required ? { ...node, parenthesize: true } : node
}

function getOperationPrecedence(operator: VanityOperationNode['operator']): number {
  return operator === '+' || operator === '-' ? 1 : 2
}

function getOperationName(operator: VanityOperationNode['operator']): string {
  return operator === '+' ? 'add' : operator === '-' ? 'subtract' : operator === '*' ? 'multiply' : 'divide'
}

function getDimension(value: VanityCssInput): VanityMathDimension {
  if ((typeof value === 'object' || typeof value === 'function') && value !== null) {
    if ('dimension' in value)
      return (value as VanityMathValue).dimension
    if ('type' in value)
      return getDimensionFromType((value as VanityValue).type)
    if ('$type' in value && typeof value.$type === 'string')
      return getDimensionFromType(value.$type as VanityCssDataType)
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

function getDimensionFromType(type: VanityCssDataType): VanityMathDimension {
  if (type === 'integer')
    return 'number'
  return ['number', 'length', 'percentage', 'length-percentage', 'angle', 'time', 'frequency', 'resolution', 'flex'].includes(type)
    ? type as VanityMathDimension
    : 'unknown'
}

function getCommonRuntimeDimension(values: readonly VanityCssInput[]): VanityMathDimension {
  let dimension = getDimension(values[0]!)
  for (const value of values.slice(1))
    dimension = getSumRuntimeDimension(dimension, getDimension(value))
  return dimension
}

function getSumRuntimeDimension(a: VanityMathDimension, b: VanityMathDimension): VanityMathDimension {
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
  throwValueError(
    'VANITY_CSS_INVALID_VALUE',
    `CSS math cannot combine ${a} and ${b} in an additive comparison`,
    'calc',
    'combine compatible CSS dimensions or use an explicitly typed value',
  )
}

function getProductRuntimeDimension(a: VanityMathDimension, b: VanityMathDimension): VanityMathDimension {
  if (a === 'unknown' || b === 'unknown')
    return 'unknown'
  if (a === 'number')
    return b
  if (b === 'number')
    return a
  return 'unknown'
}

function getQuotientRuntimeDimension(a: VanityMathDimension, b: VanityMathDimension): VanityMathDimension {
  if (a === 'unknown' || b === 'unknown')
    return 'unknown'
  if (b === 'number')
    return a
  if (a === b)
    return 'number'
  return 'unknown'
}

function requireTypedArithmetic(a: VanityMathDimension, b: VanityMathDimension): boolean {
  return a !== 'unknown' && b !== 'unknown' && a !== 'none' && b !== 'none' && a !== 'number' && b !== 'number'
}

function isLengthPercentage(value: VanityMathDimension): boolean {
  return value === 'length' || value === 'percentage' || value === 'length-percentage'
}

function getDataType<Dimension extends VanityMathDimension>(dimension: Dimension): DataTypeOfDimension<Dimension> {
  return dimension as DataTypeOfDimension<Dimension>
}

function validateFiniteOperand(operation: string, value: VanityCssInput): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throwValueError(
      'VANITY_CSS_INVALID_VALUE',
      `calc().${operation}() needs a finite number; received ${value}`,
      `calc.${operation}`,
      'pass a finite number',
    )
  }
}

function getValueSource(value: VanityCssInput) {
  try {
    return createMathNode(value).source ?? {}
  }
  catch {
    return {}
  }
}
