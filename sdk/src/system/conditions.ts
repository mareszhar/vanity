/**
 * Conditions ([patterns.md §5]): a named circumstance — pseudo, media,
 * container, scheme, element state — defined once in the system, usable as a
 * bare key everywhere. Values are plain selector strings or the typed helpers;
 * helpers exist for readability, strings are never second-class. A condition
 * compiles to one or more *arms* — the `dark`/`light` schemes need two — and
 * nesting conditions intersects their arms.
 */

import type { VanityDiagnosticInput as VanityDiagnostic } from '../diagnostics'
import type { VanityKebab } from '../tokens/types'
import type { VanityCssValue, VanityTokenInput } from '../values/types'
import { checkQuery, checkSelector, isCssProperty } from '../css/validation'
import { VanityError } from '../diagnostics'
import { toKebab } from '../tokens/names'

/** One compiled way a condition applies: at-rule wrappers and/or a `&` selector. */
export interface VanityConditionArm {
  media?: string
  supports?: string
  container?: string
  selector?: string
  /** Ordered outer-to-inner `@scope` preludes. */
  scopes?: readonly string[]
  /** Typed template anchor resolved by the owning root/axis context. */
  anchor?: 'system-root' | 'module-root' | 'this-mode'
  /** Query-free activation metadata consumed only when this condition is an axis mode. */
  runtime?: {
    readonly kind: 'attribute'
    readonly name: string
    readonly value: string | null
  }
}

export type VanityConditionAst
  = { readonly kind: 'selector', readonly selector: string }
    | { readonly kind: 'media', readonly query: string }
    | { readonly kind: 'supports', readonly query: string }
    | { readonly kind: 'container', readonly name?: string, readonly query: string }
    | { readonly kind: 'scope', readonly start: string, readonly limit?: string }
    | { readonly kind: 'anchor', readonly anchor: 'system-root' | 'module-root' | 'this-mode' }
    | { readonly kind: 'and' | 'or', readonly conditions: readonly VanityConditionAst[] }
    | { readonly kind: 'not', readonly condition: VanityConditionAst }

declare const VANITY_CONDITION_KEY: unique symbol
declare const VANITY_CONDITION_ACTIVATABLE: unique symbol

/** Type-only metadata carried from a condition declaration into rule hovers. */
export type VanityConditionKey<Name extends string, Compiled extends string>
  = Name & {
    readonly [VANITY_CONDITION_KEY]: {
      readonly name: Name
      readonly compiled: Compiled
      readonly hover: `(condition) ${Name}: ${Compiled}`
    }
  }

/** Recover the ordinary object-literal key from a branded condition key. */
export type VanityConditionKeyName<Key extends string>
  = Key extends { readonly [VANITY_CONDITION_KEY]: { readonly name: infer Name extends string } }
    ? Name
    : Key

/** Recover the editor label attached to a branded condition key. */
export type VanityConditionKeyHover<Key extends string>
  = Key extends { readonly [VANITY_CONDITION_KEY]: { readonly hover: infer Hover extends string } }
    ? Hover
    : never

type VanityConditionKeyNamed<Keys extends string, Name extends string>
  = Keys extends unknown
    ? VanityConditionKeyName<Keys> extends Name ? Keys : never
    : never

/** Recover the distinct editor label for a `part:condition` anatomy key. */
export type VanityPartConditionKeyHover<
  Keys extends string,
  Key extends string,
> = Key extends `${infer Part}:${infer Name}`
  ? VanityConditionKeyHover<VanityConditionKeyNamed<Keys, Name>> extends infer Hover extends string
    ? Hover extends `(condition) ${string}: ${infer Compiled}`
      ? `(part condition) ${Part}:${Name}: ${Compiled}`
      : never
    : never
  : never

/** A typed helper result — `media()`, `container()`, `schemeIs()`, `data()`, `aria()`. */
export interface VanityCondition<
  Compiled extends string = string,
  Activatable extends boolean = false,
> {
  readonly [VANITY_CONDITION_ACTIVATABLE]?: Activatable
  readonly arms: readonly VanityConditionArm[]
  readonly ast?: VanityConditionAst
  /**
   * The exact selector or at-rule emitted by the condition.
   *
   * Optional for structurally-authored conditions; all Vanity helpers and
   * presets populate it.
   */
  readonly compiled?: Compiled
}

type ConditionActivatable<Input> = Input extends VanityCondition<any, infer Activatable>
  ? Activatable
  : false

type ConditionCompiled<Input> = Input extends VanityCondition<infer Compiled, any>
  ? Compiled
  : Input extends string ? Input : never

