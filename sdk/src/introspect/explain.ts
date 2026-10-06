import type { TokenGraph } from '../tokens/module'
import type { VanityTokenHandleAny } from '../tokens/types'
import type { VanityTokenRecord } from './records'
import type {
  VanityIntrospectedToken,
  VanitySemanticEntry,
  VanitySystemMap,
} from './system'
import { VanityError } from '../diagnostics'
import { getTokenInspection } from '../tokens/module'
import { VANITY_EXPLAINABLE } from './semantic'

export { formatExplanation, VANITY_EXPLAINABLE } from './semantic'

export type VanityExplanation
  = VanitySystemMap
    | VanitySemanticEntry
    | Readonly<Record<string, unknown>>

/** Preserve the useful semantic shape when the subject already carries one. */
export type VanityExplanationFor<Subject>
  = Subject extends VanityTokenHandleAny
    ? VanityIntrospectedToken
    : Subject extends VanitySemanticEntry
      ? Subject
      : VanityExplanation

/** Resolve any public semantic handle or semantic path against one system map. */
export function explainFromSystem<Subject>(
  map: VanitySystemMap,
  subject: Subject,
): VanityExplanationFor<Subject> {
  if (subject === map || subject === map.id)
    return map as VanityExplanationFor<Subject>

  if ((typeof subject === 'object' || typeof subject === 'function') && subject !== null) {
    const explainableValue = (subject as Record<symbol, unknown>)[VANITY_EXPLAINABLE]
    if (explainableValue && typeof explainableValue === 'object')
      return explainableValue as VanityExplanationFor<Subject>
    const path = (subject as { readonly $path?: unknown }).$path
    if (typeof path === 'string' && map.tokens[path])
      return map.tokens[path] as VanityExplanationFor<Subject>
    const id = (subject as { readonly id?: unknown }).id
    if (typeof id === 'string') {
      const found = getSemanticEntries(map).find(entry => entry.id === id)
      if (found)
        return found as VanityExplanationFor<Subject>
    }
  }

  if (typeof subject === 'string') {
    const path = subject.replace(/^tokens?\./, '')
    if (map.tokens[path])
      return map.tokens[path] as VanityExplanationFor<Subject>
    const direct = getSemanticEntries(map).find(entry =>
      entry.id === subject
      || ('name' in entry && entry.name === subject)
      || (entry.kind === 'condition' && 'readable' in entry && entry.readable === subject))
    if (direct)
      return direct as VanityExplanationFor<Subject>
  }

  throw new VanityError({
    code: 'VANITY_TOKENS_UNKNOWN_REF',
    message: 'explain() needs a public token, axis, condition, recipe, anatomy, port, or semantic path',
    path: ['subject'],
    fix: 'pass a public Vanity handle or semantic path present in the system',
  })
}

function getSemanticEntries(map: VanitySystemMap): VanitySemanticEntry[] {
  return [
    map.capabilities,
    ...map.layers,
    ...Object.values(map.conditions),
    ...Object.values(map.axes),
    ...Object.values(map.roots),
    ...Object.values(map.tokens),
    ...Object.values(map.plugins),
    ...Object.values(map.extensions),
    ...Object.values(map.consts),
    ...Object.values(map.constructors),
    ...Object.values(map.utilities),
    ...map.overwrites,
    ...Object.values(map.audits),
  ]
}

