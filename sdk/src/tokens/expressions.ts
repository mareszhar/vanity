/**
 * The three passes over a color expression, all driven by one classification
 * ([patterns.md §3]):
 *
 * - `getExpressionTraits` — is the expression live CSS (`cssLive`), and can a runtime
 *   write change it (`volatile`)?
 * - `foldExpr` — build-time math, computing exactly what the live serialization
 *    would ask the browser to compute (live inputs fold to their defaults).
 * - `serializeExpr` — the live CSS form: relative color syntax, `color-mix()`,
 *   `light-dark()`. Graph edges stay `var()` references; anonymous static
 *   subtrees fold, so the emitted CSS is as boring as it can be.
 *
 * Graph concerns (cycles, per-token memoization, substitutions) stay in the
 * resolver callbacks, so scoped declaration data can re-resolve with new
 * token values.
 */

import type { VanityResolvedPolicies } from '../values/policies'
import type { VanitySerializeContext } from '../values/protocol'
import type { VanityCssValue } from '../values/types'
import type { VanityChannelOperation, VanityColorChannel, VanityColorExpr } from './color'
import type { VanityInternalTokenHandle } from './handle'
import type { VanityContrastPick, VanityOklch } from './math'
import type { VanityPolarColorSpace } from './types'
import { createInputNode, ExpressionValue, getNode, serializeSelf } from '../values/protocol'
import { readHandlePath, readHandleVar } from './handle'
import {
  applyOklchAdjustment,
  canFoldColorAdjustmentInSpace,
  formatColorInSpace,
  formatNumber,
  formatOklch,
  getAuthoredPolarColorSpace,
  mixOklch,
  parseColor,
  pickLegible,
  preserveColorAdjustment,
  preserveColorAlpha,
} from './math'

export type VanityScheme = 'light' | 'dark'

export interface VanityExprTraits {
  /** Must be emitted as a live CSS expression (scheme pairs or live inputs). */
  cssLive: boolean
  /** A runtime write can change it — some `.live()` input sits upstream. */
  volatile: boolean
  /** The expression itself selects a light/dark branch. */
  conditional: boolean
}

