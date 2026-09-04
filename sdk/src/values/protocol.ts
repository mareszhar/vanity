/**
 * Shared CSS value IR. This file is the one privileged implementation layer;
 * public extensions construct values through `defineCssValue` and
 * `defineCssOperation`, never by subclassing these classes.
 */

import type { VanityResolvedPolicies } from './policies'
import type {
  VanityCssDataType,
  VanityCssInput,
  VanityCssValue,
  VanityResolution,
  VanitySelfValue,
  VanityValue,
} from './types'
import { throwValueError } from './error'
import { serializeCssText } from './serialize'
import { CssValue, isVanityValue } from './types'

const CONSTRUCTOR_USAGES = new WeakMap<object, ReadonlySet<string>>()

/** @internal */
export function markConstructorUsage<Value>(value: Value, name: string): Value {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    return value
  const object = value as object
  const current = CONSTRUCTOR_USAGES.get(object) ?? new Set<string>()
  CONSTRUCTOR_USAGES.set(object, new Set([...current, name]))
  const expr = (value as { readonly expr?: unknown }).expr
  if (expr && typeof expr === 'object') {
    const exprCurrent = CONSTRUCTOR_USAGES.get(expr) ?? new Set<string>()
    CONSTRUCTOR_USAGES.set(expr, new Set([...exprCurrent, name]))
  }
  return value
}

/** @internal */
export function getConstructorUsagesOfValue(value: unknown): ReadonlySet<string> {
  return (typeof value === 'object' || typeof value === 'function') && value !== null
    ? CONSTRUCTOR_USAGES.get(value) ?? new Set()
    : new Set()
}

/** Discriminator for the portable value-expression nodes used in introspection. */
export type VanityExpressionKind
  = | 'literal'
    | 'function'
    | 'operation'
    | 'var'
    | 'raw'
    | 'plugin'
    | 'composite'

export type VanityCssFeature
  = | 'calc-basic'
    | 'calc-typed-arithmetic'
    | 'color-level-4'
    | 'color-level-5'
    | 'color-mix'
    | 'custom-properties'
    | 'light-dark'
    | 'relative-color'
    | `plugin:${string}`

export interface VanitySource {
  readonly helper?: string
  readonly authored?: string
  readonly file?: string
  readonly line?: number
  readonly column?: number
  readonly parents?: readonly VanitySource[]
}

export interface VanityExtensionIdentity {
  readonly id: string
  readonly version: string | number
  readonly fingerprint?: string
}

export interface VanityReference {
  readonly kind: 'custom-property' | 'token' | 'plugin'
  readonly name?: `--${string}`
  readonly path?: string
  readonly type: VanityCssDataType
  readonly resolution: VanityResolution
  readonly extension?: VanityExtensionIdentity
}

/**
 * Named CSS capability set used for lowering and diagnostics.
 *
 * @example
 * `const support: VanityCssSupportTarget = VANITY_DEFAULT_CSS_SUPPORT`
 */
export interface VanityCssSupportTarget {
  readonly id: string
  readonly features: ReadonlySet<VanityCssFeature>
}

export interface VanitySerializeContext {
  readonly support: VanityCssSupportTarget
  /** Host policy book used only by adaptive portable values. */
  readonly policies: VanityResolvedPolicies
  serialize: (value: VanityValue | VanityCssInput) => string
  resolveReference: (reference: VanityReference) => string
  /**
   * Build-time projection used by graph-aware folders. When present, a
   * reference may be replaced by its authored representative instead of
   * serializing as `var()`. Ordinary serializers deliberately omit it.
   */
  resolveReferenceValue?: (reference: VanityReference) => string | undefined
}

export interface VanityFoldContext {
  readonly serialize: VanitySerializeContext
}

export type VanityFoldRefusal
  = | 'runtime-dependency'
    | 'raw-or-unknown'
    | 'plugin-without-fold-support'
    | 'platform-dependent'
    | 'color-or-gamut-semantics'
    | 'unsupported-arithmetic'
    | 'preserve-native-policy'

export type VanityFoldResult
  = { readonly kind: 'folded', readonly node: VanityExpressionNode }
    | { readonly kind: 'preserve', readonly reason: VanityFoldRefusal }

