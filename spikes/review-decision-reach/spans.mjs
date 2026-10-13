// Local source-range model; it does not import Vanity's instrumentation.
import { parseSync, Visitor } from 'oxc-parser'

function unwrap(value) {
  while (['ParenthesizedExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSInstantiationExpression'].includes(value.type)) value = value.expression
  return value
}
function staticValue(input, memberRoot = false) {
  const value = unwrap(input)
  if (value.type === 'Literal')
    return true
  if (value.type === 'Identifier')
    return memberRoot && ['ds', 't'].includes(value.name)
  if (value.type === 'MemberExpression')
    return (!value.computed || value.property.type === 'Literal') && staticValue(value.object, true)
  if (value.type === 'TemplateLiteral')
    return value.expressions.every(expression => staticValue(expression))
  if (value.type === 'CallExpression') {
    const callee = value.callee
    return callee.type === 'MemberExpression' && !callee.computed
      && ['calc', 'min', 'max', 'clamp', 'add', 'subtract', 'multiply', 'divide', 'negate'].includes(callee.property.name)
      && staticValue(callee.object, true) && value.arguments.every(argument => argument.type !== 'SpreadElement' && staticValue(argument))
  }
  return false
}
export function getAuthoredValueSpans(source, file = 'fixture.css.ts') {
  const parsed = parseSync(file, source, { range: true })
  if (parsed.errors.length)
    throw new Error(JSON.stringify(parsed.errors))
  const rows = []
  let depth = 0
  function collect(object, path) {
    for (const property of object.properties) {
      if (property.type === 'SpreadElement') {
        rows.push({ path: [...path, '$dec'], source: { start: property.start, end: property.end, text: source.slice(property.start, property.end) }, editable: false, reason: 'spread has no independently authored leaf value' })
        continue
      }
      if (property.type !== 'Property')
        continue
      const name = property.key.name ?? property.key.value
      if (typeof name !== 'string')
        continue
      const value = unwrap(property.value)
      if (value.type === 'ObjectExpression') {
        collect(value, [...path, name])
        continue
      }
      const editable = depth === 0 && staticValue(value)
      rows.push({ path: [...path, name], source: { start: property.value.start, end: property.value.end, text: source.slice(property.value.start, property.value.end) }, editable, ...(!editable ? { reason: depth ? 'style created in a helper function' : 'value built in a helper or dynamic expression' } : {}) })
    }
  }
  new Visitor({
    FunctionDeclaration() { depth++ },
    'FunctionDeclaration:exit': function () { depth-- },
    FunctionExpression() { depth++ },
    'FunctionExpression:exit': function () { depth-- },
    ArrowFunctionExpression() { depth++ },
    'ArrowFunctionExpression:exit': function () { depth-- },
    CallExpression(node) {
      const name = node.callee.property?.name
      if (!['class', 'recipe', 'anatomy'].includes(name))
        return
      const input = node.arguments[0]
      if (input?.type === 'ObjectExpression')
        collect(input, [name])
      if (input?.type === 'ArrayExpression') {
        input.elements.forEach((value, index) => {
          if (value?.type === 'ObjectExpression')
            collect(value, [name, String(index)])
        })
      }
    },
  }).visit(parsed.program)
  return rows
}