const BROWSER_REACTIVE_SYNTAX = /\b(?:var|env|currentColor|light-dark|color-mix)\s*\(/i

/** Return whether a serialized value asks the browser to resolve a live value. */
export function hasBrowserReactiveSyntax(value: string): boolean {
  return BROWSER_REACTIVE_SYNTAX.test(value)
}

export interface VanityResolver {
  /** Fold a graph edge to its per-scheme build value (cycle-guarded by the graph). */
  foldRef: (handle: VanityInternalTokenHandle, scheme: VanityScheme) => VanityOklch
  /**
   * Resolve a graph edge used as a `legibleOn()` target. Unlike `foldRef`, this
   * path can carry the representative approximation through a referenced
   * color expression that CSS can evaluate but Vanity does not fold exactly.
   */
  foldRefForContrast: (
    handle: VanityInternalTokenHandle,
    scheme: VanityScheme,
  ) => VanityContrastTargetResolution
  /** Classify a graph edge (cycle-guarded by the graph). */
  getRefTraits: (handle: VanityInternalTokenHandle) => VanityExprTraits
  /** Reject an invalid color value with a diagnostic naming the offending token. */
  invalidColor: (detail: string, fix?: string) => never
  /** Choose a token's declared val/var projection at a graph edge. */
  serializeRef?: (handle: VanityInternalTokenHandle) => string
  /** Serialize a value expression with token refs replaced by authored defaults. */
  foldValue?: (value: import('../values/types').VanityCssValue, scheme: VanityScheme) => string
  /** Serialize a value expression with semantic token paths rebound to this graph. */
  serializeValue?: (value: import('../values/types').VanitySelfValue) => string
  /** Policy defaults available to graph-aware color expressions. */
  policies?: Pick<VanityResolvedPolicies, 'color'>
}

// ─── Classification ──────────────────────────────────────────────────────────

export function getExpressionTraits(
  expr: VanityColorExpr,
  resolver: VanityResolver,
  context?: VanitySerializeContext,
): VanityExprTraits {
  switch (expr.kind) {
    case 'oklch':
    case 'parse':
      return { cssLive: false, volatile: false, conditional: false }
    case 'value': {
      const node = getNode(expr.value)
      const dependency = node.dependencies.length > 0
      return {
        cssLive: dependency || shouldPreserveNativeNode(node),
        volatile: dependency,
        conditional: false,
      }
    }
    case 'scheme': {
      const inner = join(getExpressionTraits(expr.light, resolver, context), getExpressionTraits(expr.dark, resolver, context))
      return { cssLive: true, volatile: inner.volatile, conditional: true }
    }
    case 'ref':
      return resolver.getRefTraits(expr.handle)
    case 'alpha': {
      const inner = getExpressionTraits(expr.input, resolver, context)
      return inner
    }
    case 'adjust': {
      const inner = getExpressionTraits(expr.input, resolver, context)
      const space = getAdjustmentSpace(expr, resolver, context)
      return { ...inner, cssLive: inner.cssLive || !canFoldAdjustment(expr, space, resolver, context) }
    }
    case 'channels': {
      const inner = getExpressionTraits(expr.input, resolver, context)
      const channelValues = Object.values(expr.channels).flatMap(value =>
        isChannelExpression(value) ? value.operations.map(operation => operation.value) : value,
      )
      const dynamic = channelValues.some(value => value !== undefined && typeof value !== 'number')
      const volatile = channelValues.some((value) => {
        if (!value || (typeof value !== 'object' && typeof value !== 'function'))
          return false
        return createInputNode(value as never).dependencies.length > 0
      })
      return { cssLive: inner.cssLive || dynamic, volatile: inner.volatile || volatile, conditional: inner.conditional }
    }
    case 'relative': {
      const inner = getExpressionTraits(expr.input, resolver, context)
      const values = [...expr.channels, expr.alpha].flatMap(value =>
        isChannelExpression(value) ? value.operations.map(operation => operation.value) : value,
      )
      const volatile = values.some((value) => {
        if (!value || (typeof value !== 'object' && typeof value !== 'function'))
          return false
        return createInputNode(value as never).dependencies.length > 0
      })
      return { cssLive: true, volatile: inner.volatile || volatile, conditional: inner.conditional }
    }
    case 'mix': {
      const inner = join(getExpressionTraits(expr.input, resolver, context), getExpressionTraits(expr.other, resolver, context))
      const percentages = [expr.inputPercentage, expr.otherPercentage]
      const volatile = percentages.some((value) => {
        if (value === undefined || typeof value === 'number')
          return false
        return createInputNode(value as never).dependencies.length > 0
      })
      return {
        ...inner,
        cssLive: inner.cssLive || !isMixShapeFoldable(expr),
        volatile: inner.volatile || volatile,
      }
    }
    case 'contrast':
      return getExpressionTraits(expr.target, resolver, context)
  }
}

function shouldPreserveNativeNode(node: import('../values/protocol').VanityExpressionNode): boolean {
  switch (node.kind) {
    case 'raw':
      return true
    case 'plugin':
      return node.fold === undefined
    case 'function':
      return node.values.some(shouldPreserveNativeNode)
    case 'operation':
      return shouldPreserveNativeNode(node.left) || shouldPreserveNativeNode(node.right)
    case 'var':
      return true
    case 'composite':
      return node.parts.some(part => typeof part !== 'string' && shouldPreserveNativeNode(part))
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

type VanityMixExpr = Extract<VanityColorExpr, { kind: 'mix' }>

/**
 * Whether CSS determines both mix weights without applying its alpha
 * multiplier. A build fold is safe for the default split, either omitted
 * percentage, or two percentages that already sum to 100%.
 */
export function isMixShapeFoldable(expr: VanityMixExpr): boolean {
  if (expr.space !== 'oklab' || expr.hue !== undefined)
    return false
  const input = expr.inputPercentage
  const other = expr.otherPercentage
  if (input === undefined && other === undefined)
    return true
  if (input === undefined)
    return typeof other === 'number'
  if (other === undefined)
    return typeof input === 'number'
  return typeof input === 'number'
    && typeof other === 'number'
    && input + other === 100
}

function getMixAmount(expr: VanityMixExpr): number | undefined {
  if (!isMixShapeFoldable(expr))
    return undefined
  if (expr.inputPercentage === undefined && expr.otherPercentage === undefined)
    return 0.5
  if (expr.inputPercentage === undefined)
    return (expr.otherPercentage as number) / 100
  if (expr.otherPercentage === undefined)
    return (100 - (expr.inputPercentage as number)) / 100
  return (expr.otherPercentage as number) / 100
}

/** The result of resolving one contrast target for its build-time pick. */
export interface VanityContrastTargetResolution {
  readonly color: VanityOklch
  /** True when the color is a representative rather than an exact fold. */
  readonly approximate: boolean
}

/** Both scheme readings and picks used by one `legibleOn()` result. */
export interface VanityContrastResolution {
  readonly lightTarget: VanityOklch
  readonly darkTarget: VanityOklch
  readonly light: VanityContrastPick
  readonly dark: VanityContrastPick
  /** Schemes whose target used the documented representative fallback. */
  readonly fallbackSchemes: readonly VanityScheme[]
  /** Stable provenance wording shared by explain() and audit(). */
  readonly fallbackReason?: typeof CONTRAST_FALLBACK_REASON
}

const CONTRAST_FALLBACK_REASON = 'representative approximation of an unfoldable color target'

function serializeMixPercentage(
  value: VanityMixExpr['inputPercentage'],
  context?: VanitySerializeContext,
): string {
  if (value === undefined)
    return ''
  const css = typeof value === 'number'
    ? `${Object.is(value, -0) ? 0 : value}%`
    : context
      ? context.serialize(value)
      : serializeSelf(value)
  return ` ${css}`
}

/** The traits a token contributes at a reference site, read off its resolved mode. */
/**
 * Whether a legible pairing sits anywhere in the tree. `legibleOn` is graph
 * knowledge — the check needs both endpoints at build time — so positions
 * outside the graph (rule values, port defaults) reject it with a diagnostic.
 */
export function hasContrastExpression(expr: VanityColorExpr): boolean {
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
      return hasContrastExpression(expr.input)
    case 'mix':
      return hasContrastExpression(expr.input) || hasContrastExpression(expr.other)
    case 'scheme':
      return hasContrastExpression(expr.light) || hasContrastExpression(expr.dark)
  }
}

/** Collect the token paths an expression references — the graph edges, for introspection. */
export function collectRefs(expr: VanityColorExpr, into: Set<string>): void {
  switch (expr.kind) {
    case 'oklch':
    case 'parse':
      return
    case 'value':
      for (const reference of getNode(expr.value).dependencies) {
        if (reference.path)
          into.add(reference.path)
      }
      return
    case 'ref':
      into.add(readHandlePath(expr.handle))
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
      for (const percentage of [expr.inputPercentage, expr.otherPercentage]) {
        if (percentage === undefined || typeof percentage === 'number')
          continue
        for (const reference of createInputNode(percentage as never).dependencies) {
          if (reference.path)
            into.add(reference.path)
        }
      }
      return
    case 'scheme':
      collectRefs(expr.light, into)
      collectRefs(expr.dark, into)
      return
    case 'contrast':
      collectRefs(expr.target, into)
  }
}

function hasColorReference(expr: VanityColorExpr): boolean {
  switch (expr.kind) {
    case 'oklch':
    case 'parse':
      return false
    case 'value':
      return getNode(expr.value).dependencies.length > 0
    case 'ref':
      return true
    case 'alpha':
    case 'adjust':
    case 'channels':
    case 'relative':
      return hasColorReference(expr.input)
    case 'mix':
      return hasColorReference(expr.input) || hasColorReference(expr.other)
    case 'scheme':
      return hasColorReference(expr.light) || hasColorReference(expr.dark)
    case 'contrast':
      return hasColorReference(expr.target)
  }
}

// ─── Build-time folding ──────────────────────────────────────────────────────

export function foldExpr(
  expr: VanityColorExpr,
  scheme: VanityScheme,
  resolver: VanityResolver,
  context?: VanitySerializeContext,
): VanityOklch {
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
    case 'alpha': {
      return { ...foldExpr(expr.input, scheme, resolver, context), alpha: expr.amount }
    }
    case 'adjust': {
      const space = getAdjustmentSpace(expr, resolver, context)
      if (space === undefined)
        return resolver.invalidColor(describeMissingAdjustmentSpace('channel adjustment'), describeMissingAdjustmentSpaceFix())
      const input = foldExpr(expr.input, scheme, resolver, context)
      // The formula is the serialization's `calc()`, verbatim — no clamping the
      // browser wouldn't do, so folded and live ramps agree to the rounding digit.
      try {
        return applyOklchAdjustment(input, space, expr.channel, expr.delta)
      }
      catch (error) {
        return resolver.invalidColor(error instanceof Error ? error.message : `cannot adjust a color in ${space}`)
      }
    }
    case 'channels': {
      const input = foldExpr(expr.input, scheme, resolver, context)
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
    case 'mix': {
      if (expr.space === undefined)
        return resolver.invalidColor(describeMissingInterpolationSpace(), describeMissingInterpolationSpaceFix())
      const amount = getMixAmount(expr)
      if (amount === undefined) {
        return resolver.invalidColor(
          'colorMix() can fold only an oklab interpolation without a hue path, with both percentages omitted, one percentage omitted, or percentages that sum to 100',
        )
      }
      return mixOklch(foldExpr(expr.input, scheme, resolver, context), foldExpr(expr.other, scheme, resolver, context), amount)
    }
    case 'scheme':
      return foldExpr(scheme === 'light' ? expr.light : expr.dark, scheme, resolver, context)
    case 'contrast':
      return pickLegible(foldContrastTarget(expr.target, scheme, resolver, context).color).color
  }
}

/**
 * Resolve a contrast target without turning a deliberate color-fold refusal
 * into a hard failure. Exact expressions use the same math as `foldExpr`;
 * an explicit color-mix() shape that CSS can evaluate but Vanity does not
 * claim to reproduce is represented with the oklab approximation used by the
 * contrast picker. Invalid colors still travel through `invalidColor`.
 */
export function foldContrastTarget(
  expr: VanityColorExpr,
  scheme: VanityScheme,
  resolver: VanityResolver,
  context?: VanitySerializeContext,
): VanityContrastTargetResolution {
  switch (expr.kind) {
    case 'alpha': {
      const input = foldContrastTarget(expr.input, scheme, resolver, context)
      return {
        color: { ...input.color, alpha: expr.amount },
        approximate: input.approximate,
      }
    }
    case 'adjust': {
      const space = getAdjustmentSpace(expr, resolver, context)
      if (space === undefined)
        return { color: foldExpr(expr, scheme, resolver, context), approximate: false }
      const input = foldContrastTarget(expr.input, scheme, resolver, context)
      try {
        return {
          color: applyOklchAdjustment(input.color, space, expr.channel, expr.delta),
          approximate: input.approximate,
        }
      }
      catch (error) {
        return {
          color: resolver.invalidColor(error instanceof Error ? error.message : `cannot adjust a color in ${space}`),
          approximate: false,
        }
      }
    }
    case 'channels': {
      const input = foldContrastTarget(expr.input, scheme, resolver, context)
      return {
        color: {
          l: applyChannel(input.color.l, expr.channels.l, scheme, resolver),
          c: applyChannel(input.color.c, expr.channels.c, scheme, resolver),
          h: applyChannel(input.color.h, expr.channels.h, scheme, resolver),
          ...('alpha' in input.color || expr.channels.alpha !== undefined
            ? { alpha: applyChannel(input.color.alpha ?? 1, expr.channels.alpha, scheme, resolver) }
            : {}),
        },
        approximate: input.approximate,
      }
    }
    case 'mix': {
      if (expr.space === undefined) {
        return {
          color: resolver.invalidColor(describeMissingInterpolationSpace(), describeMissingInterpolationSpaceFix()),
          approximate: false,
        }
      }

      const input = foldContrastTarget(expr.input, scheme, resolver, context)
      const other = foldContrastTarget(expr.other, scheme, resolver, context)
      const amount = getMixAmount(expr)
      if (amount !== undefined) {
        return {
          color: mixOklch(input.color, other.color, amount),
          approximate: input.approximate || other.approximate,
        }
      }

      const representative = getRepresentativeMixAmount(expr)
      if (representative === undefined)
        return { color: foldExpr(expr, scheme, resolver, context), approximate: false }

      const mixed = mixOklch(input.color, other.color, representative.amount)
      const alpha = (mixed.alpha ?? 1) * representative.alphaScale
      return {
        color: {
          l: mixed.l,
          c: mixed.c,
          h: mixed.h,
          ...(alpha === 1 ? {} : { alpha }),
        },
        approximate: true,
      }
    }
    case 'scheme':
      return foldContrastTarget(scheme === 'light' ? expr.light : expr.dark, scheme, resolver, context)
    case 'contrast': {
      const target = foldContrastTarget(expr.target, scheme, resolver, context)
      return { color: pickLegible(target.color).color, approximate: target.approximate }
    }
    case 'ref':
      return resolver.foldRefForContrast(expr.handle, scheme)
    default:
      return { color: foldExpr(expr, scheme, resolver, context), approximate: false }
  }
}

function getRepresentativeMixAmount(
  expr: VanityMixExpr,
): { readonly amount: number, readonly alphaScale: number } | undefined {
  const input = typeof expr.inputPercentage === 'number' ? expr.inputPercentage : undefined
  const other = typeof expr.otherPercentage === 'number' ? expr.otherPercentage : undefined

  if (input === undefined && other === undefined)
    return { amount: 0.5, alphaScale: 1 }
  if (input === undefined && other !== undefined)
    return { amount: other / 100, alphaScale: 1 }
  if (input !== undefined && other === undefined)
    return { amount: (100 - input) / 100, alphaScale: 1 }
  if (input === undefined || other === undefined)
    return undefined

  const total = input + other
  if (total <= 0)
    return undefined
  return {
    amount: other / total,
    alphaScale: Math.min(1, total / 100),
  }
}

/**
 * The CSS for a color that needs no live expression. A leaf keeps the exact
 * form it was authored in; only a build-time computation loses its authored
 * spelling and lands in the canonical oklch formatting.
 */
export function foldColorCss(
  expr: VanityColorExpr,
  scheme: VanityScheme,
  resolver: VanityResolver,
  context?: VanitySerializeContext,
): string {
  switch (expr.kind) {
    case 'alpha': {
      const input = foldColorAlphaInput(expr.input, expr.amount, scheme, resolver, context)
      if (input !== undefined)
        return input
      return formatOklch(foldExpr(expr, scheme, resolver, context))
    }
    case 'adjust': {
      const space = getAdjustmentSpace(expr, resolver, context)
      const input = space === undefined
        ? undefined
        : foldColorAdjustmentInput(expr, space, scheme, resolver, context)
      if (input !== undefined)
        return input
      return formatOklch(foldExpr(expr, scheme, resolver, context))
    }
    case 'parse':
      void foldExpr(expr, scheme, resolver, context)
      return expr.css
    case 'value':
      return resolver.serializeValue?.(expr.value)
        ?? (context ? context.serialize(expr.value) : serializeSelf(expr.value))
    default:
      return formatOklch(foldExpr(expr, scheme, resolver, context))
  }
}

function foldColorAlphaInput(
  input: VanityColorExpr,
  amount: number,
  scheme: VanityScheme,
  resolver: VanityResolver,
  context?: VanitySerializeContext,
): string | undefined {
  const css = foldColorCss(input, scheme, resolver, context)
  return preserveColorAlpha(css, amount)
}

function foldColorAdjustmentInput(
  expr: Extract<VanityColorExpr, { kind: 'adjust' }>,
  space: VanityPolarColorSpace,
  scheme: VanityScheme,
  resolver: VanityResolver,
  context?: VanitySerializeContext,
): string | undefined {
  if (!canFoldAdjustment(expr, space, resolver, context))
    return undefined

  const css = foldColorCss(expr.input, scheme, resolver, context)
  if (getAuthoredPolarColorSpace(css) === space)
    return preserveColorAdjustment(css, space, expr.channel, expr.delta)

  return formatColorInSpace(
    applyOklchAdjustment(foldExpr(expr.input, scheme, resolver, context), space, expr.channel, expr.delta),
    space,
  )
}

// ─── Live serialization ──────────────────────────────────────────────────────

export function serializeExpr(expr: VanityColorExpr, resolver: VanityResolver, context?: VanitySerializeContext): string {
  const traits = getExpressionTraits(expr, resolver, context)

  // An anonymous static subtree folds — graph edges stay `var()` references.
  if (!traits.cssLive && !traits.volatile && !hasColorReference(expr))
    return foldColorCss(expr, 'light', resolver, context)

  switch (expr.kind) {
    case 'oklch':
    case 'parse':
      return foldColorCss(expr, 'light', resolver, context) // unreachable via the fold above; kept total
    case 'value':
      return resolver.serializeValue?.(expr.value)
        ?? (context ? context.serialize(expr.value) : serializeSelf(expr.value))
    case 'ref':
      return resolver.serializeRef?.(expr.handle) ?? readHandleVar(expr.handle)
    case 'alpha':
      return serializeAlpha(expr, resolver, context)
    case 'adjust':
      return serializeAdjust(expr, resolver, context)
    case 'channels':
      return serializeChannels(expr, resolver, context)
    case 'relative':
      return serializeRelative(expr, resolver, context)
    case 'mix': {
      if (expr.space === undefined)
        return resolver.invalidColor(describeMissingInterpolationSpace(), describeMissingInterpolationSpaceFix())
      const hue = expr.hue ? ` ${expr.hue} hue` : ''
      return `color-mix(in ${expr.space}${hue}, ${serializeExpr(expr.input, resolver, context)}${serializeMixPercentage(expr.inputPercentage, context)}, ${serializeExpr(expr.other, resolver, context)}${serializeMixPercentage(expr.otherPercentage, context)})`
    }
    case 'scheme':
      return `light-dark(${serializeExpr(expr.light, resolver, context)}, ${serializeExpr(expr.dark, resolver, context)})`
    case 'contrast':
      // Mid-expression, a legible pairing contributes its computed pick. A
      // token's own value follows the same fallback unless a future graph
      // enhancement proves a native upgrade interoperable.
      return serializeContrastPick(expr, resolver, context)
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
  const serializeChannelText = (input: VanityColorChannel): string => {
    if (typeof input === 'number')
      return formatNumber(input)
    if (input === 'none')
      return input
    if ((typeof input === 'object' || typeof input === 'function') && input !== null) {
      const value = new ExpressionValue(createInputNode(input))
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
      return serializeChannelText(operation)
    let expression: string = name
    let calculates = false
    operation.operations.forEach((step, index) => {
      if (step.kind === 'set') {
        expression = serializeChannelText(step.value)
        return
      }
      const operator = step.kind === 'add' ? '+' : step.kind === 'subtract' ? '-' : step.kind === 'multiply' ? '*' : '/'
      expression = `${index === 0 ? expression : `(${expression})`} ${operator} ${serializeChannelText(step.value)}`
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
  const serializeChannelText = (input: VanityColorChannel): string => {
    if (typeof input === 'number')
      return formatNumber(input)
    if (input === 'none')
      return input
    if ((typeof input === 'object' || typeof input === 'function') && input !== null) {
      const value = new ExpressionValue(createInputNode(input))
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
      return serializeChannelText(operation)
    let expression = name
    let calculates = false
    operation.operations.forEach((step, index) => {
      if (step.kind === 'set') {
        expression = serializeChannelText(step.value)
        return
      }
      const operator = step.kind === 'add'
        ? '+'
        : step.kind === 'subtract'
          ? '-'
          : step.kind === 'multiply' ? '*' : '/'
      expression = `${index === 0 ? expression : `(${expression})`} ${operator} ${serializeChannelText(step.value)}`
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

function getAdjustmentSpace(
  expr: Extract<VanityColorExpr, { kind: 'adjust' }>,
  resolver: VanityResolver,
  context?: VanitySerializeContext,
): VanityPolarColorSpace | undefined {
  return expr.space
    ?? context?.policies.color.adjustSpace
    ?? resolver.policies?.color.adjustSpace
}

function canFoldAdjustment(
  expr: Extract<VanityColorExpr, { kind: 'adjust' }>,
  space: VanityPolarColorSpace | undefined,
  resolver: VanityResolver,
  context?: VanitySerializeContext,
): boolean {
  if (space === undefined)
    return false

  const inputTraits = getExpressionTraits(expr.input, resolver, context)
  if (inputTraits.cssLive || inputTraits.volatile || hasColorReference(expr.input))
    return false

  const inputCss = foldColorCss(expr.input, 'light', resolver, context)
  return canFoldColorAdjustmentInSpace(inputCss, space)
}

function describeMissingAdjustmentSpace(operation: string): string {
  return `${operation} needs a working polar color space; use a named namespace such as oklch.lighten(), or declare policies.color.adjustSpace`
}

function describeMissingAdjustmentSpaceFix(): string {
  return 'use a named color-space namespace such as `oklch.lighten()`, or declare `policies.color.adjustSpace`'
}

function describeMissingInterpolationSpace(): string {
  return 'colorMix() needs an interpolation space; choose one with .in(space), or declare policies.color.mixSpace'
}

function describeMissingInterpolationSpaceFix(): string {
  return 'choose an interpolation space with `.in(space)`, or declare `policies.color.mixSpace`'
}

function getAdjustmentChannelNames(space: VanityPolarColorSpace): readonly string[] {
  switch (space) {
    case 'hsl': return ['h', 's', 'l']
    case 'hwb': return ['h', 'w', 'b']
    case 'lch':
    case 'oklch': return ['l', 'c', 'h']
  }
}

function serializeAlpha(
  expr: Extract<VanityColorExpr, { kind: 'alpha' }>,
  resolver: VanityResolver,
  context?: VanitySerializeContext,
): string {
  const input = serializeExpr(expr.input, resolver, context)
  return `oklch(from ${input} l c h / ${formatNumber(expr.amount)})`
}

function serializeAdjust(expr: Extract<VanityColorExpr, { kind: 'adjust' }>, resolver: VanityResolver, context?: VanitySerializeContext): string {
  const space = getAdjustmentSpace(expr, resolver, context)
  if (space === undefined)
    return resolver.invalidColor(describeMissingAdjustmentSpace('channel adjustment'), describeMissingAdjustmentSpaceFix())
  const input = serializeExpr(expr.input, resolver, context)
  const delta = expr.delta >= 0 ? `+ ${formatNumber(expr.delta)}` : `- ${formatNumber(-expr.delta)}`
  const names = getAdjustmentChannelNames(space)
  if (!names.includes(expr.channel))
    return resolver.invalidColor(`${space} has no '${expr.channel}' channel for this adjustment`)
  const parts = names.map(channel => channel === expr.channel ? `calc(${channel} ${delta})` : channel)
  return `${space}(from ${input} ${parts.join(' ')})`
}

/** The build-computed white/black pick, `light-dark()`-paired when the schemes disagree. */
export function serializeContrastPick(
  expr: Extract<VanityColorExpr, { kind: 'contrast' }>,
  resolver: VanityResolver,
  context?: VanitySerializeContext,
): string {
  return serializeContrastResolution(resolveContrastPick(expr, resolver, context))
}

/** Resolve both branches of a `legibleOn()` pairing for build and inspection. */
export function resolveContrastPick(
  expr: Extract<VanityColorExpr, { kind: 'contrast' }>,
  resolver: VanityResolver,
  context?: VanitySerializeContext,
): VanityContrastResolution {
  const lightTarget = foldContrastTarget(expr.target, 'light', resolver, context)
  const darkTarget = foldContrastTarget(expr.target, 'dark', resolver, context)
  const fallbackSchemes = [
    ...(lightTarget.approximate ? ['light' as const] : []),
    ...(darkTarget.approximate ? ['dark' as const] : []),
  ]
  return {
    lightTarget: lightTarget.color,
    darkTarget: darkTarget.color,
    light: pickLegible(lightTarget.color),
    dark: pickLegible(darkTarget.color),
    fallbackSchemes,
    ...(fallbackSchemes.length === 0 ? {} : { fallbackReason: CONTRAST_FALLBACK_REASON }),
  }
}

/** Format an already-resolved contrast pairing without repeating its fold. */
export function serializeContrastResolution(resolution: VanityContrastResolution): string {
  return resolution.light.keyword === resolution.dark.keyword
    ? resolution.light.keyword
    : `light-dark(${resolution.light.keyword}, ${resolution.dark.keyword})`
}
