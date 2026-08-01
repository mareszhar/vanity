/**
 * The three passes over a color expression, all driven by one classification
 * ([patterns.md §3]):
 *
 * - `exprTraits` — is the expression live CSS (`cssLive`), and can a runtime
 *   write change it (`volatile`)?
 * - `foldExpr` — build-time math, computing exactly what the live serialization
 *    would ask the browser to compute (live inputs fold to their defaults).
 * - `serializeExpr` — the live CSS form: relative color syntax, `color-mix()`,
 *   `light-dark()`. Graph edges stay `var()` references; anonymous static
 *   subtrees fold, so the emitted CSS is as boring as it can be.
 *
 * Graph concerns (cycles, per-token memoization, overrides) stay in the
 * resolver callbacks, so token overrides can re-resolve with substitutions.
 */

import type { VanityRuntimeHandle, VanityTokenMode } from '../internal/handle'
import type { VanitySerializeContext } from '../values/protocol'
import type { VanityCssValue } from '../values/types'
import type { VanityChannelOperation, VanityColorChannel, VanityColorExpr } from './color'
import type { VanityOklch } from './math'
import { ExpressionValue, inputNode, nodeOf, serializeSelf } from '../values/protocol'
import { formatNumber, formatOklch, mixOklch, parseColor, pickLegible } from './math'

export type VanityScheme = 'light' | 'dark'

export interface VanityExprTraits {
  /** Must be emitted as a live CSS expression (scheme pairs or live inputs). */
  cssLive: boolean
  /** A runtime write can change it — some `.live()` input sits upstream. */
  volatile: boolean
  /** The expression itself selects a light/dark branch. */
  conditional: boolean
}

export interface VanityResolver {
  /** Fold a graph edge to its per-scheme build value (cycle-guarded by the graph). */
  foldRef: (handle: VanityRuntimeHandle, scheme: VanityScheme) => VanityOklch
  /** Classify a graph edge (cycle-guarded by the graph). */
  refTraits: (handle: VanityRuntimeHandle) => VanityExprTraits
  /** Reject a non-color value with a diagnostic naming the offending token. */
  invalidColor: (detail: string) => never
  /** Choose a token's declared val/var projection at a graph edge. */
  serializeRef?: (handle: VanityRuntimeHandle) => string
  /** Serialize a value expression with token refs replaced by authored defaults. */
  foldValue?: (value: import('../values/types').VanityCssValue, scheme: VanityScheme) => string
  /** Serialize a value expression with semantic token paths rebound to this graph. */
  serializeValue?: (value: import('../values/types').VanitySelfValue) => string
}

// ─── Classification ──────────────────────────────────────────────────────────

export function exprTraits(expr: VanityColorExpr, resolver: VanityResolver): VanityExprTraits {
  switch (expr.kind) {
    case 'oklch':
    case 'parse':
      return { cssLive: false, volatile: false, conditional: false }
    case 'value': {
      const node = nodeOf(expr.value)
      const dependency = node.dependencies.length > 0
      return {
        cssLive: dependency || preservesNative(node),
        volatile: dependency,
        conditional: false,
      }
    }
    case 'scheme': {
      const inner = join(exprTraits(expr.light, resolver), exprTraits(expr.dark, resolver))
      return { cssLive: true, volatile: inner.volatile, conditional: true }
    }
    case 'ref':
      return resolver.refTraits(expr.handle)
    case 'alpha':
    case 'adjust':
      return exprTraits(expr.input, resolver)
    case 'channels': {
      const inner = exprTraits(expr.input, resolver)
      const channelValues = Object.values(expr.channels).flatMap(value =>
        isChannelExpression(value) ? value.operations.map(operation => operation.value) : value,
      )
      const dynamic = channelValues.some(value => value !== undefined && typeof value !== 'number')
      const volatile = channelValues.some((value) => {
        if (!value || (typeof value !== 'object' && typeof value !== 'function'))
          return false
        return inputNode(value as never).dependencies.length > 0
      })
      return { cssLive: inner.cssLive || dynamic, volatile: inner.volatile || volatile, conditional: inner.conditional }
    }
    case 'relative': {
      const inner = exprTraits(expr.input, resolver)
      const values = [...expr.channels, expr.alpha].flatMap(value =>
        isChannelExpression(value) ? value.operations.map(operation => operation.value) : value,
      )
      const volatile = values.some((value) => {
        if (!value || (typeof value !== 'object' && typeof value !== 'function'))
          return false
        return inputNode(value as never).dependencies.length > 0
      })
      return { cssLive: true, volatile: inner.volatile || volatile, conditional: inner.conditional }
    }
    case 'mix': {
      const inner = join(exprTraits(expr.input, resolver), exprTraits(expr.other, resolver))
      return { ...inner, cssLive: inner.cssLive || expr.space !== 'oklab' || expr.hue !== undefined }
    }
    case 'contrast':
      return exprTraits(expr.target, resolver)
  }
}