interface VanityNodeBase<Type extends VanityCssDataType = VanityCssDataType> {
  readonly kind: VanityExpressionKind
  readonly type: Type
  readonly resolution: VanityResolution
  readonly dependencies: readonly VanityReference[]
  readonly requirements: readonly VanityCssFeature[]
  readonly source?: VanitySource
  readonly extension?: VanityExtensionIdentity
  readonly fold?: (context: VanityFoldContext) => VanityFoldResult
  readonly fallback?: VanityExpressionNode
}

export interface VanityLiteralNode<Type extends VanityCssDataType = VanityCssDataType> extends VanityNodeBase<Type> {
  readonly kind: 'literal'
  readonly value: string | number
}

export interface VanityFunctionNode<Type extends VanityCssDataType = VanityCssDataType> extends VanityNodeBase<Type> {
  readonly kind: 'function'
  readonly name: string
  readonly values: readonly VanityExpressionNode[]
  readonly separator: ', ' | ' ' | ' / '
}

export interface VanityOperationNode<Type extends VanityCssDataType = VanityCssDataType> extends VanityNodeBase<Type> {
  readonly kind: 'operation'
  readonly operator: '+' | '-' | '*' | '/'
  readonly left: VanityExpressionNode
  readonly right: VanityExpressionNode
  readonly parenthesize: boolean
}

export interface VanityVarNode<Type extends VanityCssDataType = VanityCssDataType> extends VanityNodeBase<Type> {
  readonly kind: 'var'
  readonly reference: VanityReference
  readonly valueFallback?: VanityExpressionNode
}

export interface VanityRawNode<Type extends VanityCssDataType = VanityCssDataType> extends VanityNodeBase<Type> {
  readonly kind: 'raw'
  readonly syntax: string
}

export interface VanityPluginNode<Type extends VanityCssDataType = VanityCssDataType> extends VanityNodeBase<Type> {
  readonly kind: 'plugin'
  /** Child expressions retained for identity checks and provenance traversal. */
  readonly values: readonly VanityExpressionNode[]
  readonly serialize: (context: VanitySerializeContext) => string
}

export interface VanityCompositeNode<Type extends VanityCssDataType = VanityCssDataType> extends VanityNodeBase<Type> {
  readonly kind: 'composite'
  readonly parts: readonly (string | VanityExpressionNode)[]
}

export type VanityExpressionNode<Type extends VanityCssDataType = VanityCssDataType>
  = | VanityLiteralNode<Type>
    | VanityFunctionNode<Type>
    | VanityOperationNode<Type>
    | VanityVarNode<Type>
    | VanityRawNode<Type>
    | VanityPluginNode<Type>
    | VanityCompositeNode<Type>

export const VANITY_NODE = Symbol.for('vanity.expressionNode')

type VanityNodeValue<Type extends VanityCssDataType = VanityCssDataType> = VanityValue<Type> & {
  readonly [VANITY_NODE]: VanityExpressionNode<Type>
}

/** The published, CI-locked zero-config target for this release. */
export const VANITY_DEFAULT_CSS_SUPPORT: VanityCssSupportTarget = Object.freeze({
  id: 'vanity-2026-07',
  features: createImmutableSet<VanityCssFeature>([
    'calc-basic',
    'calc-typed-arithmetic',
    'color-level-4',
    'color-level-5',
    'color-mix',
    'custom-properties',
    'light-dark',
    'relative-color',
  ]),
})

const EMPTY_RESOLVED_POLICIES: VanityResolvedPolicies = Object.freeze({
  constructors: Object.freeze({}),
  support: VANITY_DEFAULT_CSS_SUPPORT,
  layerOrder: Object.freeze([]),
  tokens: Object.freeze({ reference: 'var', emit: true }),
  plugins: Object.freeze({}),
})

/**
 * Define the CSS capability set used for folding and fallback decisions.
 *
 * @example
 * `defineCssSupportTarget({ id: 'modern', features: ['color-level-4'] })`
 */
export function defineCssSupportTarget(input: {
  id: string
  features: Iterable<VanityCssFeature>
}): VanityCssSupportTarget {
  if (input.id.trim().length === 0) {
    throwValueError(
      'VANITY_CSS_INVALID_VALUE',
      'a CSS support target needs a stable non-empty id',
      ['support', 'id'],
      'provide a stable non-empty support target id',
    )
  }

  return Object.freeze({ id: input.id, features: createImmutableSet(input.features) })
}

