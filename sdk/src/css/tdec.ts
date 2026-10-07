import type { VanityDiagnosticInput } from '../diagnostics'
import type { NodeResult, PlannedTokenEmission, TokenGraph, TokenNode, VanityLeafDefinition } from '../tokens/module'
import type { VanityTokenDeclarations } from './types'
import { Buffer } from 'node:buffer'
import { transform } from 'lightningcss'
import { VanityError } from '../diagnostics'
import { isPort } from '../ports/port'
import { isColorValue, isContrastValue } from '../tokens/color'
import { hasBrowserReactiveSyntax } from '../tokens/expressions'
import { isHandle } from '../tokens/handle'
import { getNodeDependencyPaths, planTokenEmission } from '../tokens/module'
import { resolveTokenSubstitutions, resolveTokenSubstitutionsByContext } from '../tokens/resolve'
import { createInputNode, ExpressionValue } from '../values/protocol'
import { isCssValue } from '../values/types'
import { requireStyleModuleFile } from './context'
import { serializeStyleValue } from './values'

export const VANITY_DEFERRED_TDEC = Symbol.for('vanity.deferredTdec')

export interface VanityDeferredTokenDeclarations {
  readonly [VANITY_DEFERRED_TDEC]: object
}

/**
 * Build a custom-property declaration fragment from a token-shaped tree.
 * Registered non-inheriting properties are intentionally excluded because
 * descendant declaration fragments cannot override their semantics.
 */
export function createTokenDeclarations<T extends object>(
  tokens: T,
  input: VanityTokenDeclarations<T>,
): Record<`--${string}`, string | number> {
  const file = requireStyleModuleFile('tdec')
  const declarations: Record<string, string | number> = {}
  walk(tokens, input as object, [], file, (leaf) => {
    declarations[leaf.name] = leaf.serialized
  })
  return declarations
}

/**
 * Produce a scoped declaration fragment, re-resolve every build-folded
 * dependent through the finalized token graph, and repeat every live
 * dependent so the browser substitutes it inside the subtree. This remains
 * inert data: the caller chooses whether it belongs in a class, rule, layer,
 * or condition.
 */
export function createPropagatedTokenDeclarations<T extends object>(
  tokens: T,
  graph: TokenGraph,
  input: VanityTokenDeclarations<T>,
): Record<`--${string}`, string | number> {
  const file = requireStyleModuleFile('tdec.propagated')
  const declarations: Record<string, string | number> = {}
  const substitutions = new Map<string, VanityLeafDefinition>()

  walk(tokens, input as object, [], file, (leaf) => {
    declarations[leaf.name] = leaf.serialized
    substitutions.set(leaf.path, classifySubstitutionValue(leaf.value, leaf.path))
  })

  if (substitutions.size === 0)
    return declarations
  const resolved = resolveTokenSubstitutions(graph, substitutions, 'tdec.propagated')
  const contextResolutions = resolveTokenSubstitutionsByContext(graph, substitutions, getFoldedContexts(graph, substitutions))
  const diagnostics = dedupeDiagnostics([...resolved.diagnostics, ...contextResolutions.diagnostics])
  if (diagnostics.length > 0)
    throw new VanityError(diagnostics)

  const nodesByName = new Map([...graph.nodes.values()].map(node => [node.name, node]))
  const affected = new Set<string>(resolved.declarations.keys())
  for (const resolution of contextResolutions.resolutions) {
    for (const name of resolution.substitutionChanges)
      affected.add(name)
  }

  for (const name of affected) {
    const node = nodesByName.get(name)!
    if (substitutions.has(node.key) || !node.contract.emit)
      continue
    const baseline = graph.results.get(node.key)!
    if (!isFoldedDependent(node, baseline))
      continue
    const value = resolved.declarations.get(name as `--${string}`) ?? baseline.emitted
    assertScopedDependent(node, planTokenEmission(node, graph), file)
    for (const resolution of contextResolutions.resolutions) {
      if (resolution.results.get(node.key)!.emitted === value)
        continue
      const entries = Object.entries(resolution.when)
      const where = entries.length === 1
        ? `across the '${entries[0]![0]}' axis`
        : `in the case or axis combination ${entries.map(([axis, mode]) => `${axis} '${mode}'`).join(' + ')}`
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_OVERRIDE',
        message: `tdec.propagated cannot scope '${node.key.split('.').at(-1)}': its folded value differs ${where}, so one declaration cannot be correct in every mode`,
        path: node.key,
        file,
        fix: 'name this dependent in the same tdec.propagated call to choose its scoped value, or express the variation as an axis',
      })
    }
    declarations[name] = value
  }

  for (const [name, value] of resolved.declarations) {
    const node = nodesByName.get(name)!
    if (!substitutions.has(node.key)) {
      if (!node.contract.emit)
        continue
      assertScopedDependent(node, planTokenEmission(node, graph), file)
    }
    declarations[name] = value
  }

  for (const [name, value] of collectLiveDependents(graph, substitutions, new Set(Object.keys(declarations)), file))
    declarations[name] = value

  return declarations
}