type EitherActivatable<Left extends boolean, Right>
  = Left extends true ? true : ConditionActivatable<Right>

type RuntimeNeutralCondition<Compiled extends string>
  = Compiled extends '&' | 'systemRoot' | 'moduleRoot' ? true : false

type IntersectedActivatable<
  LeftCompiled extends string,
  LeftActivatable extends boolean,
  Right,
> = RuntimeNeutralCondition<LeftCompiled> extends true
  ? ConditionActivatable<Right>
  : RuntimeNeutralCondition<ConditionCompiled<Right>> extends true
    ? LeftActivatable
    : false

export interface VanityFluentCondition<
  Compiled extends string = string,
  Activatable extends boolean = false,
> extends VanityCondition<Compiled, Activatable> {
  readonly ast: VanityConditionAst
  readonly and: <Other extends VanityConditionInput>(
    other: Other,
  ) => VanityFluentCondition<string, IntersectedActivatable<Compiled, Activatable, Other>>
  readonly or: <Other extends VanityConditionInput>(
    other: Other,
  ) => VanityFluentCondition<string, EitherActivatable<Activatable, Other>>
  readonly not: () => VanityFluentCondition<string>
}

export type VanityConditionInput = string | VanityCondition<string, boolean>

export type VanityConditionKeyFor<Name extends string, Input>
  = VanityConditionKey<Name, Input extends VanityCondition<infer Compiled>
    ? Compiled
    : Input extends string ? Input : string>

export type VanityConditionKeys<Conditions extends object> = {
  [Name in keyof Conditions & string]: VanityConditionKeyFor<Name, Conditions[Name]>
}[keyof Conditions & string]

const CONDITION_EXPANSION_LIMIT = 64
const RANGE_CAPABLE_FEATURES = new Set([
  'aspect-ratio',
  'block-size',
  'color',
  'color-index',
  'device-aspect-ratio',
  'device-height',
  'device-width',
  'height',
  'inline-size',
  'monochrome',
  'resolution',
  'width',
])

function createCondition<const Compiled extends string>(
  compiled: Compiled,
  ast: VanityConditionAst,
  ...arms: VanityConditionArm[]
): VanityFluentCondition<Compiled> {
  const frozenArms = Object.freeze(dedupeArms(arms).map(arm => Object.freeze({
    ...arm,
    ...(arm.scopes === undefined ? {} : { scopes: Object.freeze([...arm.scopes]) }),
  })))
  const value = Object.freeze({
    arms: frozenArms,
    ast: freezeConditionAst(ast),
    compiled,
    and: (other: VanityConditionInput) => combineConditions('and', value, normalizeConditionInput(other)),
    or: (other: VanityConditionInput) => combineConditions('or', value, normalizeConditionInput(other)),
    not: () => negateCondition(value),
  }) as unknown as VanityFluentCondition<Compiled>
  return value
}

// ─── The typed helpers ───────────────────────────────────────────────────────

export type VanityConditionScalar = string | number | VanityCssValue | VanityTokenInput

export type VanityRangeQuery<Value extends VanityConditionScalar = VanityConditionScalar>
  = | { readonly '>': Value, readonly '>='?: never, readonly '<'?: Value, readonly '<='?: Value, readonly '='?: never }
    | { readonly '>=': Value, readonly '>'?: never, readonly '<'?: Value, readonly '<='?: Value, readonly '='?: never }
    | { readonly '<': Value, readonly '<='?: never, readonly '>'?: Value, readonly '>='?: Value, readonly '='?: never }
    | { readonly '<=': Value, readonly '<'?: never, readonly '>'?: Value, readonly '>='?: Value, readonly '='?: never }
    | { readonly '>': Value, readonly '<': Value, readonly '>='?: never, readonly '<='?: never, readonly '='?: never }
    | { readonly '>': Value, readonly '<=': Value, readonly '>='?: never, readonly '<'?: never, readonly '='?: never }
    | { readonly '>=': Value, readonly '<': Value, readonly '>'?: never, readonly '<='?: never, readonly '='?: never }
    | { readonly '>=': Value, readonly '<=': Value, readonly '>'?: never, readonly '<'?: never, readonly '='?: never }
    | { readonly '=': Value, readonly '>'?: never, readonly '>='?: never, readonly '<'?: never, readonly '<='?: never }

export type VanityStructuredQuery = Readonly<Record<
  string,
  VanityConditionScalar | VanityRangeQuery
>>