/** Standalone serializer for tooling that does not need a complete system. */
export function createCssValueSerializer(support: VanityCssSupportTarget): {
  readonly support: VanityCssSupportTarget
  serialize: <Type extends VanityCssDataType>(value: VanitySelfValue<Type>) => string
} {
  const context = createSerializeContext(support)
  return Object.freeze({
    support,
    serialize<Type extends VanityCssDataType>(value: VanitySelfValue<Type>) {
      return context.serialize(value)
    },
  })
}

export function getNode<Type extends VanityCssDataType>(value: VanityValue<Type>): VanityExpressionNode<Type> {
  const node = (value as Partial<VanityNodeValue<Type>>)[VANITY_NODE]

  if (!node) {
    throwValueError(
      'VANITY_VALUE_INVALID',
      'this value does not expose a portable vanity expression node',
      ['value'],
      'pass a value created by Vanity or a compatible value extension',
    )
  }

  return node
}

export function isNodeValue(value: unknown): value is VanityNodeValue {
  return isVanityValue(value) && VANITY_NODE in value
}

export function serializeNode(node: VanityExpressionNode, context: VanitySerializeContext): string {
  const missing = node.requirements.filter(feature => !context.support.features.has(feature))

  if (missing.length > 0) {
    if (node.fallback)
      return serializeNode(node.fallback, context)

    throwValueError(
      'VANITY_CSS_INVALID_VALUE',
      `${node.source?.helper ?? node.kind} requires ${missing.join(', ')}, which is outside CSS support target "${context.support.id}"; no "${context.support.id}" fallback is available`,
      'value',
      'provide a proven fallback, choose a compatible support target, or use an acknowledged raw/experimental form',
    )
  }

  switch (node.kind) {
    case 'literal':
      return typeof node.value === 'number' ? formatFiniteNumber(node.value) : node.value
    case 'function':
      return `${node.name}(${node.values.map(value => serializeNode(value, context)).join(node.separator)})`
    case 'operation': {
      const folded = foldNumericNode(node)
      if (folded !== undefined)
        return foldNumber(folded)
      const expression = `${serializeNode(node.left, context)} ${node.operator} ${serializeNode(node.right, context)}`
      return node.parenthesize ? `(${expression})` : expression
    }
    case 'var': {
      const value = context.resolveReferenceValue?.(node.reference)
      if (value !== undefined)
        return value

      const name = context.resolveReference(node.reference)
      const fallback = node.valueFallback ? `, ${serializeNode(node.valueFallback, context)}` : ''
      return `var(${name}${fallback})`
    }
    case 'raw':
      return node.syntax
    case 'plugin':
      return node.serialize(context)
    case 'composite':
      return node.parts.map(part => typeof part === 'string' ? part : serializeNode(part, context)).join('')
  }
}

/**
 * Reduce closed unitless arithmetic subtrees even when their parent expression
 * stays live. This is intentionally narrower than a CSS evaluator: references,
 * dimensions, functions, and raw/plugin nodes remain browser-owned.
 */
function foldNumericNode(node: VanityExpressionNode): number | undefined {
  if (node.kind === 'literal') {
    if (typeof node.value === 'number')
      return node.value
    return /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(node.value)
      ? Number(node.value)
      : undefined
  }
  if (node.kind !== 'operation')
    return undefined

  const left = foldNumericNode(node.left)
  const right = foldNumericNode(node.right)
  if (left === undefined || right === undefined)
    return undefined

  const value = node.operator === '+'
    ? left + right
    : node.operator === '-'
      ? left - right
      : node.operator === '*'
        ? left * right
        : right === 0 ? Number.NaN : left / right
  return Number.isFinite(value) ? value : undefined
}

/** Recursively collect the platform capabilities required by an expression. */
export function collectNodeRequirements(node: VanityExpressionNode): readonly VanityCssFeature[] {
  const requirements = new Set<VanityCssFeature>()

  const visit = (current: VanityExpressionNode): void => {
    current.requirements.forEach(requirement => requirements.add(requirement))
    if (current.fallback)
      visit(current.fallback)

    switch (current.kind) {
      case 'function':
      case 'plugin':
        current.values.forEach(visit)
        break
      case 'operation':
        visit(current.left)
        visit(current.right)
        break
      case 'var':
        if (current.valueFallback)
          visit(current.valueFallback)
        break
      case 'composite':
        current.parts.forEach((part) => {
          if (typeof part !== 'string')
            visit(part)
        })
        break
      case 'literal':
      case 'raw':
        break
    }
  }

  visit(node)
  return Object.freeze([...requirements])
}

