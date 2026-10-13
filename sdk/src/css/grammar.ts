import type { Declaration, Lexer, Value } from 'css-tree'
import type { VanityCssDataType } from '../values/types'
import { Buffer } from 'node:buffer'
import { createLexer, definitionSyntax, ident, parse, walk } from 'css-tree'
import { getMathSubstitutions } from './grammar-math'
import generated from './property-grammar.generated.json' with { type: 'json' }

interface PropertyGrammar {
  properties: Record<string, { syntax: string | null, longhands: string[], logicalPropertyGroup: string | null }>
  types: Array<{ name: string, syntax: string, for: string[] }>
  selectors: string[]
  propertyData: Record<string, { acceptedTypes: string[], references: string[], slotReferences: string[], components: string[], logicalPropertyGroup: string | null, incomplete: boolean, unresolved?: string }>
  gaps: { native: Record<string, string>, agreement: Record<string, { reason: string }> }
}
const grammar: PropertyGrammar = generated as unknown as PropertyGrammar
const properties = Object.fromEntries(Object.entries(grammar.properties).filter(([, entry]) => entry.syntax).map(([name, entry]) => [name, entry.syntax!]))
const definitions = new Map<string, PropertyGrammar['types']>()
for (const entry of grammar.types) {
  const entries = definitions.get(entry.name) ?? []
  entries.push(entry)
  definitions.set(entry.name, entries)
}
const types = Object.fromEntries([...definitions].map(([name, entries]) => [name, (entries.find(entry => !entry.for.length) ?? entries[0])!.syntax]))
const lexers = new Map<string, Lexer>()
const incompleteGrammars = new Map<string, boolean>()
const selectors = new Set(grammar.selectors.map(selector => selector.replace(/\(\)$/, '')))
const unknownSelectors = new Map<string, string[]>()

/** The grammar's pseudo vocabulary, including decoded names and nested selector arguments. */
export function inspectSelectorGrammar(selector: string): readonly string[] {
  const cached = unknownSelectors.get(selector)
  if (cached)
    return cached
  const unknown = new Set<string>()
  // Native CSS input preprocessing replaces NUL and unpaired surrogates.
  // The warning parser must read those same code points, not throw before
  // the existing native validity check or authored-name diagnostic can finish.
  const input = Buffer.from(selector).toString().replaceAll('\0', '\uFFFD').replaceAll('&', '.vanity-probe')
  walk(parse(input, { context: 'selectorList' }), (node) => {
    if (node.type !== 'PseudoClassSelector' && node.type !== 'PseudoElementSelector')
      return
    const name = `${node.type === 'PseudoElementSelector' ? '::' : ':'}${ident.decode(node.name).toLowerCase()}`
    if (!selectors.has(name))
      unknown.add(name)
  })
  const result = [...unknown]
  unknownSelectors.set(selector, result)
  return result
}

// These public runtime fields are missing from @types/css-tree3.2.0. Trace
// entries are the definition-syntax nodes returned by CSSTree's getTrace.
type PropertyLexer = Lexer & { units: Readonly<Record<string, readonly string[]>> }
interface GrammarTrace {
  type: string
  name?: string
  opts?: { min: number | string | null, max: number | string | null } | null
}

const literalTokenTypes = new Map<string, VanityCssDataType>()

/** Infer intrinsic literal types; composite grammar matches do not prove intent. */
export function getLiteralTokenType(source: string): VanityCssDataType {
  const cached = literalTokenTypes.get(source)
  if (cached !== undefined)
    return cached
  const type = inferLiteralTokenType(source)
  literalTokenTypes.set(source, type)
  return type
}