function preservesNative(node: import('../values/protocol').VanityExpressionNode): boolean {
  switch (node.kind) {
    case 'raw':
      return true
    case 'plugin':
      return node.fold === undefined
    case 'function':
      return node.values.some(preservesNative)
    case 'operation':
      return preservesNative(node.left) || preservesNative(node.right)
    case 'var':
      return true
    case 'composite':
      return node.parts.some(part => typeof part !== 'string' && preservesNative(part))
    case 'literal':
      return false
  }
}

function join(a: VanityExprTraits, b: VanityExprTraits): VanityExprTraits {
  return {
    cssLive: a.cssLive || b.cssLive,
    volatile: a.volatile || b.volatile,
    conditional: a.conditional || b.conditional,
  }
}

/** The traits a token contributes at a reference site, read off its resolved mode. */
export function modeTraits(mode: VanityTokenMode): VanityExprTraits {
  switch (mode) {
    case 'static':
      return { cssLive: false, volatile: false, conditional: false }
    case 'scheme':
      return { cssLive: true, volatile: false, conditional: true }
    case 'live':
      return { cssLive: false, volatile: true, conditional: false }
    case 'derived':
      return { cssLive: true, volatile: true, conditional: false }
  }
}

/**
 * Whether a legible pairing sits anywhere in the tree. `legibleOn` is graph
 * knowledge — the check needs both endpoints at build time — so positions
 * outside the graph (rule values, port defaults) reject it with a diagnostic.
 */
export function containsContrast(expr: VanityColorExpr): boolean {
  switch (expr.kind) {
    case 'oklch':
    case 'parse':
    case 'value':
    case 'ref':
      return false
    case 'contrast':
      return true
    case 'alpha':
    case 'adjust':
    case 'channels':
    case 'relative':
      return containsContrast(expr.input)
    case 'mix':
      return containsContrast(expr.input) || containsContrast(expr.other)
    case 'scheme':
      return containsContrast(expr.light) || containsContrast(expr.dark)
  }
}

/** Collect the token paths an expression references — the graph edges, for introspection. */
export function collectRefs(expr: VanityColorExpr, into: Set<string>): void {
  switch (expr.kind) {
    case 'oklch':
    case 'parse':
      return
    case 'value':
      for (const reference of nodeOf(expr.value).dependencies) {
        if (reference.path)
          into.add(reference.path)
      }
      return
    case 'ref':
      into.add(expr.handle.path)
      return
    case 'alpha':
    case 'adjust':
    case 'channels':
    case 'relative':
      collectRefs(expr.input, into)
      return
    case 'mix':
      collectRefs(expr.input, into)
      collectRefs(expr.other, into)
      return
    case 'scheme':
      collectRefs(expr.light, into)
      collectRefs(expr.dark, into)
      return
    case 'contrast':
      collectRefs(expr.target, into)
  }
}