/** Begin a selector condition. Plain strings remain literal CSS. */
export function selector<const Selector extends string>(input: Selector): VanityFluentCondition<Selector> {
  return createCondition(input, { kind: 'selector', selector: input }, { selector: input })
}

/** Normalize a literal selector/query or retain an existing condition AST. */
export function condition<const Input extends VanityConditionInput>(
  input: Input,
): Input extends VanityFluentCondition<any> ? Input : VanityFluentCondition<Input & string> {
  return normalizeConditionInput(input) as any
}

/** A media condition: `wide: media({ minWidth: '48rem' })`. */
export function media<const Query extends string>(query: Query): VanityFluentCondition<`@media ${Query}`>
export function media<const Query extends VanityStructuredQuery>(query: Query): VanityFluentCondition<string>
export function media(query: string | VanityStructuredQuery): VanityFluentCondition<string> {
  const compiled = typeof query === 'string' ? query : compileStructuredQuery(query)
  return createCondition(`@media ${compiled}`, { kind: 'media', query: compiled }, { media: compiled })
}

/** A supports condition: `supportsAnchor: supports('(anchor-name: --a)')`. */
export function supports<const Query extends string>(query: Query): VanityFluentCondition<`@supports ${Query}`> {
  return createCondition(`@supports ${query}`, { kind: 'supports', query }, { supports: query })
}

/**
 * A container condition: `cardWide: container('card', '(min-width: 400px)')`,
 * or unnamed — `wide: container('(min-width: 400px)')`.
 */
export function container<const NameOrQuery extends string>(
  nameOrQuery: NameOrQuery,
): VanityFluentCondition<`@container ${NameOrQuery}`>
export function container<const Name extends string, const Query extends string>(
  name: Name,
  query: Query,
): VanityFluentCondition<`@container ${Name} ${Query}`>
export function container<const Query extends VanityStructuredQuery>(
  query: Query,
): VanityFluentCondition<string>
export function container<const Name extends string, const Query extends VanityStructuredQuery>(
  name: Name,
  query: Query,
): VanityFluentCondition<string>
export function container(
  nameOrQuery: string | VanityStructuredQuery,
  query?: string | VanityStructuredQuery,
): VanityFluentCondition<string> {
  const name = typeof nameOrQuery === 'string' && query !== undefined ? nameOrQuery : undefined
  const rawQuery = name === undefined ? nameOrQuery : query!
  const compiledQuery = typeof rawQuery === 'string' ? rawQuery : compileStructuredQuery(rawQuery)
  const prelude = name === undefined ? compiledQuery : `${name} ${compiledQuery}`
  return createCondition(
    `@container ${prelude}`,
    { kind: 'container', ...(name === undefined ? {} : { name }), query: compiledQuery },
    { container: prelude },
  )
}

/**
 * The effective scheme ([spec-conditions.md §9]): the OS preference unless an
 * ancestor pins `data-scheme`. Two arms — the pinned subtree, and the
 * preference outside any opposite-pinned subtree.
 */
export function schemeIs<const Scheme extends 'light' | 'dark'>(
  scheme: Scheme,
): VanityFluentCondition<`&:where([data-scheme='${Scheme}'], [data-scheme='${Scheme}'] *) | @media (prefers-color-scheme: ${Scheme})`, true> {
  const arms = getSchemeConditionArms(scheme)
  return createCondition(
    `&:where([data-scheme='${scheme}'], [data-scheme='${scheme}'] *) | @media (prefers-color-scheme: ${scheme})`,
    {
      kind: 'or',
      conditions: [
        { kind: 'selector', selector: arms[0].selector! },
        {
          kind: 'and',
          conditions: [
            { kind: 'media', query: arms[1].media! },
            { kind: 'selector', selector: arms[1].selector! },
          ],
        },
      ],
    },
    { ...arms[0], runtime: { kind: 'attribute', name: 'data-scheme', value: scheme } },
    arms[1],
  ) as unknown as VanityFluentCondition<`&:where([data-scheme='${Scheme}'], [data-scheme='${Scheme}'] *) | @media (prefers-color-scheme: ${Scheme})`, true>
}

/**
 * Canonical effective-scheme arms shared by named conditions and axis
 * projection. Adapters may add priority/runtime metadata, but must not fork
 * the selector or preference guards.
 */
export function getSchemeConditionArms(scheme: 'light' | 'dark'): readonly [VanityConditionArm, VanityConditionArm] {
  const opposite = scheme === 'light' ? 'dark' : 'light'

  return [
    { selector: `&:where([data-scheme='${scheme}'], [data-scheme='${scheme}'] *)` },
    {
      media: `(prefers-color-scheme: ${scheme})`,
      selector: `&:where(:not([data-scheme='${opposite}'], [data-scheme='${opposite}'] *))`,
    },
  ]
}

