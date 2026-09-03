import type { TokenGraph } from '../tokens/module'
import type { VanityTokenHandleAny } from '../tokens/types'
import type { VanityTokenRecord } from './records'
import type {
  VanityIntrospectedToken,
  VanitySemanticEntry,
  VanitySystemMapV2,
} from './system'
import { getTokenInspection } from '../tokens/module'
import { VANITY_EXPLAINABLE } from './semantic'

export { formatExplanation, VANITY_EXPLAINABLE } from './semantic'

export type VanityExplanation
  = VanitySystemMapV2
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
  map: VanitySystemMapV2,
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

  throw new TypeError('[vanity] explain() needs a public token, axis, condition, recipe, anatomy, port, or semantic path')
}

function getSemanticEntries(map: VanitySystemMapV2): VanitySemanticEntry[] {
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

export interface VanityTokenExplanation {
  readonly path: readonly string[]
  readonly source?: { readonly file?: string, readonly line?: number, readonly column?: number }
  readonly name?: `--${string}`
  readonly type: VanityTokenRecord['semantic']['type']
  readonly expression: VanityTokenRecord['semantic']['expression']
  readonly dependencies: VanityTokenRecord['semantic']['dependencies']
  readonly reference: 'val' | 'var'
  readonly emit: boolean
  readonly mutable: boolean
  readonly hasDefault: boolean
  readonly inference: VanityTokenRecord['semantic']['inference']
  readonly fold: VanityTokenRecord['semantic']['fold']
  readonly preview:
    | { readonly status: 'resolved', readonly val: string, readonly environment: Readonly<Record<string, string>> }
    | { readonly status: 'unavailable', readonly reason: string }
  readonly support: VanityTokenRecord['semantic']['support']
  readonly declarations: VanityTokenRecord['semantic']['declarations']
  readonly branches: VanityTokenRecord['semantic']['branches']
  readonly registration?: VanityTokenRecord['semantic']['registration']
  readonly runtime?: VanityTokenRecord['runtime']
  readonly portability: VanityTokenRecord['semantic']['portability']
  readonly metadata: Readonly<Record<string, unknown>>
  readonly description?: string
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