function containsRef(expr: VanityColorExpr): boolean {
  switch (expr.kind) {
    case 'oklch':
    case 'parse':
      return false
    case 'value':
      return nodeOf(expr.value).dependencies.length > 0
    case 'ref':
      return true
    case 'alpha':
    case 'adjust':
    case 'channels':
    case 'relative':
      return containsRef(expr.input)
    case 'mix':
      return containsRef(expr.input) || containsRef(expr.other)
    case 'scheme':
      return containsRef(expr.light) || containsRef(expr.dark)
    case 'contrast':
      return containsRef(expr.target)
  }
}

// ─── Build-time folding ──────────────────────────────────────────────────────

export function foldExpr(expr: VanityColorExpr, scheme: VanityScheme, resolver: VanityResolver): VanityOklch {
  switch (expr.kind) {
    case 'oklch': {
      const { l, c, h, alpha } = expr
      return { l, c, h, ...(alpha === undefined ? {} : { alpha }) }
    }
    case 'parse': {
      const parsed = parseColor(expr.css)

      if (!parsed)
        return resolver.invalidColor(`'${expr.css}' is not a color`)

      return parsed
    }
    case 'value': {
      const css = resolver.foldValue?.(expr.value, scheme) ?? serializeSelf(expr.value)
      const parsed = parseColor(css)
      if (!parsed)
        return resolver.invalidColor(`'${css}' cannot be folded as a color`)
      return parsed
    }
    case 'ref':
      return resolver.foldRef(expr.handle, scheme)
    case 'alpha':
      return { ...foldExpr(expr.input, scheme, resolver), alpha: expr.amount }
    case 'adjust': {
      const input = foldExpr(expr.input, scheme, resolver)
      // The formula is the serialization's `calc()`, verbatim — no clamping the
      // browser wouldn't do, so folded and live ramps agree to the rounding digit.
      return { ...input, [expr.channel]: input[expr.channel] + expr.delta }
    }
    case 'channels': {
      const input = foldExpr(expr.input, scheme, resolver)
      return {
        l: applyChannel(input.l, expr.channels.l, scheme, resolver),
        c: applyChannel(input.c, expr.channels.c, scheme, resolver),
        h: applyChannel(input.h, expr.channels.h, scheme, resolver),
        ...('alpha' in input || expr.channels.alpha !== undefined
          ? { alpha: applyChannel(input.alpha ?? 1, expr.channels.alpha, scheme, resolver) }
          : {}),
      }
    }
    case 'relative':
      return resolver.invalidColor(
        `${expr.function}(from …) is a live relative color and cannot be folded to one build-time color`,
      )
    case 'mix':
      return mixOklch(foldExpr(expr.input, scheme, resolver), foldExpr(expr.other, scheme, resolver), expr.amount)
    case 'scheme':
      return foldExpr(scheme === 'light' ? expr.light : expr.dark, scheme, resolver)
    case 'contrast':
      return pickLegible(foldExpr(expr.target, scheme, resolver)).color
  }
}

// ─── Live serialization ──────────────────────────────────────────────────────