/** A literal `data-*` selector; compose `selector('&')` when anchoring is intended. */
export function data<const Attribute extends string>(
  attribute: Attribute,
): VanityFluentCondition<`[data-${VanityKebab<Attribute>}]`, true>
export function data<const Attribute extends string, const Value extends string>(
  attribute: Attribute,
  value: Value,
): VanityFluentCondition<`[data-${VanityKebab<Attribute>}='${Value}']`, true>
export function data(attribute: string, value?: string): VanityFluentCondition<string, true> {
  const name = `data-${toKebab(attribute)}`
  const compiled = value === undefined ? `[${name}]` : `[${name}='${value}']`
  return createCondition(
    compiled,
    { kind: 'selector', selector: compiled },
    {
      selector: compiled,
      runtime: { kind: 'attribute', name, value: value ?? '' },
    },
  ) as unknown as VanityFluentCondition<string, true>
}

/** A literal ARIA selector. */
export function aria<const Attribute extends string, const Value extends string | boolean = true>(
  attribute: Attribute,
  value: Value = true as Value,
): VanityFluentCondition<`[aria-${VanityKebab<Attribute>}='${Value}']`> {
  return selector(`[aria-${toKebab(attribute)}='${value}']`) as VanityFluentCondition<`[aria-${VanityKebab<Attribute>}='${Value}']`>
}

export interface VanityScopeCondition extends VanityFluentCondition<string> {
  readonly to: (limit: string) => VanityScopeCondition
}

/** A first-class `@scope` condition with optional donut limit. */
export function scope(start: string): VanityScopeCondition {
  return scopeCondition(start)
}

/** Anchor a condition to the system's declared root: `rootHover: systemRoot.and(selector('&:hover'))`. */
export const systemRoot: VanityFluentCondition<'systemRoot'> = anchorCondition('system-root', 'systemRoot')
/** Anchor a condition to the current style module's root: `moduleRoot.and(selector('&:hover'))`. */
export const moduleRoot: VanityFluentCondition<'moduleRoot'> = anchorCondition('module-root', 'moduleRoot')
/** Anchor an axis-mode condition to that mode's own selector: `thisMode.and(selector('&:hover'))`. */
export const thisMode: VanityFluentCondition<'thisMode', true>
  = anchorCondition('this-mode', 'thisMode') as unknown as VanityFluentCondition<'thisMode', true>

// ─── The base set ────────────────────────────────────────────────────────────

export type VanityBaseConditionName
  = | 'hover' | 'hoverFocus' | 'active' | 'focusVisible' | 'disabled'
    | 'motionOk' | 'motionReduce' | 'dark' | 'light' | 'ltr' | 'rtl'

export interface VanityBaseConditionInputs {
  hover: VanityCondition<'&:hover'>
  hoverFocus: VanityCondition<'&:hover, &:focus-visible'>
  active: VanityCondition<'&:active'>
  focusVisible: VanityCondition<'&:focus-visible'>
  disabled: VanityCondition<'&:disabled'>
  motionOk: VanityCondition<'@media (prefers-reduced-motion: no-preference)'>
  motionReduce: VanityCondition<'@media (prefers-reduced-motion: reduce)'>
  dark: ReturnType<typeof schemeIs<'dark'>>
  light: ReturnType<typeof schemeIs<'light'>>
  ltr: VanityCondition<'&:dir(ltr)'>
  rtl: VanityCondition<'&:dir(rtl)'>
}

/**
 * The built-in base conditions ([spec-css.md §1]): the platform-universal
 * names, no opinions. A condition never claims less than it does — `hover` is
 * `:hover`; the interactive-affordance pair is named `hoverFocus` for what it
 * is. Breakpoints, container sizes, and headless states are opinions and live
 * in the preset.
 */
export function createBaseConditions(): VanityBaseConditionInputs {
  return {
    hover: selector('&:hover'),
    hoverFocus: selector('&:hover, &:focus-visible'),
    active: selector('&:active'),
    focusVisible: selector('&:focus-visible'),
    disabled: selector('&:disabled'),
    motionOk: media('(prefers-reduced-motion: no-preference)'),
    motionReduce: media('(prefers-reduced-motion: reduce)'),
    dark: schemeIs('dark'),
    light: schemeIs('light'),
    ltr: selector('&:dir(ltr)'),
    rtl: selector('&:dir(rtl)'),
  }
}

