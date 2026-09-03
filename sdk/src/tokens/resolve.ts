/** Semantic finalization and authored-value resolution for inert token modules. */

import type { VanityDiagnosticInput as VanityDiagnostic } from '../diagnostics'
import type { VanityCssValue } from '../values/types'
import type { VanityColorExpr } from './color'
import type { VanityResolver, VanityScheme } from './expressions'
import type { VanityOklch } from './math'
import type { NodeResult, TokenGraph, TokenModule, TokenNode, TokenResolutionOptions, VanityLeafDefinition } from './module'
import type { VanityTokens } from './types'
import { VanityError } from '../diagnostics'
import { record } from '../introspect/records'
import {
  createSerializeContext,
  getNode as valueNodeOf,
  VANITY_DEFAULT_CSS_SUPPORT,
} from '../values/protocol'
import { TextContrastCheck } from './checks'
import { getColorRequirements, toExpr } from './color'
import { foldExpr, getExpressionTraits, serializeContrastPick, serializeExpr } from './expressions'
import { readHandleVar } from './handle'
import { formatNumber, formatOklch, measureApcaContrast, measureWcagContrast, parseColor, pickLegible } from './math'
import {
  buildTokens,
  getNode,
  isTokenModule,
  serializeTokenCss,
  VANITY_MODULE_TOKEN_REF,
} from './module'

export {
  collectRefs,
  foldExpr,
  getExpressionTraits,
  hasContrastExpression,
  serializeContrastPick,
  serializeExpr,
} from './expressions'
export type {
  VanityExprTraits,
  VanityResolver,
  VanityScheme,
} from './expressions'
export type { TokenResolutionOptions } from './module'

/** Materialize an inert module at the owning system, interchange, or test boundary. */
export function resolveTokenModule(
  module: unknown,
  options: TokenResolutionOptions = {},
): VanityTokens<object, string> {
  if (!isTokenModule(module))
    throw new TypeError('[vanity] only an unfinished token module can be resolved')
  const tokenModule = module as TokenModule
  return buildTokens(tokenModule.contributions, tokenModule.tokenPolicy, options)
}

export type VanityOverride = VanityLeafDefinition

