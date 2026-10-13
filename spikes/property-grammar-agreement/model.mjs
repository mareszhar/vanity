import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { transformCss } from '@vanilla-extract/css/transformCss'
import { createLexer, definitionSyntax, generate, parse, walk } from 'css-tree'
import { transform } from 'lightningcss'
import { getMathSubstitutions } from './math-types.mjs'

export const grammar = JSON.parse(readFileSync(new URL('./grammar.generated.json', import.meta.url)))
export const platformGaps = JSON.parse(readFileSync(new URL('./platform-gaps.json', import.meta.url)))
const properties = Object.fromEntries(Object.entries(grammar.properties).filter(([,x]) => x.syntax).map(([name, x]) => [name, x.syntax]))
const definitions = new Map()
for (const item of grammar.types) {
  const entries = definitions.get(item.name) ?? []
  entries.push(item)
  definitions.set(item.name, entries)
}
const types = Object.fromEntries([...definitions].map(([name, entries]) => [name, (entries.find(x => !x.for.length) ?? entries[0]).syntax]))
const lexers = new Map()
const incompleteGrammars = new Map()

export function getLexer(property) {
  const scoped = Object.fromEntries([...definitions].flatMap(([name, entries]) => {
    const entry = entries.find(x => x.for.includes(property))
    return entry ? [[name, entry.syntax]] : []
  }))
  const key = JSON.stringify(scoped)
  if (!lexers.has(key)) {
    const lexer = createLexer({ properties, types: { ...types, ...scoped }, generic: true })
    lexers.set(key, lexer)
  }
  return lexers.get(key)
}

function hasMissingGrammar(property, lexer, ast) {
  const functions = new Set()
  walk(ast, (node) => {
    if (node.type === 'Function')
      functions.add(node.name.toLowerCase())
    if (node.type === 'Url')
      functions.add('url')
  })
  const cacheKey = `${property}\0${[...functions].sort().join(',')}`
  if (incompleteGrammars.has(cacheKey))
    return incompleteGrammars.get(cacheKey)
  const seen = new Set()
  let missing = false
  const visit = (kind, name) => {
    // A named function grammar cannot participate when that function is
    // absent. Incomplete draft function internals must not hide scalar bounds.
    if (kind === 'Type' && name.endsWith('()') && !functions.has(name.slice(0, -2).toLowerCase()))
      return
    const key = `${kind}:${name}`
    if (seen.has(key))
      return
    seen.add(key)
    const descriptor = kind === 'Type' ? lexer.getType(name) : lexer.getProperty(name, false)
    if (!descriptor) {
      missing = true
      return
    }
    if (descriptor.syntax) {
      definitionSyntax.walk(descriptor.syntax, (node) => {
        if (node.type === 'Type' || node.type === 'Property')
          visit(node.type, node.name)
      })
    }
  }
  visit('Property', property)
  incompleteGrammars.set(cacheKey, missing)
  return missing
}