function inferLiteralTokenType(source: string): VanityCssDataType {
  let ast: Value
  try {
    ast = parse(source, { context: 'value' }) as Value
  }
  catch (error) {
    if (error instanceof Error && error.name === 'SyntaxError')
      return 'unknown'
    throw error
  }
  const nodes = ast.children.toArray()
  if (nodes.length !== 1)
    return 'unknown'
  const node = nodes[0]!
  const lexer = getLexer('')
  if (node.type === 'Number') {
    // Unitless zero is also a length, so the request has no unique type.
    if (Number(node.value) === 0)
      return 'unknown'
    return lexer.matchType('integer', source).matched ? 'integer' : 'number'
  }
  const candidates: readonly VanityCssDataType[] = node.type === 'Dimension'
    ? ['length', 'angle', 'time', 'frequency', 'resolution', 'flex']
    : node.type === 'Percentage'
      ? ['percentage']
      : node.type === 'String'
        ? ['string']
        : node.type === 'Hash'
          ? ['color']
          : node.type === 'Function' && !['var', 'env', 'calc', 'min', 'max', 'clamp'].includes(node.name.toLowerCase())
            ? ['color', 'image', 'easing-function', 'transform-function']
            : []
  const matches = candidates.filter(type => lexer.matchType(type, ast).matched)
  return matches.length === 1 ? matches[0]! : 'unknown'
}

/** The same generated component and type vocabulary feeds compatibility and restrictions. */
export function getDeclarationPropertyData(property: string) {
  return grammar.propertyData[property]
}

/** Shorthands include their longhands and the platform's logical property group. */
export function isDeclarationPropertyAllowed(property: string, allowed: string): boolean {
  if (property === allowed)
    return true
  const definition = grammar.properties[allowed]
  if (!definition)
    return false
  const longhands = grammar.properties[property]?.longhands ?? []
  if (longhands.length && longhands.every(longhand => isDeclarationPropertyAllowed(longhand, allowed)))
    return true
  return definition.longhands.some(longhand => isDeclarationPropertyAllowed(property, longhand))
    || (definition.logicalPropertyGroup !== null && definition.logicalPropertyGroup === grammar.properties[property]?.logicalPropertyGroup)
}

/** Priority belongs to the declaration, outside its property-value grammar. */
export function parseDeclarationValue(source: string): { source: string, ast: Value, important: boolean } {
  let important = false
  if (source.includes('!')) {
    const declaration = parse(`x:${source}`, { context: 'declaration', positions: true }) as Declaration
    important = Boolean(declaration.important)
    if (declaration.value.type === 'Value')
      source = source.slice(declaration.value.loc!.start.offset - 2, declaration.value.loc!.end.offset - 2)
  }
  return { source, ast: parse(source, { context: 'value', positions: true }) as Value, important }
}

/** Authored references use the validator's arithmetic kernel and unit vocabulary. */
export function inspectDeclarationMath(property: string, ast: Value, source: string, references: ReadonlyMap<string, string>) {
  return getMathSubstitutions(ast, source, getLexer(property).units, references)
}

/** Attribute a resolved component or a reference inside it through the complete grammar. */
export function getDeclarationComponent(property: string, source: string, range: { start: number, end: number }): { component: string, types: string[], bounded: boolean } | undefined {
  const ast = parse(source, { context: 'value', positions: true }) as Value
  let node = ast.children.toArray().find(node => node.loc!.start.offset === range.start)
  walk(ast, (child) => {
    if (child.type !== 'Value' && child.loc?.start.offset === range.start && child.loc.end.offset === range.end)
      node = child
  })
  if (!node)
    return undefined
  const matched = getLexer(property).matchProperty(property, ast)
  if (!matched.matched)
    return undefined
  const trace = (matched.getTrace(node) ?? []) as unknown as GrammarTrace[]
  const types = trace.filter(entry => entry.type === 'Type').map(entry => entry.name!)
  let component = property
  for (const entry of trace) {
    if (entry.type !== 'Type' && entry.type !== 'Property')
      continue
    const candidates = getDeclarationPropertyData(property)?.components.filter(name => getDeclarationPropertyData(name)?.slotReferences.includes(`${entry.type}:${entry.name}`)) ?? []
    if (candidates.length === 1) {
      component = candidates[0]!
      break
    }
  }
  if (component === property) {
    const fragment = source.slice(range.start, range.end)
    const candidates = getDeclarationPropertyData(property)?.components.filter(name => getLexer(name).matchProperty(name, fragment).matched) ?? []
    if (candidates.length === 1)
      component = candidates[0]!
  }
  return { component, types, bounded: trace.some(entry => entry.opts && (entry.opts.min !== null || entry.opts.max !== null)) }
}