/** Resolve every graph node, preserving cycles, live references, and diagnostics. */
export function resolveGraph(
  graph: TokenGraph,
  overrides?: Map<string, VanityOverride>,
  context?: string,
): { results: Map<string, NodeResult>, diagnostics: VanityDiagnostic[] } {
  const results = new Map<string, NodeResult>()
  const stack: string[] = []
  const diagnostics: VanityDiagnostic[] = []
  let authoredValues: ReturnType<typeof createAuthoredValueFolder>

  const resolver: VanityResolver = {
    foldRef: (handle, scheme) => foldNode(requireNode(handle), scheme),
    foldValue: (value, scheme) => authoredValues.foldValue(value, scheme),
    serializeValue: value => authoredValues.serializeValue(value),
    refTraits: (handle) => {
      const referenced = requireNode(handle)
      const traits = resolveNode(referenced).traits
      return {
        cssLive: traits.cssLive || (referenced.contract.canonical && referenced.contract.reference === 'var'),
        volatile: traits.volatile || (referenced.contract.canonical && referenced.contract.mutable),
        conditional: traits.conditional,
      }
    },
    serializeRef: (handle) => {
      const referenced = requireNode(handle)
      return referenced.contract.reference === 'var'
        ? readHandleVar(referenced.handle)
        : resolveNode(referenced).emitted
    },
    invalidColor: (detail) => {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_COLOR',
        message: `${stack[stack.length - 1] ?? 'a token'} cannot resolve: ${detail}`,
        path: stack[stack.length - 1],
        file: graph.file,
        fix: 'give it a color value, or reference a color token',
      })
    },
  }

  function requireNode(handle: import('./handle').VanityInternalTokenHandle): TokenNode {
    const node = getNode(handle)

    if (node && graph.nodes.get(node.key) === node)
      return node

    const moduleRef = (handle as unknown as {
      readonly [VANITY_MODULE_TOKEN_REF]?: {
        readonly module: symbol
        readonly path: readonly string[]
      }
    })[VANITY_MODULE_TOKEN_REF]
    const owner = graph.nodes.get(stack[stack.length - 1] ?? '')
    if (moduleRef !== undefined && owner?.moduleId === moduleRef.module) {
      const rebound = graph.nodes.get([
        ...(owner.modulePath ?? []),
        ...moduleRef.path,
      ].join('.'))
      if (rebound)
        return rebound
    }

    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_OVERRIDE',
      message: moduleRef === undefined
        ? 'a referenced token does not belong to this token module'
        : 'a module-relative token reference was used outside its owning mounted module',
      file: graph.file,
      fix: moduleRef === undefined
        ? undefined
        : 'use the mounted open-system handle for cross-module references',
    })
  }

  function getDefinition(node: TokenNode): VanityOverride {
    return overrides?.get(node.key) ?? node.definition
  }

  function enforceAcyclicResolution<Result>(node: TokenNode, compute: () => Result): Result {
    if (stack.includes(node.key)) {
      throw new VanityError({
        code: 'VANITY_TOKENS_CYCLE',
        message: `token derivation cycle: ${[...stack.slice(stack.indexOf(node.key)), node.key].join(' → ')}`,
        path: node.key,
        file: graph.file,
        fix: 'break the loop — one of these derivations must resolve to a value',
      })
    }

    stack.push(node.key)

    try {
      return compute()
    }
    finally {
      stack.pop()
    }
  }

  authoredValues = createAuthoredValueFolder(
    graph,
    () => resolver,
    getDefinition,
    enforceAcyclicResolution,
  )

  function foldNode(node: TokenNode, scheme: VanityScheme): VanityOklch {
    const css = authoredValues.foldDefault(node, scheme)
    const parsed = parseColor(css)

    if (!parsed)
      return resolver.invalidColor(`${node.key} holds '${css}', which is not a color`)

    return parsed
  }

  function resolveNode(node: TokenNode): NodeResult {
    const memoized = results.get(node.key)

    if (memoized)
      return memoized

    const result = enforceAcyclicResolution(node, () => computeNodeResult(node))
    results.set(node.key, result)
    return result
  }

  function computeNodeResult(node: TokenNode): NodeResult {
    const definition = getDefinition(node)
    if (definition.kind === 'none') {
      return {
        traits: { cssLive: false, volatile: node.contract.mutable, conditional: false },
        emitted: '',
      }
    }

    if (definition.kind === 'literal') {
      return {
        traits: { cssLive: false, volatile: false, conditional: false },
        emitted: String(definition.value),
      }
    }

    if (definition.kind === 'value') {
      const valueNode = valueNodeOf(definition.value)
      const reactive = valueNode.dependencies.length > 0
      return {
        traits: { cssLive: reactive, volatile: reactive, conditional: false },
        emitted: serializeTokenCss(graph, definition.value),
      }
    }

    if (definition.kind === 'contrast')
      return calculateContrastResult(node, definition.expr)

    const { expr } = definition
    const inner = getExpressionTraits(expr, resolver)
    const traits = inner

    if (node.contract.canonical && graph.support) {
      const missing = [...getColorRequirements(expr)].filter(feature => !graph.support!.features.has(feature))
      if (missing.length > 0) {
        throw new VanityError({
          code: 'VANITY_TOKENS_INVALID_COLOR',
          message: `${node.key} requires ${missing.join(', ')}, outside CSS support target "${graph.support.id}"`,
          path: node.key,
          file: graph.file,
          fix: 'author the referenced inputs with reference: \'val\', or choose a support target with a proven equivalent',
        })
      }
    }

    // A pure alias keeps the graph edge visible: always the `var()` reference.
    if (expr.kind === 'ref')
      return { traits, emitted: resolver.serializeRef?.(expr.handle) ?? readHandleVar(expr.handle) }

    const emitted = inner.cssLive || inner.volatile
      ? serializeExpr(expr, resolver)
      : formatOklch(foldExpr(expr, 'light', resolver))

    return { traits, emitted }
  }

  function calculateContrastResult(node: TokenNode, expr: Extract<VanityColorExpr, { kind: 'contrast' }>): NodeResult {
    const traits = getExpressionTraits(expr.target, resolver)
    const emitted = serializeContrastPick(expr, resolver)

    if (traits.volatile) {
      // The guarantee cannot be total over a live target, so keep the checked
      // authored-default pick. Chromium's experimental `contrast-color()`
      // implementation has made that result follow `color-scheme` even when
      // the target itself is scheme-invariant; that breaks an opaque
      // background/foreground pairing. Revisit a native upgrade once that
      // implementation is interoperable with the CSS Color 5 contract.
      return { traits, emitted }
    }

    const schemes: VanityScheme[] = traits.cssLive ? ['light', 'dark'] : ['light']

    for (const scheme of schemes) {
      const target = foldExpr(expr.target, scheme, resolver)
      const pick = pickLegible(target)

      if (Math.abs(pick.lc) < expr.contrast) {
        const where = traits.cssLive ? ` in scheme "${scheme}"` : ''
        diagnostics.push({
          code: 'VANITY_TOKENS_CONTRAST',
          message: `${node.key} / ${describeTarget(expr.target)} fails APCA Lc ${expr.contrast}${where}${context ? ` (${context})` : ''}`,
          detail: [`target (${scheme}) → ${formatOklch(target)}; best pairing ${pick.keyword} = Lc ${Math.abs(pick.lc).toFixed(1)}`],
          path: node.key,
          file: graph.file,
          fix: expr.explicitContrast
            ? 'adjust the target color — even the accepted threshold fails'
            : `adjust the target color, or accept explicitly: legibleOn(…, { contrast: ${Math.floor(Math.abs(pick.lc))} })`,
        })
      }
    }

    return { traits, emitted }
  }

  for (const node of graph.nodes.values())
    resolveNode(node)

  return { results, diagnostics }
}