export function inspectDeclaration(property, value, { useFallback = true } = {}) {
  if (platformGaps.native[property])
    return { status: 'unresolved', reason: platformGaps.native[property] }
  if (useFallback && platformGaps.agreement[property])
    return { status: 'unresolved', reason: platformGaps.agreement[property].reason }
  if (!properties[property])
    return { status: 'unresolved', reason: 'No property grammar' }
  let substrate = 'typed'
  try {
    transform({ filename: 'probe.css', code: Buffer.from(`.probe{${property}:${value}}`), visitor: {
      Declaration(declaration) { substrate = declaration.property },
    } })
  }
  catch (error) {
    if (error.name === 'SyntaxError' && typeof error.data?.type === 'string')
      return { status: 'rejected', substrate: 'error', reason: error.message }
    return { status: 'errored', substrate: 'error', reason: error.message }
  }
  let ast
  try {
    ast = parse(value, { context: 'value', positions: true })
  }
  catch (error) {
    if (error.name === 'SyntaxError')
      return { status: 'rejected', substrate, reason: error.message }
    return { status: 'errored', substrate, reason: error.message }
  }
  if (value.includes('var(') || value.includes('env('))
    return { status: 'unresolved', substrate, reason: 'External substitution' }
  try {
    const lexer = getLexer(property)
    if (hasMissingGrammar(property, lexer, ast))
      return { status: 'unresolved', substrate, reason: 'Property grammar references missing definitions' }
    const math = getMathSubstitutions(ast, value, lexer.units)
    if (math.status !== 'accepted')
      return { ...math, substrate }
    const result = lexer.matchProperty(property, ast)
    const valid = math.values.every(source => lexer.matchProperty(property, source).matched)
    if (valid) {
      for (const node of ast.children.toArray()) {
        if (!['Number', 'Dimension', 'Percentage'].includes(node.type))
          continue
        for (const entry of result.getTrace(node) ?? []) {
          if (entry.opts?.type !== 'Range')
            continue
          for (const [edge, bound] of [['min', entry.opts.min], ['max', entry.opts.max]]) {
            if (typeof bound !== 'string')
              continue
            const parsed = bound.match(/^([+-]?(?:\d*\.)?\d+)([a-z%]+)$/i)
            if (!parsed)
              return { status: 'unresolved', substrate, reason: `Unestablished grammar bound ${bound}` }
            // Zero is comparable across compatible units without conversion.
            // Nonzero bounds need the same unit; other comparisons remain
            // unresolved instead of silently skipping a dimensioned range.
            const numeric = Number(parsed[1])
            if (numeric !== 0 && parsed[2].toLowerCase() !== node.unit?.toLowerCase())
              return { status: 'unresolved', substrate, reason: `Grammar bound needs unit conversion: ${bound}` }
            if ((edge === 'min' && Number(node.value) < numeric) || (edge === 'max' && Number(node.value) > numeric))
              return { status: 'rejected', substrate, reason: `Outside grammar range ${edge} ${bound}` }
          }
        }
      }
    }
    if (result.error?.name === 'SyntaxReferenceError')
      return { status: 'unresolved', substrate, reason: result.error.message }
    // Unrecognized native functions remain a platform capability; they never
    // become a rejection merely because the current data cannot name them.
    if (!valid && substrate === 'unparsed' && /[a-z-]+\(/i.test(value) && !/\b(?:calc|min|max|clamp)\(/i.test(value)) {
      return { status: 'unresolved', substrate, reason: 'Function grammar not established' }
    }
    return {
      status: valid ? 'accepted' : 'rejected',
      substrate,
      reason: result.error?.message?.split('\n')[0],
      components: ast.children.toArray().map(node => ({ value: generate(node), trace: result.getTrace(node) })),
    }
  }
  catch (error) { return { status: 'errored', substrate, reason: error.message } }
}

export function emitNumber(property, value) {
  const camel = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
  const css = transformCss({ localClassNames: [], composedClassLists: [], cssObjs: [{ type: 'global', selector: '.numeric', rule: { [camel]: value } }] }).join('\n')
  return css.slice(css.indexOf(':') + 1, css.lastIndexOf(';')).trim()
}

// Retain component trees/ranges as named data; a type union alone cannot prove
// which shorthand component a role fills or whether its full type is safe.
export function getGrammarTypes(property) {
  const seen = new Set()
  const result = new Set()
  const visit = (ast) => {
    definitionSyntax.walk(ast, (node) => {
      if (node.type !== 'Type' && node.type !== 'Property')
        return
      const key = `${node.type}:${node.name}`
      result.add(key)
      if (seen.has(key))
        return
      seen.add(key)
      const syntax = node.type === 'Property' ? properties[node.name] : types[node.name]
      if (syntax)
        visit(definitionSyntax.parse(syntax))
    })
  }
  const ast = grammar.grammars[property]
  if (ast)
    visit(ast)
  return [...result].sort()
}

export function getPropertyFamily(property) {
  const result = new Set([property])
  const visit = (name) => {
    for (const child of grammar.properties[name]?.longhands ?? []) {
      if (!result.has(child)) {
        result.add(child)
        visit(child)
      }
    }
  }
  visit(property)
  const groups = new Set([...result].flatMap(name => grammar.properties[name]?.logicalPropertyGroup ?? []))
  // A shorthand such as border-color may have no logical group itself; its
  // expanded physical leaves name the group shared by logical members.
  for (const [name, entry] of Object.entries(grammar.properties)) {
    if (entry.logicalPropertyGroup && groups.has(entry.logicalPropertyGroup))
      result.add(name)
  }
  return [...result].sort()
}
