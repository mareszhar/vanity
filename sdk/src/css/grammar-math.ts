import type { CssNode } from 'css-tree'
import { walk } from 'css-tree'

const REPRESENTATIVES: Readonly<Record<string, string>> = { number: '1', percentage: '1%', length: '1px', time: '1s', angle: '1deg', frequency: '1Hz', resolution: '1dppx', flex: '1fr' }
const MATH_FUNCTIONS = new Set(['calc', 'min', 'max', 'clamp'])
const OTHER_MATH_FUNCTIONS = new Set(['round', 'mod', 'rem', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'pow', 'sqrt', 'hypot', 'log', 'exp', 'abs', 'sign'])
type Units = Readonly<Record<string, readonly string[]>>
type MathResult = { status: 'accepted', values: string[], expressions: Array<{ start: number, types: string[] }> } | { status: 'rejected' | 'unresolved', reason: string }
type ReferenceTypes = ReadonlyMap<string, string>

function addTypes(left: string[], right: string[]): string[] {
  const result = [...new Set([...left, ...right])]
  return result.length === 1 || (result.length === 2 && result.includes('percentage') && result.some(type => type === 'length' || type === 'number')) ? result : []
}

function combineProductTypes(left: string[], right: string[], divide: boolean): string[] {
  if (right.length === 1 && right[0] === 'number')
    return left
  if (!divide && left.length === 1 && left[0] === 'number')
    return right
  return divide && left.length === 1 && right.length === 1 && left[0] === right[0] ? ['number'] : []
}

function getAtomTypes(node: CssNode, units: Units, references?: ReferenceTypes): string[] | null {
  if (node.type === 'Function' && node.name.toLowerCase() === 'var' && references) {
    const first = node.children.first
    const type = first?.type === 'Identifier' ? references.get(first.name) : undefined
    if (type === undefined || type === 'unknown')
      return null
    if (type === 'integer')
      return ['number']
    if (type === 'length-percentage' || type === 'number-percentage')
      return type.split('-')
    return REPRESENTATIVES[type] ? [type] : []
  }
  if (node.type === 'Number')
    return ['number']
  if (node.type === 'Percentage')
    return ['percentage']
  if (node.type === 'Dimension')
    return Object.entries(units).filter(([, values]) => values.some(unit => unit.toLowerCase() === node.unit.toLowerCase())).map(([kind]) => kind)
  if (node.type === 'Parentheses' || (node.type === 'Function' && MATH_FUNCTIONS.has(node.name.toLowerCase())))
    return getExpressionTypes(node.children.toArray(), units, references)
  return null
}

function getExpressionTypes(nodes: CssNode[], units: Units, references?: ReferenceTypes): string[] | null {
  const terms: string[][] = []
  let pending = '+'
  for (const node of nodes) {
    if (node.type === 'Operator') {
      pending = node.value.trim()
      continue
    }
    const type = getAtomTypes(node, units, references)
    if (type === null)
      return null
    if (!type.length)
      return []
    if (pending === '*' || pending === '/') {
      const left = terms.pop()
      if (!left)
        return []
      const product = combineProductTypes(left, type, pending === '/')
      if (!product.length)
        return []
      terms.push(product)
    }
    else {
      terms.push(type)
    }
  }
  if (!terms.length)
    return []
  return terms.slice(1).reduce((result, type) => result.length ? addTypes(result, type) : [], terms[0]!)
}

/** CSS Values §10.9 dimensions; ranges in math clamp at computed-value time. */
export function getMathSubstitutions(ast: CssNode, value: string, units: Units, references?: ReferenceTypes): MathResult {
  const expressions: CssNode[] = []
  let unresolved = false
  walk(ast, { visit: 'Function', enter(node) {
    if (OTHER_MATH_FUNCTIONS.has(node.name.toLowerCase())) {
      unresolved = true
      return walk.skip
    }
    if (!MATH_FUNCTIONS.has(node.name.toLowerCase()))
      return
    expressions.push(node)
    return walk.skip
  } })
  if (unresolved)
    return { status: 'unresolved', reason: 'Math function type not established' }
  let values = [value]
  const dimensions: Array<{ start: number, types: string[] }> = []
  for (const node of expressions.reverse()) {
    const kinds = getAtomTypes(node, units, references)
    if (kinds === null)
      return { status: 'unresolved', reason: 'Math function type not established' }
    if (!kinds.length || kinds.some(kind => !REPRESENTATIVES[kind]))
      return { status: 'rejected', reason: 'Incompatible math dimensions' }
    dimensions.push({ start: node.loc!.start.offset, types: kinds })
    values = values.flatMap(source => kinds.map(kind => source.slice(0, node.loc!.start.offset) + REPRESENTATIVES[kind] + source.slice(node.loc!.end.offset)))
  }
  return { status: 'accepted', values, expressions: dimensions }
}