export function createSerializeContext(
  support: VanityCssSupportTarget = VANITY_DEFAULT_CSS_SUPPORT,
  resolveReference: VanitySerializeContext['resolveReference'] = getSelfReference,
  resolveReferenceValue?: VanitySerializeContext['resolveReferenceValue'],
  policies: VanityResolvedPolicies = EMPTY_RESOLVED_POLICIES,
): VanitySerializeContext {
  const context: VanitySerializeContext = {
    support,
    policies,
    resolveReference,
    ...(resolveReferenceValue === undefined ? {} : { resolveReferenceValue }),
    serialize(value) {
      if (typeof value === 'number')
        return formatFiniteNumber(value)
      if (typeof value === 'string')
        return assertNonEmpty(value)
      if (!isNodeValue(value)) {
        if ((typeof value === 'object' || typeof value === 'function') && value !== null && 'var' in value)
          return value.var
        if ((typeof value === 'object' || typeof value === 'function') && value !== null && '$var' in value)
          return String(value)
        throwValueError(
          'VANITY_VALUE_INVALID',
          'the serializer received a value from an incompatible expression protocol',
          ['value'],
          'pass a value created by the same portable expression protocol',
        )
      }
      return serializeNode(value[VANITY_NODE], context)
    },
  }
  return context
}

const SELF_CONTEXT = createSerializeContext()

export function serializeSelf(value: VanityValue | VanityCssInput): string {
  return SELF_CONTEXT.serialize(value)
}

export class ExpressionValue<Type extends VanityCssDataType = VanityCssDataType>
  extends CssValue<string, Type> implements VanityCssValue<string, Type> {
  readonly [VANITY_NODE]: VanityExpressionNode<Type>

  constructor(node: VanityExpressionNode<Type>) {
    super(node.type)
    this[VANITY_NODE] = node
  }

  get css(): string {
    return serializeSelf(this)
  }
}

export function createLiteralNode<Type extends VanityCssDataType>(
  type: Type,
  value: string | number,
  source?: VanitySource,
): VanityLiteralNode<Type> {
  if (typeof value === 'number')
    formatFiniteNumber(value)
  else
    assertNonEmpty(value)

  return createBaseNode({ kind: 'literal', type, value, source })
}

export function createRawNode<Type extends VanityCssDataType>(
  type: Type,
  syntax: string,
  source?: VanitySource,
): VanityRawNode<Type> {
  return createBaseNode({ kind: 'raw', type, syntax: assertNonEmpty(syntax), source, fold: () => ({ kind: 'preserve', reason: 'raw-or-unknown' }) })
}

export function createFunctionNode<Type extends VanityCssDataType>(input: {
  type: Type
  name: string
  values: readonly VanityExpressionNode[]
  separator?: VanityFunctionNode['separator']
  requirements?: readonly VanityCssFeature[]
  source?: VanitySource
  fallback?: VanityExpressionNode
  fold?: VanityFunctionNode<Type>['fold']
}): VanityFunctionNode<Type> {
  const possibleValues = input.fallback ? [...input.values, input.fallback] : input.values
  return createBaseNode({
    kind: 'function',
    type: input.type,
    name: input.name,
    values: input.values,
    separator: input.separator ?? ', ',
    requirements: input.requirements,
    source: input.source,
    fallback: input.fallback,
    fold: input.fold,
    resolution: joinResolution(possibleValues),
    dependencies: joinDependencies(possibleValues),
  })
}

export function createOperationNode<Type extends VanityCssDataType>(input: {
  type: Type
  operator: VanityOperationNode['operator']
  left: VanityExpressionNode
  right: VanityExpressionNode
  parenthesize?: boolean
  requirements?: readonly VanityCssFeature[]
  source?: VanitySource
}): VanityOperationNode<Type> {
  const values = [input.left, input.right]
  return createBaseNode({
    kind: 'operation',
    type: input.type,
    operator: input.operator,
    left: input.left,
    right: input.right,
    parenthesize: input.parenthesize ?? false,
    requirements: input.requirements,
    source: input.source,
    resolution: joinResolution(values),
    dependencies: joinDependencies(values),
  })
}