/** Enumerate products only for axes upstream of an affected folded dependent. */
function getFoldedContexts(graph: TokenGraph, substitutions: ReadonlyMap<string, VanityLeafDefinition>): readonly Readonly<Record<string, string>>[] {
  const contexts = new Map<string, Readonly<Record<string, string>>>()
  for (const node of graph.nodes.values()) {
    if (!node.contract.emit || substitutions.has(node.key) || !isFoldedDependent(node, graph.results.get(node.key)!))
      continue
    const axes = new Set<string>()
    const visited = new Set<string>()
    let affected = false
    const visit = (key: string): void => {
      if (visited.has(key))
        return
      visited.add(key)
      const current = graph.nodes.get(key)
      if (!current)
        return
      const substitution = substitutions.get(key)
      affected ||= substitution !== undefined
      const source = substitution === undefined ? current : { ...current, definition: substitution, branches: [] }
      for (const branch of source.branches) {
        for (const axis of branch.kind === 'axis' ? [branch.axis] : Object.keys(branch.when))
          axes.add(axis)
      }
      for (const dependency of getNodeDependencyPaths(source))
        visit(dependency)
    }
    visit(node.key)
    if (!affected)
      continue
    let combinations: Readonly<Record<string, string>>[] = [{}]
    for (const axis of graph.axes?.order ?? []) {
      if (!axes.has(axis))
        continue
      for (const mode of graph.axes!.definitions[axis]!.modeOrder) {
        const when = { [axis]: mode }
        contexts.set(JSON.stringify(when), when)
      }
      combinations = combinations.flatMap(when => graph.axes!.definitions[axis]!.modeOrder.map((mode: string) => ({ ...when, [axis]: mode })))
    }
    for (const when of combinations) {
      if (Object.keys(when).length > 0)
        contexts.set(JSON.stringify(when), when)
    }
  }
  return [...contexts.values()]
}

function assertScopedDependent(node: TokenNode, plan: PlannedTokenEmission, file: string): void {
  const reason = node.contract.canonical && node.contract.mutable
    ? 'it is runtime-mutable, and a subtree declaration would mask its runtime value'
    : plan.registration?.inherits === false
      ? 'it is registered with inherits: false and cannot propagate through a subtree'
      : undefined
  if (reason !== undefined) {
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_OVERRIDE',
      message: `tdec.propagated cannot scope '${node.key.split('.').at(-1)}': ${reason}`,
      path: node.key,
      file,
      fix: plan.registration?.inherits === false
        ? 'register this dependent with inheritance enabled, or set it directly on each consuming element'
        : 'name this token in the same tdec.propagated call to choose its scoped value',
    })
  }
}

/**
 * `var()` substitutes on the element that declares a custom property, and
 * descendants inherit the substituted result. A live dependent declared at
 * the token root therefore keeps the root's value inside the subtree unless
 * its expression is declared again there. Re-declare every emitted token
 * whose root declaration reads a property this fragment changes, until no
 * further dependent is reached.
 */
function collectLiveDependents(
  graph: TokenGraph,
  substitutions: ReadonlyMap<string, VanityLeafDefinition>,
  changed: Set<string>,
  file: string,
): Map<`--${string}`, string> {
  const declarations = new Map<`--${string}`, string>()
  const candidates = getLiveCandidates(graph).filter(({ node }) =>
    !substitutions.has(node.key) && !changed.has(node.name))

  let grew = true
  while (grew) {
    grew = false
    for (const { node, plan, reads } of candidates) {
      if (changed.has(node.name) || ![...reads].some(name => changed.has(name)))
        continue
      declarations.set(node.name as `--${string}`, assertUnconditionalDeclaration(node, plan, file))
      changed.add(node.name)
      grew = true
    }
  }

  return declarations
}