// ─── Introspection ───────────────────────────────────────────────────────────

/** Serialize compiled conditions readably for the manifest: one string per condition. */
export function describeConditions(conditions: Map<string, readonly VanityConditionArm[]>): Record<string, string> {
  const described: Record<string, string> = {}

  for (const [name, arms] of conditions) {
    described[name] = arms
      .map(arm => [
        arm.media === undefined ? undefined : `@media ${arm.media}`,
        arm.supports === undefined ? undefined : `@supports ${arm.supports}`,
        arm.container === undefined ? undefined : `@container ${arm.container}`,
        arm.selector,
      ].filter(part => part !== undefined).join(' '))
      .join(' | ')
  }

  return described
}

/** Preserve each lowered arm structurally for manifests and tooling. */
export function describeConditionArms(
  conditions: Map<string, readonly VanityConditionArm[]>,
): Record<string, readonly VanityConditionArm[]> {
  return Object.fromEntries([...conditions].map(([name, arms]) => [
    name,
    Object.freeze(arms.map(arm => Object.freeze({ ...arm }))),
  ]))
}

/** Preserve authored ASTs so tooling never has to reconstruct CSS text. */
export function describeConditionAsts(
  conditions: Record<string, VanityConditionInput>,
): Record<string, VanityConditionAst> {
  return Object.fromEntries(Object.entries(conditions).map(([name, input]) => [
    name,
    normalizeConditionInput(input).ast,
  ]))
}

// ─── Normalization ───────────────────────────────────────────────────────────

/**
 * Resolve the merged condition map into compiled arms, refusing a name that
 * collides with a CSS property (the two bare-key namespaces must never blur)
 * and parsing every selector and query at the definition site.
 */
export function normalizeConditions(
  conditions: Record<string, VanityConditionInput>,
  file: string | undefined,
): Map<string, readonly VanityConditionArm[]> {
  const normalized = new Map<string, readonly VanityConditionArm[]>()
  const diagnostics: VanityDiagnostic[] = []

  for (const [name, input] of Object.entries(conditions)) {
    if (isCssProperty(toKebab(name))) {
      diagnostics.push({
        code: 'VANITY_SYSTEM_CONDITION_COLLISION' as const,
        message: `the condition '${name}' collides with the CSS property '${toKebab(name)}'`,
        detail: ['conditions are bare keys beside properties; a shared name would make every rule ambiguous'],
        path: name,
        file,
        fix: `rename the condition — e.g. '${name}Is' or a more specific circumstance`,
      })
      continue
    }

    const arms = typeof input === 'string' ? parseConditionString(name, input, file) : input.arms

    for (const arm of arms) {
      const reason
        = (arm.selector !== undefined ? checkSelector(arm.selector) : undefined)
          ?? (arm.media !== undefined ? checkQuery('media', arm.media) : undefined)
          ?? (arm.supports !== undefined ? checkQuery('supports', arm.supports) : undefined)
          ?? (arm.container !== undefined ? checkQuery('container', arm.container) : undefined)
          ?? arm.scopes?.map(validateScopePrelude).find(Boolean)

      if (reason !== undefined) {
        diagnostics.push({
          code: 'VANITY_SYSTEM_INVALID_CONDITION' as const,
          message: `the condition '${name}' does not parse: ${reason}`,
          path: name,
          file,
          fix: 'fix the selector or query — the same text must hold as CSS',
        })
      }
    }

    normalized.set(name, arms)
  }

  if (diagnostics.length > 0)
    throw new VanityError(diagnostics)

  return normalized
}

function parseConditionString(name: string, input: string, file: string | undefined): readonly VanityConditionArm[] {
  for (const [prefix, key] of [['@media ', 'media'], ['@supports ', 'supports'], ['@container ', 'container']] as const) {
    if (input.startsWith(prefix))
      return [{ [key]: input.slice(prefix.length).trim() }]
  }

  if (!checkSelector(input))
    return [{ selector: input }]

  throw new VanityError({
    code: 'VANITY_SYSTEM_INVALID_CONDITION',
    message: `the condition '${name}' is '${input}', which is neither a valid selector nor an at-rule`,
    path: name,
    file,
    fix: 'write valid CSS selector syntax, or use media()/container()/supports()',
  })
}