export function createVarNode<Type extends VanityCssDataType>(input: {
  type: Type
  reference: VanityReference
  fallback?: VanityExpressionNode
  source?: VanitySource
}): VanityVarNode<Type> {
  return createBaseNode({
    kind: 'var',
    type: input.type,
    reference: input.reference,
    valueFallback: input.fallback,
    requirements: ['custom-properties'],
    source: input.source,
    resolution: input.reference.resolution === 'system' || input.fallback?.resolution === 'system' ? 'system' : 'self',
    dependencies: dedupeDependencies([input.reference, ...(input.fallback?.dependencies ?? [])]),
  })
}

export function createCompositeNode<Type extends VanityCssDataType>(input: {
  type: Type
  parts: readonly (string | VanityExpressionNode)[]
  requirements?: readonly VanityCssFeature[]
  source?: VanitySource
}): VanityCompositeNode<Type> {
  const nodes = input.parts.filter((part): part is VanityExpressionNode => typeof part !== 'string')
  return createBaseNode({
    kind: 'composite',
    type: input.type,
    parts: input.parts,
    requirements: input.requirements,
    source: input.source,
    resolution: joinResolution(nodes),
    dependencies: joinDependencies(nodes),
  })
}

export function createPluginNode<Type extends VanityCssDataType>(input: {
  type: Type
  extension: VanityExtensionIdentity
  dependencies?: readonly VanityExpressionNode[]
  requirements?: readonly VanityCssFeature[]
  source?: VanitySource
  serialize: VanityPluginNode<Type>['serialize']
  fold?: VanityPluginNode<Type>['fold']
  fallback?: VanityExpressionNode
}): VanityPluginNode<Type> {
  const dependencies = input.dependencies ?? []
  const possibleValues = input.fallback ? [...dependencies, input.fallback] : dependencies
  return createBaseNode({
    kind: 'plugin',
    type: input.type,
    values: dependencies,
    extension: normalizeExtension(input.extension),
    requirements: input.requirements,
    source: input.source,
    serialize: input.serialize,
    fold: input.fold,
    fallback: input.fallback,
    resolution: joinResolution(possibleValues),
    dependencies: joinDependencies(possibleValues),
  })
}

export function createInputNode(value: VanityCssInput, assertedType?: VanityCssDataType): VanityExpressionNode {
  if (isNodeValue(value))
    return value[VANITY_NODE]

  if ((typeof value === 'object' || typeof value === 'function') && value !== null && 'var' in value) {
    const tokenPath = 'path' in value && typeof value.path === 'string' ? value.path : undefined
    const token = tokenPath !== undefined
    const type = assertedType
      ?? ('$type' in value && typeof value.$type === 'string' ? value.$type as VanityCssDataType : 'unknown')
    const reference: VanityReference = {
      kind: token ? 'token' : 'custom-property',
      name: getCustomPropertyName(value.var),
      ...(tokenPath === undefined ? {} : { path: tokenPath }),
      type,
      resolution: 'self',
    }
    return createVarNode({ type, reference })
  }

  if ((typeof value === 'object' || typeof value === 'function') && value !== null && '$var' in value) {
    // Prior stages are hydrated before a derivation runs. An explicit val
    // projection can therefore enter the portable IR as its resolved value.
    if ('$reference' in value && value.$reference === 'val')
      return createLiteralNode(assertedType ?? 'unknown', String(value))

    const tokenPath = '$path' in value && typeof value.$path === 'string' ? value.$path : undefined
    const logical = '$phase' in value && value.$phase === 'logical'
    const type = assertedType
      ?? ('$type' in value && typeof value.$type === 'string' ? value.$type as VanityCssDataType : 'unknown')
    const reference: VanityReference = {
      kind: tokenPath === undefined ? 'custom-property' : 'token',
      ...(logical ? {} : { name: getCustomPropertyName((value as { $var: () => string }).$var()) }),
      ...(tokenPath === undefined ? {} : { path: tokenPath }),
      type,
      resolution: logical ? 'system' : 'self',
    }
    return createVarNode({ type, reference })
  }

  return createLiteralNode(assertedType ?? inferLiteralType(value), serializeCssText(value))
}

export function normalizeExtension(identity: VanityExtensionIdentity): VanityExtensionIdentity {
  const id = identity.id.trim()
  const version = String(identity.version).trim()
  const fingerprint = identity.fingerprint?.trim()

  if (!id || !version) {
    throwValueError(
      'VANITY_VALUE_INVALID',
      'opaque CSS value semantics require a stable extension id and version',
      'extension',
      'provide non-empty extension id and version fields',
    )
  }

  return Object.freeze({ id, version, ...(fingerprint ? { fingerprint } : {}) })
}