interface LiveCandidate {
  readonly node: TokenNode
  readonly plan: PlannedTokenEmission
  /** Custom properties the token's root declarations read through `var()`. */
  readonly reads: ReadonlySet<string>
}

const LIVE_CANDIDATES = new WeakMap<TokenGraph, readonly LiveCandidate[]>()

/** Plan each emitted token that can read another property once per finalized graph. */
function getLiveCandidates(graph: TokenGraph): readonly LiveCandidate[] {
  const cached = LIVE_CANDIDATES.get(graph)
  if (cached)
    return cached

  const candidates: LiveCandidate[] = []
  for (const node of graph.nodes.values()) {
    const result = graph.results.get(node.key)
    if (!node.contract.emit
      || result === undefined) {
      continue
    }
    const plan = planTokenEmission(node, graph)
    const texts = [
      ...Object.values(plan.baseVars),
      ...plan.axisDeclarations.map(entry => entry.value),
      ...plan.caseDeclarations.map(entry => entry.value),
    ]
    const reads = new Set<string>()
    transform({
      filename: 'token-dependencies.css',
      code: Buffer.from(texts.map((text, index) => `.token { --value-${index}: ${text}; }`).join('\n')),
      visitor: { Variable: (variable) => { reads.add(variable.name.ident) } },
    })
    if (reads.size > 0)
      candidates.push({ node, plan, reads })
  }
  LIVE_CANDIDATES.set(graph, candidates)
  return candidates
}

/** Return the one declaration that reproduces the root's value in every state. */
function assertUnconditionalDeclaration(node: TokenNode, plan: PlannedTokenEmission, file: string): string {
  const shortName = node.key.split('.').at(-1) ?? node.key
  const refuse: (reason: string, fix: string) => never = (reason, fix) => {
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_OVERRIDE',
      message: `tdec.propagated cannot scope '${shortName}': ${reason}`,
      path: node.key,
      file,
      fix,
    })
  }
  const nameIt = 'name this token in the same tdec.propagated call to choose its scoped value'

  assertScopedDependent(node, plan, file)

  const base = plan.baseVars[node.name]
  if (base === undefined)
    refuse('it has no unconditional declaration to repeat in the subtree', nameIt)

  // An element-local `light-dark()` base already selects the scheme arm on the
  // element that uses it, so repeating it stays correct in every scheme mode,
  // including a case arm that only restates that mode's scheme value.
  const native = plan.native?.locality === 'element' ? plan.native.axis : undefined
  const nativeValues = new Map(plan.axisDeclarations
    .filter(entry => entry.axis === native)
    .map(entry => [entry.mode, entry.value]))

  for (const entry of [...plan.axisDeclarations, ...plan.caseDeclarations]) {
    if (entry.value === base || (native !== undefined && entry.axis === native))
      continue
    if (native !== undefined && entry.when?.[native] !== undefined && nativeValues.get(entry.when[native]) === entry.value)
      continue
    const where = entry.when === undefined
      ? `across the '${entry.axis}' axis`
      : `in the case ${Object.entries(entry.when).map(([axis, mode]) => `${axis} '${mode}'`).join(' + ')}`
    refuse(
      `its live expression differs ${where}, so one declaration cannot be correct in every mode`,
      nameIt,
    )
  }

  return base
}

function isFoldedDependent(node: TokenNode, result: NodeResult): boolean {
  if (node.definition.kind === 'contrast')
    return !hasBrowserReactiveSyntax(result.emitted)

  return !result.traits.cssLive && !result.traits.volatile && !result.traits.conditional
}

function dedupeDiagnostics<T extends VanityDiagnosticInput>(diagnostics: readonly T[]): T[] {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const diagnostic of diagnostics) {
    const key = JSON.stringify([
      diagnostic.code,
      diagnostic.message,
      diagnostic.path,
      diagnostic.file,
    ])
    if (seen.has(key))
      continue
    seen.add(key)
    unique.push(diagnostic)
  }
  return unique
}

/**
 * Keep open-system declaration data independent from the temporary preview
 * prefix. The locked rule compiler resolves this token-shaped payload against
 * the final graph when the utility is used in a style module.
 */