function normalizeConditionInput(input: VanityConditionInput): VanityFluentCondition<string> {
  if (typeof input !== 'string') {
    if (input.ast !== undefined && 'and' in input)
      return input as VanityFluentCondition<string>
    const ast = createAstFromArms(input.arms)
    return createCondition(input.compiled ?? describeAst(ast), ast, ...input.arms)
  }
  for (const [prefix, kind] of [
    ['@media ', 'media'],
    ['@supports ', 'supports'],
    ['@container ', 'container'],
  ] as const) {
    if (!input.startsWith(prefix))
      continue
    const query = input.slice(prefix.length).trim()
    if (kind === 'media')
      return media(query)
    if (kind === 'supports')
      return supports(query)
    return container(query)
  }
  return selector(input)
}

function combineConditions(
  kind: 'and' | 'or',
  left: VanityFluentCondition,
  right: VanityFluentCondition,
): VanityFluentCondition<string, boolean> {
  const ast: VanityConditionAst = { kind, conditions: [left.ast, right.ast] }
  const arms = kind === 'or'
    ? dedupeArms([...left.arms, ...right.arms])
    : intersectArmSets(left.arms, right.arms)
  return createCondition(
    `${left.compiled ?? describeAst(left.ast)} ${kind} ${right.compiled ?? describeAst(right.ast)}`,
    ast,
    ...arms,
  ) as VanityFluentCondition<string, boolean>
}

function negateCondition(input: VanityFluentCondition): VanityFluentCondition<string> {
  const ast: VanityConditionAst = { kind: 'not', condition: input.ast }
  return createCondition(`not (${input.compiled ?? describeAst(input.ast)})`, ast, ...lowerAst(ast))
}

function lowerAst(ast: VanityConditionAst): readonly VanityConditionArm[] {
  switch (ast.kind) {
    case 'selector':
      return [{ selector: ast.selector }]
    case 'media':
      return [{ media: ast.query }]
    case 'supports':
      return [{ supports: ast.query }]
    case 'container':
      return [{ container: ast.name === undefined ? ast.query : `${ast.name} ${ast.query}` }]
    case 'scope':
      return [{ scopes: [scopePrelude(ast.start, ast.limit)] }]
    case 'anchor':
      return [{ anchor: ast.anchor, selector: '&' }]
    case 'and':
      return ast.conditions.reduce<readonly VanityConditionArm[]>(
        (arms, child) => intersectArmSets(arms, lowerAst(child)),
        [{}],
      )
    case 'or':
      return dedupeArms(ast.conditions.flatMap(lowerAst))
    case 'not':
      return lowerNegatedAst(ast.condition)
  }
}

function lowerNegatedAst(ast: VanityConditionAst): readonly VanityConditionArm[] {
  if (ast.kind === 'or') {
    return ast.conditions.reduce<readonly VanityConditionArm[]>(
      (arms, child) => intersectArmSets(arms, lowerNegatedAst(child)),
      [{}],
    )
  }
  if (ast.kind === 'and')
    return dedupeArms(ast.conditions.flatMap(lowerNegatedAst))
  if (ast.kind === 'not')
    return lowerAst(ast.condition)
  if (ast.kind === 'selector')
    return [{ selector: negateSelector(ast.selector) }]
  if (ast.kind === 'media')
    return [{ media: `not ${ast.query}` }]
  if (ast.kind === 'supports')
    return [{ supports: `not ${ast.query}` }]
  if (ast.kind === 'container')
    return [{ container: `${ast.name === undefined ? '' : `${ast.name} `}not ${ast.query}` }]
  if (ast.kind === 'anchor')
    return [{ anchor: ast.anchor, selector: '&:not(&)' }]
  throw new TypeError('[vanity] @scope conditions cannot be negated; negate an inner selector instead')
}

function intersectArmSets(
  left: readonly VanityConditionArm[],
  right: readonly VanityConditionArm[],
): readonly VanityConditionArm[] {
  if (left.length * right.length > CONDITION_EXPANSION_LIMIT) {
    throw new TypeError(
      `[vanity] condition algebra expands to ${left.length * right.length} arms; `
      + `the supported maximum is ${CONDITION_EXPANSION_LIMIT}`,
    )
  }
  return dedupeArms(left.flatMap(outer => right.map(inner => mergeArms(outer, inner))))
}

