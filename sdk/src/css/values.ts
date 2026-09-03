/**
 * Value serialization for rule positions. Token handles interpolate as their
 * `var()` reference — never folded, so a build-time token override re-derives
 * them like any other custom property. Color-helper expressions serialize
 * through the same classifier the graph uses ([patterns.md §3]): anonymous
 * static subtrees fold, graph edges stay `var()` references.
 */

import type { VanityDiagnosticInput as VanityDiagnostic } from '../diagnostics'
import type { VanityInternalTokenHandle } from '../tokens/handle'
import type { VanityResolver } from '../tokens/resolve'
import { VanityError } from '../diagnostics'
import { isPort } from '../ports/port'
import { isColorValue, isContrastValue } from '../tokens/color'
import { isHandle, readHandlePath } from '../tokens/handle'
import { hasContrastExpression, serializeExpr } from '../tokens/resolve'
import { isCssValue } from '../values/types'

export interface VanityValueContext {
  file?: string
  /** Resolve system-relative expression references through the locked token module. */
  serializeValue?: (value: unknown) => string | number
}

/** Serialize one declared value; `path` names the offending key in diagnostics. */
export function serializeStyleValue(value: unknown, path: string, ctx: VanityValueContext): string | number {
  if (typeof value === 'string' || typeof value === 'number')
    return value

  if (isPort(value))
    return value.var

  if (isHandle(value))
    return String(value)

  if (isCssValue(value))
    return ctx.serializeValue?.(value) ?? value.css

  // The variability redirect ([patterns.md §10]): a callable in a value position
  // is a Stitches-style dynamic value — runtime data, which never crosses here.
  if (typeof value === 'function') {
    throw new VanityError({
      code: 'VANITY_CSS_INVALID_VALUE',
      message: `${path} is a function, which is runtime data — styles are decided at build time`,
      path,
      file: ctx.file,
      fix: 'use a variant for finite choices, or a port for live values',
    })
  }

  if (isColorValue(value)) {
    if (hasContrastExpression(value.expr))
      throw new VanityError(createContrastDiagnostic(path, ctx))

    return serializeExpr(value.expr, resolveValue(path, ctx))
  }

  if (isContrastValue(value))
    throw new VanityError(createContrastDiagnostic(path, ctx))

  throw new VanityError({
    code: 'VANITY_CSS_INVALID_VALUE',
    message: `${path} is not a CSS value`,
    path,
    file: ctx.file,
    fix: 'give it a string, number, token, or CSS expression',
  })
}

function createContrastDiagnostic(path: string, ctx: VanityValueContext): VanityDiagnostic {
  return {
    code: 'VANITY_CSS_INVALID_VALUE',
    message: `${path} uses legibleOn, which is graph knowledge — the check needs both endpoints at build time`,
    path,
    file: ctx.file,
    fix: 'define it in a derived token — defineTokens(...).add(m => ({ color: { onX: legibleOn(m.color.x) } })) — then reference that token here',
  }
}

/**
 * The rule-position resolver. `serializeExpr` folds only ref-free subtrees, so
 * `foldRef` is unreachable; ref traits come from the handle's own mode.
 */
function resolveValue(path: string, ctx: VanityValueContext): VanityResolver {
  return {
    ...(ctx.serializeValue === undefined
      ? {}
      : { serializeValue: value => String(ctx.serializeValue!(value)) }),
    refTraits: handle => ({
      cssLive: handle.$reference === 'var',
      volatile: handle.$mutable,
      conditional: false,
    }),
    serializeRef: handle => String(handle),
    foldRef: (handle: VanityInternalTokenHandle) => {
      throw new VanityError({
        code: 'VANITY_CSS_INVALID_VALUE',
        message: `${path} cannot fold ${readHandlePath(handle)} at build time`,
        path,
        file: ctx.file,
      })
    },
    invalidColor: (detail) => {
      throw new VanityError({
        code: 'VANITY_CSS_INVALID_VALUE',
        message: `${path} cannot resolve: ${detail}`,
        path,
        file: ctx.file,
        fix: 'give the color helper a color value or a color token',
      })
    },
  }
}