/** Build-time representative projection shared by derivation fallback and checks. */
export function createAuthoredValueFolder(
  graph: TokenGraph,
  resolver: () => VanityResolver,
  getDefinition: (node: TokenNode) => VanityOverride,
  guard: <Result>(node: TokenNode, compute: () => Result) => Result = (_node, compute) => compute(),
) {
  function serializeValue(value: import('../values/types').VanitySelfValue): string {
    const context = createSerializeContext(
      graph.support ?? VANITY_DEFAULT_CSS_SUPPORT,
      (reference) => {
        if (reference.kind === 'token' && reference.path !== undefined) {
          const referenced = graph.nodes.get(reference.path)
          if (!referenced)
            return resolver().invalidColor(`${reference.path} does not belong to this token module`)
          return referenced.name
        }
        if (reference.name !== undefined)
          return reference.name
        return resolver().invalidColor('a reference has no final custom-property name')
      },
      undefined,
      graph.policies,
    )
    return context.serialize(value)
  }

  function foldValue(value: VanityCssValue, scheme: VanityScheme): string {
    const context = createSerializeContext(
      graph.support ?? VANITY_DEFAULT_CSS_SUPPORT,
      reference => reference.name ?? resolver().invalidColor('a reference has no custom-property name'),
      (reference) => {
        if (reference.kind !== 'token' || reference.path === undefined) {
          return resolver().invalidColor(
            `${reference.name ?? 'a custom property'} has no authored default value in this token module`,
          )
        }

        const referenced = graph.nodes.get(reference.path)
        if (!referenced)
          return resolver().invalidColor(`${reference.path} does not belong to this token module`)

        return foldDefault(referenced, scheme)
      },
      graph.policies,
    )

    return foldNumericCalculations(context.serialize(value))
  }

  function foldDefault(node: TokenNode, scheme: VanityScheme): string {
    return guard(node, () => {
      const definition = getDefinition(node)

      if (definition.kind === 'none')
        return resolver().invalidColor(`${node.key} has no authored default value`)
      if (definition.kind === 'literal')
        return String(definition.value)
      if (definition.kind === 'value')
        return foldValue(definition.value, scheme)

      return formatOklch(foldExpr(definition.expr, scheme, resolver()))
    })
  }

  return { foldDefault, foldValue, serializeValue }
}

/** Reduce only the closed, unitless arithmetic grammar inside build-time `calc()`. */
function foldNumericCalculations(css: string): string {
  let folded = css

  while (true) {
    const start = folded.lastIndexOf('calc(')
    if (start < 0)
      return folded

    let depth = 1
    let end = start + 5
    for (; end < folded.length && depth > 0; end++) {
      if (folded[end] === '(')
        depth++
      else if (folded[end] === ')')
        depth--
    }

    if (depth !== 0)
      return folded

    const expression = folded.slice(start + 5, end - 1)
    const value = evaluateNumericExpression(expression)
    if (value === undefined)
      return folded

    folded = `${folded.slice(0, start)}${formatNumber(value)}${folded.slice(end)}`
  }
}