function createBaseNode<T extends VanityExpressionNode>(
  node: Omit<T, 'dependencies' | 'requirements' | 'resolution'>
    & Partial<Pick<T, 'dependencies' | 'requirements' | 'resolution'>>,
): T {
  return Object.freeze({
    ...node,
    dependencies: Object.freeze(node.dependencies ?? []),
    requirements: Object.freeze(node.requirements ?? []),
    resolution: node.resolution ?? 'self',
  }) as T
}

function getSelfReference(reference: VanityReference): string {
  if (reference.resolution === 'system') {
    throwValueError(
      'VANITY_VALUE_INVALID',
      'this value needs a finalized system before it can be serialized',
      'value.reference',
      'serialize the value through the finalized system that owns its token reference',
    )
  }
  if (!reference.name) {
    throwValueError(
      'VANITY_VALUE_INVALID',
      'a self-contained custom-property reference needs its final name',
      'value.reference',
      'provide the final custom-property name before serializing the value',
    )
  }
  return reference.name
}

function joinResolution(nodes: readonly VanityExpressionNode[]): VanityResolution {
  return nodes.some(node => node.resolution === 'system') ? 'system' : 'self'
}

function joinDependencies(nodes: readonly VanityExpressionNode[]): readonly VanityReference[] {
  return dedupeDependencies(nodes.flatMap(node => node.dependencies))
}

function dedupeDependencies(dependencies: readonly VanityReference[]): readonly VanityReference[] {
  const seen = new Set<string>()
  return dependencies.filter((dependency) => {
    const key = `${dependency.kind}:${dependency.name ?? ''}:${dependency.path ?? ''}:${dependency.extension?.id ?? ''}`
    if (seen.has(key))
      return false
    seen.add(key)
    return true
  })
}

function getCustomPropertyName(reference: string): `--${string}` {
  const match = reference.match(/^var\((--[^,\s)]+)/)
  if (!match) {
    throwValueError(
      'VANITY_CSS_INVALID_VALUE',
      `'${reference}' is not a custom-property var() reference`,
      'value.reference',
      'provide a var(--custom-property) reference',
    )
  }
  return match[1] as `--${string}`
}

function inferLiteralType(value: VanityCssInput): VanityCssDataType {
  if (typeof value === 'number')
    return Number.isInteger(value) ? 'integer' : 'number'
  if (typeof value !== 'string')
    return 'unknown'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(value))
    return 'percentage'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:px|rem|em|vh|vw|vmin|vmax|ch|ex|lh|rlh|cm|mm|in|pt|pc|q|cap|ic|vb|vi|svh|svw|lvh|lvw|dvh|dvw|cqw|cqh|cqi|cqb|cqmin|cqmax)$/.test(value))
    return 'length'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:deg|grad|rad|turn)$/.test(value))
    return 'angle'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:ms|s)$/.test(value))
    return 'time'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:Hz|kHz)$/.test(value))
    return 'frequency'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:dpcm|dpi|dppx|x)$/.test(value))
    return 'resolution'
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)fr$/.test(value))
    return 'flex'
  return 'unknown'
}

function formatFiniteNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throwValueError(
      'VANITY_CSS_INVALID_VALUE',
      `a CSS number must be finite; received ${value}`,
      'value',
      'pass a finite number',
    )
  }
  return String(Object.is(value, -0) ? 0 : value)
}

/** Remove binary floating-point residue from build-folded decimal arithmetic. */
function foldNumber(value: number): string {
  return formatFiniteNumber(Number(value.toPrecision(15)))
}

function assertNonEmpty(value: string): string {
  if (value.trim().length === 0) {
    throwValueError(
      'VANITY_CSS_INVALID_VALUE',
      'a CSS value cannot be empty',
      'value',
      'provide non-empty CSS text',
    )
  }
  return value
}

function createImmutableSet<T>(values: Iterable<T>): ReadonlySet<T> {
  const set = new Set(values)
  const view: ReadonlySet<T> = {
    get size() {
      return set.size
    },
    entries: () => set.entries(),
    forEach(callback, thisArg) {
      set.forEach(value => callback.call(thisArg, value, value, view))
    },
    has: value => set.has(value),
    keys: () => set.keys(),
    values: () => set.values(),
    [Symbol.iterator]: () => set[Symbol.iterator](),
  }
  return Object.freeze(view)
}
