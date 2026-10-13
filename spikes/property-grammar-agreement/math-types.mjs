import { walk } from 'css-tree'

const REPRESENTATIVES = { number: '1', percentage: '1%', length: '1px', time: '1s', angle: '1deg', frequency: '1Hz', resolution: '1dppx', flex: '1fr' }
const MATH_FUNCTIONS = new Set(['calc', 'min', 'max', 'clamp'])
// CSS Values §10 names these numeric functions; this finite arithmetic model
// establishes no dimensions for them, so the result remains unresolved.
const OTHER_MATH_FUNCTIONS = new Set(['round', 'mod', 'rem', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'pow', 'sqrt', 'hypot', 'log', 'exp', 'abs', 'sign'])

function addTypes(left, right) {
  const result = [...new Set([...left, ...right])]
  if (result.length === 1 || (result.length === 2 && result.includes('percentage') && result.some(x => x === 'length' || x === 'number')))
    return result
  return []
}

function multiplyTypes(left, right, divide) {
  if (right.length === 1 && right[0] === 'number')
    return left
  if (!divide && left.length === 1 && left[0] === 'number')
    return right
  if (divide && left.length === 1 && right.length === 1 && left[0] === right[0])
    return ['number']
  return []
}

function getAtomTypes(node, units) {
  if (node.type === 'Number')
    return ['number']
  if (node.type === 'Percentage')
    return ['percentage']
  if (node.type === 'Dimension')
    return Object.entries(units).filter(([,values]) => values.some(x => x.toLowerCase() === node.unit.toLowerCase())).map(([kind]) => kind)
  if (node.type === 'Parentheses' || (node.type === 'Function' && MATH_FUNCTIONS.has(node.name.toLowerCase())))
    return getExpressionTypes(node.children.toArray(), units)
  return null
}

function getExpressionTypes(nodes, units) {
  // Model the numeric-type part of CSS Values §10.9, not numeric evaluation.
  // The property clamps out-of-range math at computed-value time (§10.12).
  const terms = []
  let pending = '+'
  for (const node of nodes) {
    if (node.type === 'Operator') {
      pending = node.value.trim()
      continue
    }
    const type = getAtomTypes(node, units)
    if (type === null)
      return null
    if (!type.length)
      return []
    if (pending === '*' || pending === '/') {
      const product = multiplyTypes(terms.pop(), type, pending === '/')
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
  return terms.slice(1).reduce((result, type) => result.length ? addTypes(result, type) : [], terms[0])
}

/** Return representative substitutions proving a math component's grammar type. */
export function getMathSubstitutions(ast, value, units) {
  const expressions = []
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
  for (const node of expressions.reverse()) {
    const kinds = getAtomTypes(node, units)
    if (kinds === null)
      return { status: 'unresolved', reason: 'Math function type not established' }
    if (!kinds.length || kinds.some(x => !REPRESENTATIVES[x]))
      return { status: 'rejected', reason: 'Incompatible math dimensions' }
    values = values.flatMap(source => kinds.map(kind => source.slice(0, node.loc.start.offset) + REPRESENTATIVES[kind] + source.slice(node.loc.end.offset)))
  }
  return { status: 'accepted', values }
}