function evaluateNumericExpression(expression: string): number | undefined {
  let cursor = 0
  const consumeWhitespace = () => {
    while (/\s/.test(expression[cursor] ?? ''))
      cursor++
  }
  const consume = (character: string): boolean => {
    consumeWhitespace()
    if (expression[cursor] !== character)
      return false
    cursor++
    return true
  }
  function parsePrimary(): number | undefined {
    consumeWhitespace()
    if (consume('+'))
      return parsePrimary()
    if (consume('-')) {
      const value = parsePrimary()
      return value === undefined ? undefined : -value
    }
    if (consume('(')) {
      const value = parseSum()
      return value === undefined || !consume(')') ? undefined : value
    }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(expression.slice(cursor))
    if (!match)
      return undefined
    cursor += match[0].length
    return Number(match[0])
  }
  function parseProduct(): number | undefined {
    let value = parsePrimary()
    if (value === undefined)
      return undefined
    while (true) {
      if (consume('*')) {
        const right = parsePrimary()
        if (right === undefined)
          return undefined
        value *= right
      }
      else if (consume('/')) {
        const right = parsePrimary()
        if (right === undefined || right === 0)
          return undefined
        value /= right
      }
      else {
        return value
      }
    }
  }
  function parseSum(): number | undefined {
    let value = parseProduct()
    if (value === undefined)
      return undefined
    while (true) {
      if (consume('+')) {
        const right = parseProduct()
        if (right === undefined)
          return undefined
        value += right
      }
      else if (consume('-')) {
        const right = parseProduct()
        if (right === undefined)
          return undefined
        value -= right
      }
      else {
        return value
      }
    }
  }

  const value = parseSum()
  consumeWhitespace()
  return value !== undefined && cursor === expression.length && Number.isFinite(value)
    ? value
    : undefined
}

function describeTarget(target: VanityColorExpr): string {
  return target.kind === 'ref' ? getNode(target.handle)?.key ?? 'its target' : 'its target'
}

/** Run authored contrast checks after graph resolution has established fold semantics. */
export function runTokenChecks(checks: readonly unknown[], graph: TokenGraph): VanityDiagnostic[] {
  const diagnostics: VanityDiagnostic[] = []

  for (const entry of checks) {
    if (!(entry instanceof TextContrastCheck))
      continue

    const text = toExpr(entry.text)
    const background = toExpr(entry.background)

    for (const scheme of ['light', 'dark'] as const) {
      const resolver = createTokenCheckResolver(graph, scheme)
      const textColor = foldExpr(text, scheme, resolver)
      const backgroundColor = foldExpr(background, scheme, resolver)
      const { algorithm, min } = entry.level
      const measured = algorithm === 'apca'
        ? Math.abs(measureApcaContrast(textColor, backgroundColor))
        : measureWcagContrast(textColor, backgroundColor)

      record({
        kind: 'contrast',
        file: graph.file,
        pairing: `${describeTarget(text)} on ${describeTarget(background)}`,
        scheme,
        algorithm,
        measured: Math.round(measured * 10) / 10,
        min,
        accepted: false,
      })

      if (measured < min) {
        diagnostics.push({
          code: 'VANITY_TOKENS_CONTRAST',
          message: `${describeTarget(text)} / ${describeTarget(background)} fails ${algorithm === 'apca' ? `APCA Lc ${min}` : `WCAG 2 ${min}:1`} in scheme "${scheme}"`,
          detail: [`text (${scheme}) → ${formatOklch(textColor)} on ${formatOklch(backgroundColor)} = ${algorithm === 'apca' ? `Lc ${measured.toFixed(1)}` : `${measured.toFixed(2)}:1`}`],
          file: graph.file,
          fix: 'adjust one endpoint of the pairing, or relax the check level deliberately',
        })
      }
    }
  }

  return diagnostics
}

/** Create the no-cycle resolver used by authored checks and introspection. */
export function createTokenCheckResolver(graph: TokenGraph, scheme: VanityScheme): VanityResolver {
  let resolver: VanityResolver
  const authoredValues = createAuthoredValueFolder(graph, () => resolver, node => node.definition)

  resolver = {
    foldRef: (handle) => {
      const node = getNode(handle)
      if (!node)
        return resolver.invalidColor('a referenced token does not belong to this token module')
      const css = authoredValues.foldDefault(node, scheme)
      const parsed = parseColor(css)
      if (!parsed)
        return resolver.invalidColor(`${node.key} holds '${css}', which is not a color`)
      return parsed
    },
    foldValue: value => authoredValues.foldValue(value, scheme),
    serializeValue: value => authoredValues.serializeValue(value),
    refTraits: (handle) => {
      const node = getNode(handle)
      const result = node === undefined ? undefined : graph.results.get(node.key)
      return result?.traits ?? { cssLive: false, volatile: false, conditional: false }
    },
    invalidColor: (detail) => {
      throw new VanityError({ code: 'VANITY_TOKENS_INVALID_COLOR', message: `a check cannot resolve: ${detail}`, file: graph.file })
    },
  }

  return resolver
}