function mergeArms(outer: VanityConditionArm, inner: VanityConditionArm): VanityConditionArm {
  if (outer.anchor !== undefined && inner.anchor !== undefined && outer.anchor !== inner.anchor)
    throw new TypeError(`[vanity] a condition cannot combine ${outer.anchor} and ${inner.anchor} anchors`)
  const anchor = outer.anchor ?? inner.anchor
  return {
    ...(outer.media === undefined && inner.media === undefined
      ? {}
      : { media: joinQueries(outer.media, inner.media) }),
    ...(outer.supports === undefined && inner.supports === undefined
      ? {}
      : { supports: joinQueries(outer.supports, inner.supports) }),
    ...(outer.container === undefined && inner.container === undefined
      ? {}
      : { container: joinQueries(outer.container, inner.container) }),
    ...(outer.selector === undefined && inner.selector === undefined
      ? {}
      : { selector: composeSelectors(outer.selector, inner.selector) }),
    ...((outer.scopes?.length ?? 0) + (inner.scopes?.length ?? 0) === 0
      ? {}
      : { scopes: [...outer.scopes ?? [], ...inner.scopes ?? []] }),
    ...(anchor === undefined ? {} : { anchor }),
    ...(mergedRuntimeActivation(outer, inner) === undefined
      ? {}
      : { runtime: mergedRuntimeActivation(outer, inner) }),
  }
}

function mergedRuntimeActivation(
  left: VanityConditionArm,
  right: VanityConditionArm,
): VanityConditionArm['runtime'] {
  if (left.runtime === undefined)
    return runtimeNeutralArm(left) ? right.runtime : undefined
  if (right.runtime === undefined)
    return runtimeNeutralArm(right) ? left.runtime : undefined
  return left.runtime.kind === right.runtime.kind
    && left.runtime.name === right.runtime.name
    && left.runtime.value === right.runtime.value
    ? left.runtime
    : undefined
}

function runtimeNeutralArm(arm: VanityConditionArm): boolean {
  return arm.runtime === undefined
    && arm.media === undefined
    && arm.supports === undefined
    && arm.container === undefined
    && (arm.scopes?.length ?? 0) === 0
    && arm.anchor !== 'this-mode'
    && (arm.selector === undefined || arm.selector === '&')
}

function joinQueries(left: string | undefined, right: string | undefined): string {
  return left === undefined ? right! : right === undefined ? left : `${left} and ${right}`
}

function composeSelectors(left: string | undefined, right: string | undefined): string {
  if (left === undefined)
    return right!
  if (right === undefined)
    return left
  const anchoredRight = right.includes('&') ? right : `&${right}`
  return anchoredRight.replaceAll('&', left)
}

function negateSelector(input: string): string {
  const parts = splitSelectorList(input)
  if (parts.length > 1)
    return `&:not(:is(${parts.map(part => part.replaceAll('&', ':scope')).join(', ')}))`
  if (input.startsWith('&'))
    return `&:not(${input.slice(1) || ':scope'})`
  return `&:not(${input})`
}