export function serializeExpr(expr: VanityColorExpr, resolver: VanityResolver, context?: VanitySerializeContext): string {
  const traits = exprTraits(expr, resolver)

  // An anonymous static subtree folds — graph edges stay `var()` references.
  if (!traits.cssLive && !traits.volatile && !containsRef(expr))
    return formatOklch(foldExpr(expr, 'light', resolver))

  switch (expr.kind) {
    case 'oklch':
    case 'parse':
      return formatOklch(foldExpr(expr, 'light', resolver)) // unreachable via the fold above; kept total
    case 'value':
      return resolver.serializeValue?.(expr.value)
        ?? (context ? context.serialize(expr.value) : serializeSelf(expr.value))
    case 'ref':
      return resolver.serializeRef?.(expr.handle) ?? expr.handle.var
    case 'alpha':
      return `oklch(from ${serializeExpr(expr.input, resolver, context)} l c h / ${formatNumber(expr.amount)})`
    case 'adjust':
      return serializeAdjust(expr, resolver, context)
    case 'channels':
      return serializeChannels(expr, resolver, context)
    case 'relative':
      return serializeRelative(expr, resolver, context)
    case 'mix': {
      const amount = formatNumber(expr.amount * 100)
      const hue = expr.hue ? ` ${expr.hue} hue` : ''
      return `color-mix(in ${expr.space}${hue}, ${serializeExpr(expr.input, resolver, context)}, ${serializeExpr(expr.other, resolver, context)} ${amount}%)`
    }
    case 'scheme':
      return `light-dark(${serializeExpr(expr.light, resolver, context)}, ${serializeExpr(expr.dark, resolver, context)})`
    case 'contrast':
      // Mid-expression, a legible pairing contributes its computed pick. A
      // token's own value follows the same fallback unless a future graph
      // enhancement proves a native upgrade interoperable.
      return serializeContrastPick(expr, resolver)
  }
}

function applyChannel(
  current: number,
  operation: VanityColorChannel | VanityChannelOperation | undefined,
  scheme: VanityScheme,
  resolver: VanityResolver,
): number {
  if (operation === undefined)
    return current
  if (typeof operation === 'number')
    return operation
  if (operation === 'none')
    return resolver.invalidColor('a missing relative-color channel has no numeric authored default')
  if (!isChannelExpression(operation))
    return foldChannelValue(operation, scheme, resolver)
  let result = current
  for (const step of operation.operations) {
    const value = foldChannelValue(step.value, scheme, resolver)
    switch (step.kind) {
      case 'set':
        result = value
        break
      case 'add':
        result += value
        break
      case 'subtract':
        result -= value
        break
      case 'multiply':
        result *= value
        break
      case 'divide':
        result /= value
        break
    }
  }
  return result
}

function foldChannelValue(
  value: VanityColorChannel,
  scheme: VanityScheme,
  resolver: VanityResolver,
): number {
  if (typeof value === 'number')
    return value
  if (value === 'none')
    return resolver.invalidColor('a missing relative-color channel has no numeric authored default')

  const css = typeof value === 'string'
    ? value
    : resolver.foldValue?.(value as VanityCssValue, scheme) ?? serializeSelf(value)
  const match = /^(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%|deg|grad|rad|turn)?$/i.exec(css.trim())

  if (!match)
    return resolver.invalidColor(`relative-color channel '${css}' has no numeric authored default`)

  const number = Number(match[1])
  switch (match[2]?.toLowerCase()) {
    case '%': return number / 100
    case 'grad': return number * 0.9
    case 'rad': return number * 180 / Math.PI
    case 'turn': return number * 360
    default: return number
  }
}

function serializeChannels(
  expr: Extract<VanityColorExpr, { kind: 'channels' }>,
  resolver: VanityResolver,
  context?: VanitySerializeContext,
): string {
  const channelText = (input: VanityColorChannel): string => {
    if (typeof input === 'number')
      return formatNumber(input)
    if (input === 'none')
      return input
    if ((typeof input === 'object' || typeof input === 'function') && input !== null) {
      const value = new ExpressionValue(inputNode(input))
      if (resolver.serializeValue)
        return resolver.serializeValue(value)
      return context ? context.serialize(value) : serializeSelf(value)
    }
    return context ? context.serialize(input) : serializeSelf(input)
  }
  const value = (name: 'l' | 'c' | 'h' | 'alpha', operation: VanityColorChannel | VanityChannelOperation | undefined): string => {
    if (operation === undefined)
      return name
    if (typeof operation === 'number' || operation === 'none' || !isChannelExpression(operation))
      return channelText(operation)
    let expression: string = name
    let calculates = false
    operation.operations.forEach((step, index) => {
      if (step.kind === 'set') {
        expression = channelText(step.value)
        return
      }
      const operator = step.kind === 'add' ? '+' : step.kind === 'subtract' ? '-' : step.kind === 'multiply' ? '*' : '/'
      expression = `${index === 0 ? expression : `(${expression})`} ${operator} ${channelText(step.value)}`
      calculates = true
    })
    return calculates ? `calc(${expression})` : expression
  }

  const { channels } = expr
  const alpha = channels.alpha === undefined ? '' : ` / ${value('alpha', channels.alpha)}`
  return `oklch(from ${serializeExpr(expr.input, resolver, context)} ${value('l', channels.l)} ${value('c', channels.c)} ${value('h', channels.h)}${alpha})`
}