function getLexer(property: string): PropertyLexer {
  const scoped = Object.fromEntries([...definitions].flatMap(([name, entries]) => {
    const entry = entries.find(entry => entry.for.includes(property))
    return entry ? [[name, entry.syntax]] : []
  }))
  const key = JSON.stringify(scoped)
  if (!lexers.has(key))
    lexers.set(key, createLexer({ properties, types: { ...types, ...scoped }, generic: true }))
  return lexers.get(key)! as PropertyLexer
}

function hasMissingGrammar(property: string, lexer: Lexer, ast: Value): boolean {
  const functions = new Set<string>()
  walk(ast, (node) => {
    if (node.type === 'Function')
      functions.add(node.name.toLowerCase())
    if (node.type === 'Url')
      functions.add('url')
  })
  const cacheKey = `${property}\0${[...functions].sort().join(',')}`
  if (incompleteGrammars.has(cacheKey))
    return incompleteGrammars.get(cacheKey)!
  const seen = new Set<string>()
  let missing = false
  const visit = (kind: string, name: string): void => {
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

type GrammarResult = { status: 'accepted' } | { status: 'rejected' | 'unresolved', reason: string }

/** Generated ranges and dimensions supplement the native parser, never its unresolved verdicts. */
export function inspectDeclarationGrammar(property: string, value: string, unparsed: boolean, constraintsOnly = false): GrammarResult {
  const gap = grammar.gaps.native[property] ?? grammar.gaps.agreement[property]?.reason
  if (gap)
    return { status: 'unresolved', reason: gap }
  if (!properties[property])
    return { status: 'unresolved', reason: 'No property grammar' }
  let ast: Value
  try {
    const parsed = parseDeclarationValue(value)
    ast = parsed.ast
    value = parsed.source
  }
  catch (error) {
    if (error instanceof Error && error.name === 'SyntaxError')
      return { status: 'rejected', reason: error.message }
    throw error
  }
  if (value.includes('var(') || value.includes('env('))
    return { status: 'unresolved', reason: 'External substitution' }
  if (constraintsOnly && !ast.children.some(node => ['Number', 'Dimension', 'Percentage'].includes(node.type)
    || (node.type === 'Function' && ['calc', 'min', 'max', 'clamp'].includes(node.name.toLowerCase())))) {
    return { status: 'unresolved', reason: 'Non-numeric grammar remains with the native parser' }
  }
  const lexer = getLexer(property)
  if (hasMissingGrammar(property, lexer, ast))
    return { status: 'unresolved', reason: 'Property grammar references missing definitions' }
  const math = getMathSubstitutions(ast, value, lexer.units)
  if (math.status !== 'accepted')
    return math
  const match = lexer.matchProperty(property, ast)
  if (match.error?.name === 'SyntaxReferenceError')
    return { status: 'unresolved', reason: match.error.message }
  const valid = math.values.every(source => lexer.matchProperty(property, source).matched)
  if (valid) {
    for (const node of ast.children) {
      if (node.type !== 'Number' && node.type !== 'Dimension' && node.type !== 'Percentage')
        continue
      for (const entry of (match.getTrace(node) ?? []) as unknown as GrammarTrace[]) {
        if (entry.type !== 'Type' || !entry.opts)
          continue
        for (const [edge, bound] of [['min', entry.opts.min], ['max', entry.opts.max]] as const) {
          if (typeof bound !== 'string')
            continue
          const parsed = bound.match(/^([+-]?(?:\d*\.)?\d+)([a-z%]+)$/i)
          if (!parsed)
            return { status: 'unresolved', reason: `Unestablished grammar bound ${bound}` }
          const numeric = Number(parsed[1])
          if (numeric !== 0 && (node.type !== 'Dimension' || parsed[2]!.toLowerCase() !== node.unit.toLowerCase()))
            return { status: 'unresolved', reason: `Grammar bound needs unit conversion: ${bound}` }
          if ((edge === 'min' && Number(node.value) < numeric) || (edge === 'max' && Number(node.value) > numeric))
            return { status: 'rejected', reason: `Outside grammar range ${edge} ${bound}` }
        }
      }
    }
  }
  if (!valid && unparsed && /[a-z-]+\(/i.test(value) && !/\b(?:calc|min|max|clamp)\(/i.test(value))
    return { status: 'unresolved', reason: 'Function grammar not established' }
  return valid ? { status: 'accepted' } : { status: 'rejected', reason: match.error?.message.split('\n')[0] ?? 'Value does not match the property grammar' }
}
