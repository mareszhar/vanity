import type { CssNode } from 'css-tree'

export interface VanityDeclarationDerivation {
  terms: Array<{ token: string, factor: number }>
  allowed: boolean
  audit: boolean
  reason?: string
}

interface Fraction { numerator: bigint, denominator: bigint }
interface Terms {
  groups: Array<Array<{ token: string, factor: Fraction }>>
  scalar?: Fraction
  raw?: boolean
  unresolved?: boolean
}

/** Fold transformations on the classifier's parsed component, never on style input. */
export function inspectDeclarationDerivation(node: CssNode, tokens: ReadonlyMap<string, string>): VanityDeclarationDerivation {
  const result = parseDerivationAtom(node)
  const terms = result.groups.flat().map(term => ({ token: term.token, factor: Number(term.factor.numerator) / Number(term.factor.denominator) }))
  const allowed = !result.raw && !result.unresolved && terms.length > 0 && result.groups.every(group => group.every((term) => {
    const numerator = term.factor.numerator < 0n ? -term.factor.numerator : term.factor.numerator
    const denominator = term.factor.denominator
    return group.length > 1 ? numerator === denominator : numerator === 0n || numerator % denominator === 0n || denominator % numerator === 0n
  }))
  return { terms, allowed, audit: false, ...(allowed ? {} : { reason: result.unresolved ? 'The net transformation is not established' : 'Scale one token by an integer or its reciprocal; sums combine only unscaled tokens' }) }

  function parseDerivationAtom(part: CssNode): Terms {
    if (part.type === 'Number') {
      const scalar = parseDecimal(part.value)
      return scalar ? { groups: [], scalar } : { groups: [], unresolved: true }
    }
    if (part.type === 'Value' || part.type === 'Parentheses')
      return parseDerivationExpression(part.children.toArray())
    if (part.type !== 'Function')
      return { groups: [], raw: true }
    const name = part.name.toLowerCase()
    if (name === 'var') {
      const first = part.children.first
      const token = first?.type === 'Identifier' ? tokens.get(first.name) : undefined
      return token ? { groups: [[{ token, factor: createFraction(1n) }]] } : { groups: [], unresolved: true }
    }
    if (name === 'calc')
      return parseDerivationExpression(part.children.toArray())
    if (['min', 'max', 'clamp'].includes(name)) {
      const args: CssNode[][] = [[]]
      for (const child of part.children) {
        if (child.type === 'Operator' && child.value.trim() === ',')
          args.push([])
        else
          args.at(-1)!.push(child)
      }
      const values = args.map(parseDerivationExpression)
      return { groups: values.flatMap(value => value.groups), raw: values.some(value => value.raw || value.scalar !== undefined), unresolved: values.some(value => value.unresolved) }
    }
    return { groups: [], unresolved: true }
  }

  function parseDerivationExpression(parts: CssNode[]): Terms {
    let index = 0
    const parseOperand = (): Terms => {
      const next = parts[index++]
      if (!next)
        return { groups: [], unresolved: true }
      if (next.type === 'Operator' && ['+', '-'].includes(next.value.trim())) {
        const value = parseOperand()
        return applyTermFactor(value, createFraction(next.value.trim() === '-' ? -1n : 1n))
      }
      return parseDerivationAtom(next)
    }
    const parseProduct = (): Terms => {
      let value = parseOperand()
      while (parts[index]?.type === 'Operator' && ['*', '/'].includes((parts[index] as { value: string }).value.trim())) {
        const operator = (parts[index++] as { value: string }).value.trim()
        const right = parseOperand()
        if (right.scalar !== undefined && !right.raw && !right.unresolved) {
          value = operator === '/' && right.scalar.numerator === 0n
            ? { ...value, unresolved: true }
            : applyTermFactor(value, operator === '/' ? createFraction(right.scalar.denominator, right.scalar.numerator) : right.scalar)
        }
        else if (operator === '*' && value.scalar !== undefined && !value.raw && !value.unresolved) {
          value = applyTermFactor(right, value.scalar)
        }
        else {
          value = { groups: [...value.groups, ...right.groups], unresolved: true }
        }
      }
      return value
    }
    let value = parseProduct()
    while (index < parts.length) {
      const operator = parts[index++]
      if (operator?.type !== 'Operator' || !['+', '-'].includes(operator.value.trim()))
        return { ...value, unresolved: true }
      const right = applyTermFactor(parseProduct(), createFraction(operator.value.trim() === '-' ? -1n : 1n))
      if (value.scalar !== undefined && right.scalar !== undefined) {
        value = { groups: [], scalar: createFraction(value.scalar.numerator * right.scalar.denominator + right.scalar.numerator * value.scalar.denominator, value.scalar.denominator * right.scalar.denominator) }
      }
      else {
        // Zero is the identity used by the shared negate renderer. Nonzero
        // literal offsets remain raw decisions, even if they happen to cancel.
        value = {
          groups: value.groups.flatMap(left => right.groups.length ? right.groups.map(group => [...left, ...group]) : [left]).concat(value.groups.length ? [] : right.groups),
          raw: value.raw || right.raw || (value.scalar !== undefined && value.scalar.numerator !== 0n) || (right.scalar !== undefined && right.scalar.numerator !== 0n),
          unresolved: value.unresolved || right.unresolved,
        }
      }
    }
    return value
  }
}

function applyTermFactor(value: Terms, factor: Fraction): Terms {
  const multiply = (left: Fraction): Fraction => createFraction(left.numerator * factor.numerator, left.denominator * factor.denominator)
  return { ...value, groups: value.groups.map(group => group.map(term => ({ ...term, factor: multiply(term.factor) }))), ...(value.scalar === undefined ? {} : { scalar: multiply(value.scalar) }) }
}

/** CSS decimal spelling is exact; binary rounding must not decide policy. */
function parseDecimal(source: string): Fraction | undefined {
  if (!Number.isFinite(Number(source)))
    return undefined
  const [mantissa, exponent = '0'] = source.toLowerCase().split('e')
  const [integer = '0', decimals = ''] = mantissa!.split('.')
  const shift = Number(exponent) - decimals.length
  const numerator = BigInt(`${integer}${decimals}`)
  return shift >= 0 ? createFraction(numerator * 10n ** BigInt(shift)) : createFraction(numerator, 10n ** BigInt(-shift))
}

function createFraction(numerator: bigint, denominator = 1n): Fraction {
  if (denominator < 0n) {
    numerator = -numerator
    denominator = -denominator
  }
  let left = numerator < 0n ? -numerator : numerator
  let right = denominator
  while (right !== 0n) {
    [left, right] = [right, left % right]
  }
  return { numerator: numerator / left, denominator: denominator / left }
}