/** Structured token provenance, resolved behavior and available build evidence. */
export interface VanityTokenExplanation {
  /** Authored token path as segments, independent of generated CSS names. */
  readonly path: readonly string[]
  /** Authored file and position when source metadata is available. */
  readonly source?: { readonly file?: string, readonly line?: number, readonly column?: number }
  /** Generated custom-property name when the token emits or uses a variable. */
  readonly name?: `--${string}`
  /** Resolved CSS data type used by declarations and runtime validation. */
  readonly type: VanityTokenRecord['semantic']['type']
  /** Canonical value expression retained for semantic inspection. */
  readonly expression: VanityTokenRecord['semantic']['expression']
  /** Token paths referenced by this expression. */
  readonly dependencies: VanityTokenRecord['semantic']['dependencies']
  /** Whether consumers reference a folded value or a CSS variable. */
  readonly reference: 'val' | 'var'
  /** Whether the system emits this token's custom-property declaration. */
  readonly emit: boolean
  /** Whether runtime overrides are permitted for this token. */
  readonly mutable: boolean
  /** Whether a base value exists; reservations can have branches without one. */
  readonly hasDefault: boolean
  /** How the resolved type was inferred, including inference limits. */
  readonly inference: VanityTokenRecord['semantic']['inference']
  /** Build-time folding outcome and the reason when folding is unavailable. */
  readonly fold: VanityTokenRecord['semantic']['fold']
  /** Resolved value in the declared default environment, or its unavailability reason. */
  readonly preview:
    | { readonly status: 'resolved', readonly val: string, readonly environment: Readonly<Record<string, string>> }
    | { readonly status: 'unavailable', readonly reason: string }
  /** Browser support requirements carried by the expression. */
  readonly support: VanityTokenRecord['semantic']['support']
  /** Emitted declaration contexts, including roots, layers, selectors and at-rules. */
  readonly declarations: VanityTokenRecord['semantic']['declarations']
  /** Authored and derived axis/case branches with their resolved behavior. */
  readonly branches: VanityTokenRecord['semantic']['branches']
  /** CSS property registration when the token declares one. */
  readonly registration?: VanityTokenRecord['semantic']['registration']
  /** Portable runtime contract when this token has runtime behavior. */
  readonly runtime?: VanityTokenRecord['runtime']
  /** Whether the expression can cross the build/runtime boundary and any restriction. */
  readonly portability: VanityTokenRecord['semantic']['portability']
  /** Authored application metadata preserved without interpretation. */
  readonly metadata: Readonly<Record<string, unknown>>
  /** Authored human-readable token documentation. */
  readonly description?: string
  /** Authored migration guidance for a deprecated token. */
  readonly deprecated?: string
}

/** One stable structured answer from authored decision to every CSS context. */
export function explainToken(graph: TokenGraph, handle: VanityTokenHandleAny): VanityTokenExplanation {
  const token = getTokenInspection(graph, handle as any)
  return Object.freeze({
    path: Object.freeze(token.path.split('.')),
    source: Object.freeze({
      ...(token.file === undefined ? {} : { file: token.file }),
      ...(token.line === undefined ? {} : { line: token.line }),
      ...(token.column === undefined ? {} : { column: token.column }),
    }),
    name: token.semantic.emit || token.semantic.reference === 'var' ? token.var as `--${string}` : undefined,
    type: token.semantic.type,
    expression: token.semantic.expression,
    dependencies: token.semantic.dependencies,
    reference: token.semantic.reference,
    emit: token.semantic.emit,
    mutable: token.semantic.mutable,
    hasDefault: token.semantic.hasDefault,
    inference: token.semantic.inference,
    fold: token.semantic.fold,
    preview: getExplanationPreview(token, graph),
    support: token.semantic.support,
    declarations: token.semantic.declarations,
    branches: token.semantic.branches,
    ...(token.semantic.registration === undefined ? {} : { registration: token.semantic.registration }),
    ...(token.runtime === undefined ? {} : { runtime: token.runtime }),
    portability: token.semantic.portability,
    metadata: token.semantic.metadata,
    ...(token.description === undefined ? {} : { description: token.description }),
    ...(token.deprecated === undefined ? {} : { deprecated: token.deprecated }),
  })
}

function getExplanationPreview(token: VanityTokenRecord, graph: TokenGraph): VanityTokenExplanation['preview'] {
  const environment = Object.freeze(Object.fromEntries((graph.axes?.order ?? []).flatMap((axis) => {
    const mode = graph.axes!.definitions[axis]!.defaultMode
    return mode === undefined ? [] : [[axis, mode]]
  })))
  let val: string | number | undefined = token.preview.status === 'available'
    ? (environment.scheme === 'dark' ? token.preview.dark : token.preview.light)
    : undefined
  for (const axis of graph.axes?.order ?? []) {
    const branch = token.semantic.branches.find(entry => entry.address.kind === 'axis'
      && entry.address.axis === axis && entry.address.mode === environment[axis])
    if (branch && branch.val !== null)
      val = branch.val
  }
  for (const branch of token.semantic.branches) {
    if (branch.address.kind === 'case'
      && Object.entries(branch.address.when).every(([axis, mode]) => environment[axis] === mode)
      && branch.val !== null) {
      val = branch.val
    }
  }
  if (val === undefined)
    return token.preview.status === 'unavailable' ? token.preview : { status: 'unavailable', reason: 'no value in the default environment' }
  if (String(val).includes('var('))
    return { status: 'unavailable', reason: 'the selected environment contains a runtime token/custom-property dependency' }
  return { status: 'resolved', val: String(val), environment }
}
