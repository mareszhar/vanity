/**
 * `tokenOverride()` — a scoped set of token overrides, at build time
 * ([spec-tokens.md §10]): a class that re-declares the overridden variables
 * plus every build-folded value downstream of them (re-folded under the
 * overrides — a legible pairing may flip its pick). Live derivations re-derive
 * in the cascade and need no re-declaration; that is the point of liveness.
 */

import type { VanityOverride } from './graph'
import type { VanityThemeOverrides, VanityTokenOverrides } from './types'
import { style } from '@vanilla-extract/css'
import { didYouMean, VanityError } from '../diagnostics'
import { isHandle } from '../internal/handle'
import { record } from '../internal/inspect'
import { isColorValue, isContrastValue } from './color'
import { graphOf, resolveGraph } from './graph'

export function tokenOverride<T extends object>(tokens: T, overrides: VanityTokenOverrides<T>, debugId?: string): string {
  return createTokenOverride(tokens, overrides as object, debugId, 'tokenOverride')
}

/** Standalone characterization adapter; product authoring uses `ds.tokenOverride()`. */
export function theme<T extends object>(tokens: T, overrides: VanityThemeOverrides<T>, debugId?: string): string {
  return createTokenOverride(tokens, overrides as object, debugId, 'theme')
}

function createTokenOverride<T extends object>(
  tokens: T,
  overrides: object,
  debugId: string | undefined,
  invocation: 'tokenOverride' | 'theme',
): string {
  const graph = graphOf(tokens)

  if (!graph) {
    throw new VanityError({
      code: 'VANITY_TOKENS_INVALID_OVERRIDE',
      message: `${invocation}() needs the tokens returned by defineTokens`,
      fix: `pass the graph itself — ${invocation}(t, { … }) — from a style module`,
    })
  }

  const substitutions = new Map<string, VanityOverride>()
  collectOverrides(overrides, tokens, [], substitutions, graph.file)

  const context = debugId ? `${invocation} ${debugId}` : invocation
  const { results, diagnostics } = resolveGraph(graph, substitutions, context)

  if (diagnostics.length > 0)
    throw new VanityError(diagnostics)

  const vars: Record<string, string> = {}

  for (const node of graph.nodes.values()) {
    const emitted = results.get(node.key)!.emitted

    if (emitted !== graph.results.get(node.key)!.emitted)
      vars[node.name] = emitted
  }

  const rule = { vars }
  const className = style(graph.phaseLayers?.overrides === undefined
    ? rule
    : { '@layer': { [graph.phaseLayers.overrides]: rule } }, debugId)
  record({
    kind: 'style',
    class: className,
    ...(debugId === undefined ? {} : { name: debugId }),
    vars: Object.keys(vars),
    ...(graph.file === undefined ? {} : { file: graph.file }),
  })
  return className
}

function collectOverrides(
  overrides: object,
  tokens: object,
  path: string[],
  substitutions: Map<string, VanityOverride>,
  file: string | undefined,
): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined)
      continue

    const target = (tokens as Record<string, unknown>)[key]
    const keyPath = [...path, key]

    if (target === undefined) {
      const suggestion = didYouMean(key, Object.keys(tokens))
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_OVERRIDE',
        message: `${keyPath.join('.')} is not a token in this graph${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
        path: keyPath.join('.'),
        file,
      })
    }

    if (isHandle(target)) {
      substitutions.set(keyPath.join('.'), toOverride(value, keyPath.join('.'), file))
      continue
    }

    if (typeof value !== 'object' || value === null || isColorValue(value) || isContrastValue(value)) {
      throw new VanityError({
        code: 'VANITY_TOKENS_INVALID_OVERRIDE',
        message: `${keyPath.join('.')} is a token group — override its tokens individually`,
        path: keyPath.join('.'),
        file,
      })
    }

    collectOverrides(value, target as object, keyPath, substitutions, file)
  }
}

function toOverride(value: unknown, key: string, file: string | undefined): VanityOverride {
  if (isContrastValue(value))
    return { kind: 'contrast', expr: value.expr }

  if (isColorValue(value))
    return { kind: 'color', expr: value.expr, markedLive: value.markedLive }

  if (typeof value === 'string' || typeof value === 'number')
    return { kind: 'literal', value }

  throw new VanityError({
    code: 'VANITY_TOKENS_INVALID_OVERRIDE',
    message: `${key} override is not a token value — expected a string, number, or color`,
    path: key,
    file,
  })
}