export function createDeferredTokenDeclarations<T extends object>(
  tokens: T,
  input: VanityTokenDeclarations<T>,
): VanityDeferredTokenDeclarations {
  validate(tokens, input as object, [])
  return Object.freeze(Object.defineProperty({}, VANITY_DEFERRED_TDEC, {
    enumerable: true,
    value: input,
  })) as VanityDeferredTokenDeclarations
}

export function resolveDeferredTokenDeclarationInput(value: object): object | undefined {
  return VANITY_DEFERRED_TDEC in value
    ? (value as VanityDeferredTokenDeclarations)[VANITY_DEFERRED_TDEC]
    : undefined
}

interface TokenDeclarationLeaf {
  readonly path: string
  readonly name: `--${string}`
  readonly value: unknown
  readonly serialized: string | number
}

function walk(
  tokens: object,
  input: object,
  path: string[],
  file: string,
  onLeaf: (leaf: TokenDeclarationLeaf) => void,
): void {
  for (const [name, value] of Object.entries(input)) {
    if (value === undefined)
      continue

    const next = [...path, name]
    const token = (tokens as Record<string, unknown>)[name]
    if (token === undefined) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_OVERRIDE',
        message: `${next.join('.')} is not a token in this system`,
        path: next.join('.'),
        file,
      })
    }

    if (isHandle(token)) {
      const registration = (token as any).$register
      if (registration && typeof registration === 'object' && registration.inherits === false) {
        throw new VanityError({
          code: 'VANITY_TOKENS_INVALID_OVERRIDE',
          message: `${next.join('.')} is registered with inherits: false and cannot participate in a descendant declaration fragment`,
          path: next.join('.'),
          file,
          fix: 'set this token at its registered owner, or register it with inheritance enabled',
        })
      }
      onLeaf({
        path: (token as any).$path,
        name: (token as any).$name,
        value,
        serialized: serializeStyleValue(value, next.join('.'), { file }),
      })
      continue
    }

    if (!isPlainObject(value) || !isPlainObject(token)) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_OVERRIDE',
        message: `${next.join('.')} is a token group — declare its tokens individually`,
        path: next.join('.'),
        file,
      })
    }
    walk(token, value, next, file, onLeaf)
  }
}

function classifySubstitutionValue(value: unknown, path: string): VanityLeafDefinition {
  if (isHandle(value)) {
    if (value.$type === 'color')
      return { kind: 'color', expr: { kind: 'ref', handle: value } }
    return { kind: 'value', value: new ExpressionValue(createInputNode(value)) }
  }

  if (isContrastValue(value))
    return { kind: 'contrast', expr: value.expr }

  if (isColorValue(value))
    return { kind: 'color', expr: value.expr }

  if (typeof value === 'string' || typeof value === 'number')
    return { kind: 'literal', value }

  if (isPort(value))
    return { kind: 'literal', value: value.var }

  if (isCssValue(value))
    return { kind: 'value', value }

  // `walk` has already applied tdec's serializer and should have rejected
  // this branch. Keep the invariant explicit if that serializer grows new
  // accepted values without a corresponding graph definition.
  throw new VanityError({
    code: 'VANITY_TOKENS_INVALID_OVERRIDE',
    message: `${path} is not a resolvable token substitution`,
    path,
  })
}

function validate(tokens: object, input: object, path: string[]): void {
  for (const [name, value] of Object.entries(input)) {
    if (value === undefined)
      continue

    const next = [...path, name]
    const token = (tokens as Record<string, unknown>)[name]
    if (token === undefined) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_OVERRIDE',
        message: `${next.join('.')} is not a token in this system`,
        path: next.join('.'),
      })
    }

    if (isHandle(token)) {
      const registration = (token as any).$register
      if (registration && typeof registration === 'object' && registration.inherits === false) {
        throw new VanityError({
          code: 'VANITY_TOKENS_INVALID_OVERRIDE',
          message: `${next.join('.')} is registered with inherits: false and cannot participate in a descendant declaration fragment`,
          path: next.join('.'),
          fix: 'set this token at its registered owner, or register it with inheritance enabled',
        })
      }
      continue
    }

    if (!isPlainObject(value) || !isPlainObject(token)) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_OVERRIDE',
        message: `${next.join('.')} is a token group — declare its tokens individually`,
        path: next.join('.'),
      })
    }
    validate(token, value, next)
  }
}

function isPlainObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
