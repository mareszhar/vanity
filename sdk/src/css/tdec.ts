import type { VanityDiagnosticInput } from '../diagnostics'
import type { NodeResult, TokenGraph, TokenNode, VanityLeafDefinition } from '../tokens/module'
import type { VanityTokenDeclarations } from './types'
import { VanityError } from '../diagnostics'
import { isPort } from '../ports/port'
import { isColorValue, isContrastValue } from '../tokens/color'
import { hasBrowserReactiveSyntax } from '../tokens/expressions'
import { isHandle } from '../tokens/handle'
import { resolveTokenSubstitutions, resolveTokenSubstitutionsByAxisMode } from '../tokens/resolve'
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
 * Produce a scoped declaration fragment and re-resolve every build-folded
 * dependent through the finalized token graph. This remains inert data: the
 * caller chooses whether it belongs in a class, rule, layer, or condition.
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

  const resolved = resolveTokenSubstitutions(graph, substitutions, 'tdec.propagated')
  const modeResolutions = resolveTokenSubstitutionsByAxisMode(
    graph,
    substitutions,
    (axis, mode) => `tdec.propagated axis "${axis}" mode "${mode}"`,
  )
  const diagnostics = dedupeDiagnostics([...resolved.diagnostics, ...modeResolutions.diagnostics])
  if (diagnostics.length > 0)
    throw new VanityError(diagnostics)

  const nodesByName = new Map([...graph.nodes.values()].map(node => [node.name, node]))
  const affected = new Set<string>()
  for (const resolution of modeResolutions.resolutions) {
    for (const name of resolution.substitutionChanges) {
      const node = nodesByName.get(name)
      const result = node === undefined ? undefined : graph.results.get(node.key)
      if (node !== undefined
        && result !== undefined
        && node.derived
        && !substitutions.has(node.key)
        && isFoldedDependent(node, result)) {
        affected.add(name)
      }
    }
  }

  for (const name of affected) {
    const node = nodesByName.get(name)!
    const baseline = graph.results.get(node.key)?.emitted

    for (const axis of graph.axes?.order ?? []) {
      const resolutions = modeResolutions.resolutions.filter(resolution => resolution.axis === axis)
      if (resolutions.length === 0)
        continue

      const values = new Set(resolutions.map(resolution =>
        resolution.declarations.get(name as `--${string}`) ?? baseline,
      ))
      if (values.size <= 1)
        continue

      const shortName = node.key.split('.').at(-1) ?? node.key
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_OVERRIDE',
        message: `tdec.propagated cannot scope '${shortName}': its folded value differs across the '${axis}' axis, so one declaration cannot be correct in every mode`,
        path: node.key,
        file,
        fix: 'scope the substitution inside a single mode, keep the derivation live so the browser recomputes it, or express the variation as an axis',
      })
    }
  }

  for (const [name, value] of resolved.declarations)
    declarations[name] = value

  return declarations
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
  if (isHandle(value))
    return { kind: 'color', expr: { kind: 'ref', handle: value } }

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