function splitSelectorList(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < input.length; index++) {
    const char = input[index]
    if (char === '(' || char === '[') {
      depth++
    }
    else if (char === ')' || char === ']') {
      depth--
    }
    else if (char === ',' && depth === 0) {
      parts.push(input.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(input.slice(start).trim())
  return parts
}

function dedupeArms(arms: readonly VanityConditionArm[]): VanityConditionArm[] {
  const seen = new Set<string>()
  const result: VanityConditionArm[] = []
  for (const arm of arms) {
    const key = JSON.stringify([
      arm.media,
      arm.supports,
      arm.container,
      arm.selector,
      arm.scopes,
      arm.anchor,
      arm.runtime,
    ])
    if (seen.has(key))
      continue
    seen.add(key)
    result.push(arm)
  }
  if (result.length > CONDITION_EXPANSION_LIMIT)
    throw new TypeError(`[vanity] condition algebra exceeds the ${CONDITION_EXPANSION_LIMIT}-arm limit`)
  return result
}

function compileStructuredQuery(input: VanityStructuredQuery): string {
  const features = Object.entries(input).map(([rawFeature, value]) => {
    const feature = toKebab(rawFeature)
    if (!isRangeQuery(value))
      return `(${feature}: ${String(value)})`
    if (!RANGE_CAPABLE_FEATURES.has(feature)) {
      throw new TypeError(
        `[vanity] '${rawFeature}' is not a range-capable media/container feature; `
        + 'use its scalar form or a raw query string',
      )
    }
    const entries = Object.entries(value).filter(([, entry]) => entry !== undefined)
    const lowers = entries.filter(([operator]) => operator === '>' || operator === '>=')
    const uppers = entries.filter(([operator]) => operator === '<' || operator === '<=')
    const equals = entries.filter(([operator]) => operator === '=')
    if (lowers.length > 1 || uppers.length > 1 || (equals.length > 0 && entries.length > 1))
      throw new TypeError(`[vanity] '${rawFeature}' has contradictory range operators`)
    if (equals.length === 1)
      return `(${feature} = ${String(equals[0]![1])})`
    const lower = lowers[0]
    const upper = uppers[0]
    const lowerText = lower === undefined
      ? undefined
      : `${String(lower[1])} ${lower[0] === '>=' ? '<=' : '<'} ${feature}`
    const upperText = upper === undefined
      ? undefined
      : `${feature} ${upper[0]} ${String(upper[1])}`
    if (lowerText && upperText)
      return `(${lowerText} ${upperText.slice(feature.length + 1)})`
    return `(${lowerText ?? upperText})`
  })
  if (features.length === 0)
    throw new TypeError('[vanity] a structured query needs at least one feature')
  return features.join(' and ')
}

function isRangeQuery(value: VanityConditionScalar | VanityRangeQuery): value is VanityRangeQuery {
  return typeof value === 'object' && value !== null
    && Object.keys(value).some(key => ['>', '>=', '<', '<=', '='].includes(key))
}

function scopeCondition(start: string, limit?: string): VanityScopeCondition {
  if (checkSelector(start))
    throw new TypeError(`[vanity] scope('${start}') needs a valid start selector`)
  if (limit !== undefined && checkSelector(limit))
    throw new TypeError(`[vanity] scope().to('${limit}') needs a valid limit selector`)
  const ast: VanityConditionAst = {
    kind: 'scope',
    start,
    ...(limit === undefined ? {} : { limit }),
  }
  const base = createCondition(`@scope ${scopePrelude(start, limit)}`, ast, {
    scopes: [scopePrelude(start, limit)],
  })
  return Object.freeze({
    ...base,
    to: (nextLimit: string) => scopeCondition(start, nextLimit),
  })
}

function scopePrelude(start: string, limit?: string): string {
  return `(${start})${limit === undefined ? '' : ` to (${limit})`}`
}

function validateScopePrelude(prelude: string): string | undefined {
  return prelude.trim().length === 0 ? 'an @scope prelude cannot be empty' : undefined
}

function anchorCondition<const Compiled extends string>(
  anchor: 'system-root' | 'module-root' | 'this-mode',
  compiled: Compiled,
): VanityFluentCondition<Compiled> {
  return createCondition(compiled, { kind: 'anchor', anchor }, { anchor, selector: '&' })
}

function freezeConditionAst(ast: VanityConditionAst): VanityConditionAst {
  if (ast.kind === 'and' || ast.kind === 'or') {
    return Object.freeze({
      ...ast,
      conditions: Object.freeze(ast.conditions.map(freezeConditionAst)),
    })
  }
  if (ast.kind === 'not')
    return Object.freeze({ ...ast, condition: freezeConditionAst(ast.condition) })
  return Object.freeze({ ...ast })
}

function describeAst(ast: VanityConditionAst): string {
  if (ast.kind === 'selector')
    return ast.selector
  if (ast.kind === 'media' || ast.kind === 'supports')
    return `@${ast.kind} ${ast.query}`
  if (ast.kind === 'container')
    return `@container ${ast.name === undefined ? '' : `${ast.name} `}${ast.query}`
  if (ast.kind === 'scope')
    return `@scope ${scopePrelude(ast.start, ast.limit)}`
  if (ast.kind === 'anchor')
    return ast.anchor
  if (ast.kind === 'not')
    return `not (${describeAst(ast.condition)})`
  return ast.conditions.map(describeAst).join(` ${ast.kind} `)
}

function createAstFromArms(arms: readonly VanityConditionArm[]): VanityConditionAst {
  const conditions = arms.map<VanityConditionAst>((arm) => {
    const parts: VanityConditionAst[] = []
    for (const prelude of arm.scopes ?? [])
      parts.push({ kind: 'scope', start: prelude })
    if (arm.media !== undefined)
      parts.push({ kind: 'media', query: arm.media })
    if (arm.supports !== undefined)
      parts.push({ kind: 'supports', query: arm.supports })
    if (arm.container !== undefined)
      parts.push({ kind: 'container', query: arm.container })
    if (arm.anchor !== undefined)
      parts.push({ kind: 'anchor', anchor: arm.anchor })
    if (arm.selector !== undefined)
      parts.push({ kind: 'selector', selector: arm.selector })
    return parts.length === 1 ? parts[0]! : { kind: 'and', conditions: parts }
  })
  return conditions.length === 1 ? conditions[0]! : { kind: 'or', conditions }
}