function serializeRelative(
  expr: Extract<VanityColorExpr, { kind: 'relative' }>,
  resolver: VanityResolver,
  context?: VanitySerializeContext,
): string {
  const channelText = (input: VanityColorChannel): string => {
    if (typeof input === 'number')
      return formatNumber(input)
    if (input === 'none')
      return input
    if ((typeof input === 'object' || typeof input === 'function') && input !== null) {
      const value = new ExpressionValue(inputNode(input))
      if (resolver.serializeValue)
        return resolver.serializeValue(value)
      return context ? context.serialize(value) : serializeSelf(value)
    }
    return context ? context.serialize(input) : serializeSelf(input)
  }
  const value = (
    name: string,
    operation: VanityColorChannel | VanityChannelOperation | undefined,
  ): string => {
    if (operation === undefined)
      return name
    if (typeof operation === 'number' || operation === 'none' || !isChannelExpression(operation))
      return channelText(operation)
    let expression = name
    let calculates = false
    operation.operations.forEach((step, index) => {
      if (step.kind === 'set') {
        expression = channelText(step.value)
        return
      }
      const operator = step.kind === 'add'
        ? '+'
        : step.kind === 'subtract'
          ? '-'
          : step.kind === 'multiply' ? '*' : '/'
      expression = `${index === 0 ? expression : `(${expression})`} ${operator} ${channelText(step.value)}`
      calculates = true
    })
    return calculates ? `calc(${expression})` : expression
  }
  const channels = expr.channelNames.map((name, index) => value(name, expr.channels[index]))
  const alpha = expr.alpha === undefined ? '' : ` / ${value('alpha', expr.alpha)}`
  const head = expr.function === 'color'
    ? `color(from ${serializeExpr(expr.input, resolver, context)} ${expr.space}`
    : `${expr.function}(from ${serializeExpr(expr.input, resolver, context)}`
  return `${head} ${channels.join(' ')}${alpha})`
}

function isChannelExpression(value: unknown): value is VanityChannelOperation {
  return typeof value === 'object' && value !== null
    && (value as VanityChannelOperation).kind === 'channel-expression'
    && Array.isArray((value as VanityChannelOperation).operations)
}

function serializeAdjust(expr: Extract<VanityColorExpr, { kind: 'adjust' }>, resolver: VanityResolver, context?: VanitySerializeContext): string {
  const input = serializeExpr(expr.input, resolver, context)
  const delta = expr.delta >= 0 ? `+ ${formatNumber(expr.delta)}` : `- ${formatNumber(-expr.delta)}`
  const parts = ['l', 'c', 'h'].map(channel => channel === expr.channel ? `calc(${channel} ${delta})` : channel)
  return `oklch(from ${input} ${parts.join(' ')})`
}

/** The build-computed white/black pick, `light-dark()`-paired when the schemes disagree. */
export function serializeContrastPick(
  expr: Extract<VanityColorExpr, { kind: 'contrast' }>,
  resolver: VanityResolver,
): string {
  const light = pickLegible(foldExpr(expr.target, 'light', resolver))
  const dark = pickLegible(foldExpr(expr.target, 'dark', resolver))
  return light.keyword === dark.keyword ? light.keyword : `light-dark(${light.keyword}, ${dark.keyword})`
}
