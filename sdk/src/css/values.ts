/**
 * Value serialization for rule positions. Token handles interpolate as their
 * `var()` reference — never folded, so a build-time token override re-derives
 * them like any other custom property. Color-helper expressions serialize
 * through the same classifier the graph uses ([patterns.md §3]): anonymous
 * static subtrees fold, graph edges stay `var()` references.
 */

import type { VanityDiagnosticInput as VanityDiagnostic } from '../diagnostics'
import type { VanityRuntimeHandle } from '../internal/handle'
import type { VanityResolver } from '../tokens/resolve'
import { VanityError } from '../diagnostics'
import { isHandle } from '../internal/handle'
import { isPort } from '../ports/port'
import { isColorValue, isContrastValue } from '../tokens/color'
import { containsContrast, modeTraits, serializeExpr } from '../tokens/resolve'
import { isCssValue } from '../values/types'

export interface VanityValueContext {
  file?: string
  /** Resolve system-relative expression references through the locked token graph. */
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

  // The lane redirect ([patterns.md §10]): a callable in a value position
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
    if (containsContrast(value.expr))
      throw new VanityError(contrastDiagnostic(path, ctx))

    return serializeExpr(value.expr, valueResolver(path, ctx))
  }

  if (isContrastValue(value))
    throw new VanityError(contrastDiagnostic(path, ctx))

  throw new VanityError({
    code: 'VANITY_CSS_INVALID_VALUE',
    message: `${path} is not a CSS value`,
    path,
    file: ctx.file,
    fix: 'give it a string, number, token, or CSS expression',
  })
}

function contrastDiagnostic(path: string, ctx: VanityValueContext): VanityDiagnostic {
  return {
    code: 'VANITY_CSS_INVALID_VALUE',
    message: `${path} uses legibleOn, which is graph knowledge — the check needs both endpoints at build time`,
    path,
    file: ctx.file,
    fix: 'define it in a derive() contribution — defineTokens(...).derive(m => ({ color: { onX: legibleOn(m.color.x) } })) — then reference that token here',
  }
}

/**
 * The rule-position resolver. `serializeExpr` folds only ref-free subtrees, so
 * `foldRef` is unreachable; ref traits come from the handle's own mode.
 */
function valueResolver(path: string, ctx: VanityValueContext): VanityResolver {
  return {
    ...(ctx.serializeValue === undefined
      ? {}
      : { serializeValue: value => String(ctx.serializeValue!(value)) }),
    refTraits: handle => modeTraits(handle.mode),
    serializeRef: handle => String(handle),
    foldRef: (handle: VanityRuntimeHandle) => {
      throw new VanityError({
        code: 'VANITY_CSS_INVALID_VALUE',
        message: `${path} cannot fold ${handle.path} at build time`,
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
