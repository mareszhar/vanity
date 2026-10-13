import type { CssNode, Value } from 'css-tree'
import type { VanityDeclarationSource } from '../diagnostics'
import type { VanityEvidence } from '../evidence'
import type { VanityAxisDefinition } from '../system/axes'
import type { TokenGraph, TokenNode } from '../tokens/module'
import type { VanityCssDataType } from '../values/types'
import type { VanityDeclarationDerivation } from './derivations'
import type { VanityArm } from './rule'
import type { VanityValueContext } from './values'
import { generate, walk } from 'css-tree'
import { isUnsafeValue } from '../atoms/handle'
import { isPort } from '../ports/port'
import { getTokenContexts } from '../tokens/environments'
import { isHandle } from '../tokens/handle'
import { getTokenContextSubstitutions } from '../tokens/module'
import { resolveGraph } from '../tokens/resolve'
import { isVanityValue } from '../values/types'
import { createDeclarationEnvironmentFilter } from './declaration-environments'
import { inspectDeclarationDerivation } from './derivations'
import { getDeclarationComponent, getDeclarationPropertyData, inspectDeclarationGrammar, inspectDeclarationMath, parseDeclarationValue } from './grammar'
import { checkDeclaration, serializeDeclarationNumber } from './validation'
import { serializeStyleValue } from './values'

export interface VanityDeclarationComponent {
  component: string
  value: string
  origin: 'token' | 'derived' | 'port' | 'literal' | 'unsafe' | 'external'
  tokens: string[]
  dataType: VanityCssDataType
  evidence: VanityEvidence
  /** A proved mismatch, retained on the same record that policy and provenance consume. */
  incompatible?: { expected: string, reason: string }
  derivation?: VanityDeclarationDerivation
}

export interface VanityDeclarationRecord extends Partial<VanityDeclarationSource> {
  property: string
  value: string | number
  /** Syntax-normalized from the classifier's parsed value, including priority. */
  normalizedValue?: string
  path: string
  /** Authored keys, preserved before a dotted diagnostic path loses their boundaries. */
  conditionPath?: string[]
  /** Factory coordinates preceding CSS conditions, retained for baseline identity. */
  stylePath?: readonly string[]
  /** A property alias in the authored coordinates, not a CSS condition. */
  authoredKey?: string
  condition?: VanityArm
  components: VanityDeclarationComponent[]
  escape?: { reason: string }
  governed?: boolean
}

const representatives: Partial<Record<VanityCssDataType, readonly string[]>> = {
  'color': ['red'],
  'length': ['1px'],
  'percentage': ['1%'],
  'length-percentage': ['1px', '1%'],
  'number': ['1.5'],
  'integer': ['1'],
  'number-percentage': ['1.5', '1%'],
  'angle': ['1deg'],
  'time': ['1s'],
  'frequency': ['1Hz'],
  'resolution': ['1dppx'],
  'flex': ['1fr'],
  'image': ['url(example.png)'],
  'url': ['url(example.png)'],
  'position': ['left top'],
  'easing-function': ['ease'],
  'transform-function': ['rotate(1deg)'],
  'transform-list': ['rotate(1deg)'],
  'custom-ident': ['example'],
  'dashed-ident': ['--example'],
  'string': ['"example"'],
}
const namesByGraph = new WeakMap<TokenGraph, Map<string, TokenNode>>()
const resolutions = new WeakMap<TokenGraph, Map<string, ReturnType<typeof resolveGraph>>>()
interface DeclarationEnvironment {
  arm: VanityArm
  substitutions: ReadonlyMap<string, string>
}
const validators = new WeakMap<VanityDeclarationRecord, (environment: DeclarationEnvironment) => void>()

/** Resolve compatibility after the rule's emitted subtree declarations are known. */
export function resolveDeclarationValue(record: VanityDeclarationRecord, environment: DeclarationEnvironment): void {
  validators.get(record)?.(environment)
  record.condition = environment.arm
}

function getGraphNames(graph: TokenGraph | undefined): Map<string, TokenNode> {
  if (!graph)
    return new Map()
  let names = namesByGraph.get(graph)
  if (!names) {
    names = new Map([...graph.nodes.values()].map(node => [node.name, node]))
    namesByGraph.set(graph, names)
  }
  return names
}

function resolveContext(graph: TokenGraph, when: Record<string, string>) {
  let cached = resolutions.get(graph)
  if (!cached) {
    cached = new Map()
    resolutions.set(graph, cached)
  }
  const address = JSON.stringify(when)
  let resolved = cached.get(address)
  if (!resolved) {
    resolved = resolveGraph(graph, getTokenContextSubstitutions(graph, when))
    cached.set(address, resolved)
  }
  return resolved
}

/** One authored-value classification; its output is shared by all declaration consumers. */
export function classifyDeclarationValue(property: string, authored: unknown, path: string, ctx: VanityValueContext): VanityDeclarationRecord {
  const escape = isUnsafeValue(authored) ? authored : undefined
  if (escape)
    authored = escape.value
  // Inspect identity before serialization: val-reference handles remain tokens
  // when passed directly; their interpolated strings cannot carry that identity.
  const handle = isHandle(authored) ? authored : undefined
  const port = isPort(authored) ? authored : undefined
  const typed = isVanityValue(authored) ? authored : undefined
  const serialized = serializeStyleValue(escape ?? authored, path, ctx)
  let source = typeof serialized === 'number' ? serializeDeclarationNumber(property, serialized) : serialized
  const createUnresolvedDeclaration = (reason: string): VanityDeclarationRecord => ({ property, value: serialized, path, ...(escape ? { escape: { reason: escape.reason } } : {}), components: [{
    component: property,
    value: source,
    origin: escape ? 'unsafe' : 'literal',
    tokens: [],
    dataType: 'unknown',
    evidence: { level: 'unresolved', reason },
  }] })
  let ast: Value
  let normalizedValue: string
  try {
    const parsed = parseDeclarationValue(source)
    ast = parsed.ast
    source = parsed.source
    normalizedValue = generate(ast) + (parsed.important ? '!important' : '')
  }
  catch (error) {
    if (error instanceof Error && error.name === 'SyntaxError')
      return createUnresolvedDeclaration('Value syntax is checked by the declaration validator')
    throw error
  }
  const names = getGraphNames(ctx.tokenGraph)
  const syntaxParts: CssNode[] = handle || port || (typed && typed.type !== 'unknown' && typed.type !== 'declaration') ? [ast] : ast.children.toArray()
  const parts = syntaxParts.map((node) => {
    const references: Array<{ node: CssNode, name: string }> = []
    walk(node, (child) => {
      if (child.type === 'Function' && child.name.toLowerCase() === 'var') {
        const first = child.children.first
        if (first?.type === 'Identifier')
          references.push({ node: child, name: first.name })
        return walk.skip
      }
    })
    const tokenNodes = references.flatMap(reference => names.get(reference.name) ?? [])
    if (handle && !tokenNodes.some(node => node.key === handle.$path)) {
      const owned = ctx.tokenGraph?.nodes.get(handle.$path)
      if (owned)
        tokenNodes.push(owned)
    }
    const tokens = [...new Set(tokenNodes.map(node => node.key))]
    const external = references.some(reference => !names.has(reference.name) && reference.name !== port?.meta.name)
    const origin: VanityDeclarationComponent['origin'] = escape
      ? 'unsafe'
      : port
        ? 'port'
        : external
          ? 'external'
          : tokens.length && (typed || (node.type === 'Function' && node.name.toLowerCase() !== 'var')) ? 'derived' : tokens.length || handle ? 'token' : 'literal'
    const dataType = handle?.$type ?? port?.type ?? typed?.type
      ?? (node.type === 'Function' && node.name === 'var' && tokenNodes.length === 1 ? tokenNodes[0]!.handle.$type : undefined)
      ?? 'unknown'
    return { node, references, tokens, origin, dataType, unknownToken: tokenNodes.some(node => node.handle.$type === 'unknown') }
  })
  const createComponent = (part: typeof parts[number]): VanityDeclarationComponent => {
    const result: VanityDeclarationComponent = { component: property, value: generate(part.node), origin: part.origin, tokens: part.tokens, dataType: part.dataType, evidence: { level: 'unresolved', reason: 'Property component grammar not established' } }
    if (part.origin === 'derived') {
      result.derivation = inspectDeclarationDerivation(part.node, new Map(part.references.flatMap((reference) => {
        const token = names.get(reference.name)
        return token ? [[reference.name, token.key] as const] : []
      })))
      result.derivation.audit = ctx.policies?.declarations?.derivations === 'audit' || (ctx.policies?.declarations !== undefined && ctx.policies.declarations.derivations === undefined)
    }
    return result
  }
  if (property.startsWith('--')) {
    return {
      property,
      value: serialized,
      normalizedValue,
      path,
      ...(escape ? { escape: { reason: escape.reason } } : {}),
      components: parts.map(part => ({ ...createComponent(part), evidence: { level: 'unresolved', reason: 'Custom property grammar is declared by its owner' } })),
    }
  }
  const math = inspectDeclarationMath(property, ast, source, new Map(parts.flatMap(part => part.references.flatMap((reference) => {
    const type = names.get(reference.name)?.handle.$type
    return type === undefined ? [] : [[reference.name, type] as const]
  }))))
  if (math.status === 'accepted') {
    for (const part of parts) {
      if (part.dataType !== 'unknown' || part.unknownToken || part.node.type !== 'Function')
        continue
      const types = math.expressions.find(expression => expression.start === part.node.loc!.start.offset)?.types
      const type = types?.length === 1 ? types[0] : types?.includes('percentage') && types.length === 2 ? `${types.find(type => type !== 'percentage')}-percentage` : undefined
      if (type)
        part.dataType = type as VanityCssDataType
    }
  }
  const record: VanityDeclarationRecord = { property, value: serialized, normalizedValue, path, components: [] }
  if (escape)
    record.escape = { reason: escape.reason }
  validators.set(record, ({ arm, substitutions }) => {
    // A future grammar update can match a type inside a recorded platform-gap
    // family. That still cannot establish browser agreement for the family.
    const grammarUnresolved = getDeclarationPropertyData(property)?.unresolved !== undefined
    const getRepresentativeValue = (part: typeof parts[number], candidate?: string): string => {
      const value = candidate ?? representatives[part.dataType]?.[0]
      return value === undefined ? generate(part.node) : typed && /^\s*(?:calc|min|max|clamp)\(/i.test(generate(part.node)) ? `calc(${value})` : value
    }
    // Prove references at their own grammar positions before resolving defaults.
    // An unbounded color slot does not need a relative color's channels folded.
    const referenceFragments = parts.map((part) => {
      const render = (at?: number, candidate?: string) => {
        const start = part.node.loc!.start.offset
        let value = ''
        let cursor = start
        const ranges: Array<{ start: number, end: number }> = []
        for (const [index, reference] of part.references.entries()) {
          const type = names.get(reference.name)?.handle.$type
          const replacement = index === at ? candidate : type && representatives[type]?.[0]
          if (replacement === undefined)
            return undefined
          value += source.slice(cursor, reference.node.loc!.start.offset)
          ranges.push({ start: value.length, end: value.length + replacement.length })
          value += replacement
          cursor = reference.node.loc!.end.offset
        }
        value += source.slice(cursor, part.node.loc!.end.offset)
        return { value, ranges }
      }
      return { render, default: render() }
    })
    const representativeFragments = parts.map((part, index) => part.dataType === 'unknown' ? referenceFragments[index]!.default?.value ?? getRepresentativeValue(part) : getRepresentativeValue(part))
    const getComponentPosition = (fragments: readonly string[], index: number) => {
      const start = fragments.slice(0, index).reduce((sum, value) => sum + value.length + 1, 0)
      return getDeclarationComponent(property, fragments.join(' '), { start, end: start + fragments[index]!.length })
    }
    const replaceRepresentative = (index: number, replacement: string): string[] => {
      return representativeFragments.map((value, at) => at === index ? replacement : value)
    }
    const typeProofs = parts.map((part, index) => {
      if (grammarUnresolved || part.origin === 'external' || part.origin === 'literal' || part.references.some(reference => substitutions.has(reference.name)))
        return undefined
      const candidates = representatives[part.dataType]
      if (candidates) {
        const proofs = candidates.map(candidate => getComponentPosition(replaceRepresentative(index, getRepresentativeValue(part, candidate)), index))
        if (proofs.every(proof => proof && !proof.bounded && proof.types.includes(part.dataType)))
          return proofs[0]
      }
      if (!part.references.length || part.unknownToken || math.status === 'rejected')
        return undefined
      const referencesProved = part.references.every((reference, at) => {
        const type = names.get(reference.name)?.handle.$type
        return type && representatives[type]?.every((candidate) => {
          const rendered = referenceFragments[index]!.render(at, candidate)
          if (!rendered)
            return false
          const fragments = replaceRepresentative(index, rendered.value)
          const offset = fragments.slice(0, index).reduce((sum, value) => sum + value.length + 1, 0)
          const range = rendered.ranges[at]!
          const proof = getDeclarationComponent(property, fragments.join(' '), { start: offset + range.start, end: offset + range.end })
          return proof && !proof.bounded && proof.types.includes(type)
        })
      })
      if (!referencesProved)
        return undefined
      return getComponentPosition(representativeFragments, index)
    })
    const tokenPaths = [...new Set(parts.flatMap((part, index) => typeProofs[index] ? [] : part.tokens))]
    const contexts = getTokenContexts(ctx.tokenGraph, tokenPaths)
    const axes: Readonly<Record<string, VanityAxisDefinition>> = ctx.tokenGraph?.axes?.definitions ?? {}
    const acceptsEnvironment = createDeclarationEnvironmentFilter(arm, axes)
    const native = Object.entries(axes).find(([, definition]) => definition.native?.kind === 'scheme')
    const environments = contexts.flatMap(when => ['light', 'dark'].filter(scheme => !native || !when[native[0]] || when[native[0]] === native[1].native![scheme as 'light' | 'dark']).map(scheme => ({ when, scheme: scheme as 'light' | 'dark', name: [...new Set([...Object.entries(when).map(([axis, mode]) => `${axis}=${mode}`), `scheme=${scheme}`])].join(',') })))
      .filter(environment => acceptsEnvironment({ ...environment.when, ...(native ? { [native[0]]: native[1].native![environment.scheme] } : {}) }))
    const resolveReference = (name: string, when: Record<string, string>, seen = new Set<string>(), local = true): string | undefined => {
      if (seen.has(name))
        return undefined
      const token = names.get(name)
      const declaredLocally = local && substitutions.has(name)
      const emitted = declaredLocally ? substitutions.get(name) : token && ctx.tokenGraph ? resolveContext(ctx.tokenGraph, when).results.get(token.key)?.emitted : undefined
      if (emitted === undefined || emitted.trim() === '')
        return undefined
      seen = new Set([...seen, name])
      const { ast: value, source: declarationValue } = parseDeclarationValue(emitted)
      const references: Array<{ node: CssNode, name: string }> = []
      walk(value, (node) => {
        if (node.type === 'Function' && node.name.toLowerCase() === 'var') {
          const first = node.children.first
          if (first?.type === 'Identifier')
            references.push({ node, name: first.name })
        }
      })
      let source = declarationValue
      for (const reference of references.reverse()) {
        // An inherited custom property substitutes where it was declared.
        // Only declarations repeated here (including propagated dependents)
        // can read this subtree's overrides.
        const resolved = resolveReference(reference.name, when, seen, declaredLocally)
        if (resolved === undefined)
          return undefined
        source = source.slice(0, reference.node.loc!.start.offset) + resolved + source.slice(reference.node.loc!.end.offset)
      }
      return source
    }
    const resolveFragments = (when: Record<string, string>): Array<string | undefined> => parts.map((part, index) => {
      if (typeProofs[index])
        return representativeFragments[index]
      const start = part.node.loc!.start.offset
      let value = source.slice(start, part.node.loc!.end.offset)
      for (const reference of [...part.references].sort((left, right) => right.node.loc!.start.offset - left.node.loc!.start.offset)) {
        const token = names.get(reference.name)
        const replacement = token
          ? resolveReference(reference.name, when)
          : port && reference.name === port.meta.name ? String(port.defaultValue) : undefined
        if (replacement === undefined)
          return undefined
        value = value.slice(0, reference.node.loc!.start.offset - start) + replacement + value.slice(reference.node.loc!.end.offset - start)
      }
      if (handle && !part.references.length && ctx.tokenGraph)
        return resolveReference(handle.$name, when)
      return value
    })
    const resolved = environments.map((environment) => {
      const fragments = resolveFragments(environment.when)
      const complete = fragments.every((fragment): fragment is string => fragment !== undefined)
      return { ...environment, fragments, value: complete ? fragments.join(' ') : undefined }
    })
    const components = parts.map((part, index): VanityDeclarationComponent => {
      const result = createComponent(part)
      if (typeProofs[index]) {
        result.component = typeProofs[index]!.component
        if (result.dataType === 'unknown')
          result.dataType = typeProofs[index]!.types.find(type => representatives[type as VanityCssDataType]) as VanityCssDataType ?? 'unknown'
        result.evidence = { level: 'type' }
        return result
      }
      if (part.origin === 'external' || part.unknownToken) {
        result.evidence = { level: 'unresolved', reason: part.origin === 'external' ? 'External substitution' : 'Token has no declared data type' }
        return result
      }
      if (!grammarUnresolved && math.status === 'rejected' && part.tokens.length) {
        result.incompatible = { expected: result.component, reason: math.reason }
        return result
      }
      const baseline = resolved.find(environment => environment.value !== undefined)?.fragments as string[] | undefined ?? representativeFragments
      const replace = (replacement: string): string[] => baseline.map((value, at) => at === index ? getRepresentativeValue(part, replacement) : value)
      let position = getComponentPosition(baseline, index)
      if (!position) {
        for (const candidates of Object.values(representatives)) {
          if (!candidates)
            continue
          position = getComponentPosition(replace(candidates[0]!), index)
          if (position)
            break
        }
      }
      if (position)
        result.component = position.component
      if (part.dataType === 'unknown' && position) {
        result.dataType = (part.origin === 'literal' || part.origin === 'unsafe' ? position.types.findLast(type => representatives[type as VanityCssDataType]) : position.types.find(type => representatives[type as VanityCssDataType])) as VanityCssDataType ?? 'unknown'
      }
      const candidates = representatives[part.dataType]
      if (!grammarUnresolved && position && candidates && part.origin !== 'literal') {
        const checks = candidates.map(candidate => getComponentPosition(replace(candidate), index))
        if (checks.every(check => check === undefined)) {
          result.incompatible = { expected: result.component, reason: `<${part.dataType}> does not fit ${result.component}` }
          return result
        }
        if (checks.every(check => check !== undefined && !check.bounded && check.types.includes(part.dataType))) {
          result.evidence = { level: 'type' }
          return result
        }
      }
      const checks = resolved.map((environment) => {
        const value = environment.value
        const native = value === undefined ? undefined : checkDeclaration(property, value)
        const verdict = value === undefined
          ? undefined
          : native?.kind === 'invalid-value'
            ? { status: 'rejected' as const, reason: native.reason }
            : inspectDeclarationGrammar(property, value, false)
        return { ...environment, verdict }
      })
      const rejected = checks.find(check => check.verdict?.status === 'rejected')
      if (rejected?.verdict?.status === 'rejected' && part.tokens.length)
        result.incompatible = { expected: result.component, reason: `${rejected.name}: ${rejected.verdict.reason}` }
      result.evidence = checks.length && checks.every(check => check.verdict?.status === 'accepted')
        ? { level: 'environments', environments: checks.map(check => check.name) }
        : { level: 'unresolved', reason: !checks.length ? 'Condition has no established reachable environment' : checks.some(check => check.value === undefined) ? 'No authored default for a referenced value' : checks.find(check => check.verdict?.status !== 'accepted')?.verdict?.status === 'unresolved' ? 'Property grammar is unresolved' : 'Declaration does not match the grammar' }
      return result
    })
    record.components = components
  })
  return record
}
