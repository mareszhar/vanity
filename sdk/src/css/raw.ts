/**
 * `css.raw` ([spec-css.md §8]): the escape hatch is CSS itself. The block
 * is real CSS with real nesting semantics — lightningcss parses and flattens
 * it under the generated class — so stepping off the object syntax costs
 * nothing else: still scoped, still validated, still token-interpolating, and
 * deliberately allowed to target descendants.
 */

import type { VanityDiagnosticInput as VanityDiagnostic } from '../diagnostics'
import type { VanityFlatNode } from '../internal/cssBlocks'
import type { VanitySystemContext } from './css'
import type { VanityRawEmitter, VanityRawValue } from './types'
import { Buffer } from 'node:buffer'
import { style } from '@vanilla-extract/css'
import { appendCss } from '@vanilla-extract/css/adapter'
import { getFileScope } from '@vanilla-extract/css/fileScope'
import { Features, transform } from 'lightningcss'
import { VanityError } from '../diagnostics'
import { parseBlocks } from '../internal/cssBlocks'
import { checkDeclaration } from '../internal/cssParser'
import { record } from '../internal/inspect'
import { requireStyleModule } from '../internal/styleModule'
import { inDeclaredLayer } from './css'
import { emitGlobal } from './emit'
import { serializeStyleValue } from './values'

const MARKER = '__vanity_raw__'

export interface VanityRawCssBlock {
  readonly type: 'vanityRaw'
  readonly css: string
}

/**
 * Complete CSS escape. The SDK adapter preserves these nodes in source order
 * and injects the parsed CSS verbatim under the chosen system layer.
 */
export function bindGlobalRaw(system: VanitySystemContext): VanityRawEmitter<string> {
  const raw = ((input: string | TemplateStringsArray, ...values: VanityRawValue[]) => {
    const file = requireStyleModule('raw')
    const text = typeof input === 'string' ? input : interpolate(input, values, file)
    let css: string
    try {
      css = transform({
        filename: file,
        code: Buffer.from(text),
        errorRecovery: false,
      }).code.toString()
    }
    catch (error) {
      throw new VanityError({
        code: 'VANITY_CSS_INVALID_RAW',
        message: `this raw CSS does not parse: ${(error as Error).message}`,
        file,
        fix: 'pass a complete CSS rule or at-rule',
      })
    }

    appendPlacedCss(system, css)

    record({
      kind: 'escape',
      form: 'raw',
      file,
      detail: preview(text),
      layer: system.defaultLayer,
    })
  }) as VanityRawEmitter<string>

  ;(raw as any).layer = (name: string) => bindGlobalRaw(inDeclaredLayer(system, name))
  return raw
}

export function appendLayeredCss(system: VanitySystemContext, css: string): void {
  appendRawCss(`@layer ${system.layerRoot}.${system.defaultLayer} {\n${indent(css)}\n}`)
}

function appendPlacedCss(system: VanitySystemContext, css: string): void {
  for (const block of topLevelBlocks(css)) {
    // Registration is deliberately unlayered: @property duplicate resolution
    // follows stylesheet order, not cascade-layer priority.
    if (block.prelude.startsWith('@property '))
      appendRawCss(block.css)
    else
      appendLayeredCss(system, block.css)
  }
}

function appendRawCss(css: string): void {
  ;(appendCss as any)({
    type: 'vanityRaw',
    css,
  } satisfies VanityRawCssBlock, getFileScope())
}

function indent(css: string): string {
  return css.trim().split('\n').map(line => `  ${line}`).join('\n')
}

function topLevelBlocks(css: string): Array<{ prelude: string, css: string }> {
  const blocks: Array<{ prelude: string, css: string }> = []
  let start = 0
  let depth = 0
  let quote: '"' | '\'' | undefined
  let escaped = false

  for (let index = 0; index < css.length; index++) {
    const char = css[index]!
    if (quote !== undefined) {
      if (escaped)
        escaped = false
      else if (char === '\\')
        escaped = true
      else if (char === quote)
        quote = undefined
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '{') {
      depth++
      continue
    }
    if (char === '}' && --depth === 0) {
      const text = css.slice(start, index + 1).trim()
      if (text)
        blocks.push({ prelude: text.slice(0, text.indexOf('{')).trim(), css: text })
      start = index + 1
      continue
    }
    if (char === ';' && depth === 0) {
      const text = css.slice(start, index + 1).trim()
      if (text)
        blocks.push({ prelude: text.slice(0, -1).trim(), css: text })
      start = index + 1
    }
  }

  const tail = css.slice(start).trim()
  if (tail)
    blocks.push({ prelude: tail.split(/[;{]/, 1)[0]!.trim(), css: tail })
  return blocks
}

export function bindRaw(system: VanitySystemContext): (strings: TemplateStringsArray, ...values: VanityRawValue[]) => string {
  return (strings, ...values) => {
    const file = requireStyleModule('css.raw')
    const text = interpolate(strings, values, file)
    const className = style({})
    const flattened = flatten(text, file)
    const nodes = parseBlocks(flattened)

    emitNodes(nodes, className, system, file)

    record({
      kind: 'escape',
      form: 'css.raw',
      file,
      detail: preview(text),
      layer: system.defaultLayer,
    })

    return className
  }
}

/** The block's first meaningful line, clipped — enough to find it in review. */
function preview(text: string): string {
  const line = text.split('\n').map(entry => entry.trim()).find(entry => entry.length > 0) ?? ''
  return line.length > 72 ? `${line.slice(0, 71)}…` : line
}

function interpolate(strings: TemplateStringsArray, values: VanityRawValue[], file: string): string {
  let text = strings[0]

  for (let index = 0; index < values.length; index++)
    text += String(serializeStyleValue(values[index], 'css.raw', { file })) + strings[index + 1]

  return text
}

function flatten(text: string, file: string): string {
  try {
    return transform({
      filename: file,
      code: Buffer.from(`.${MARKER}{${text}}`),
      include: Features.Nesting,
      errorRecovery: false,
    }).code.toString()
  }
  catch (error) {
    const message = (error as Error).message

    throw new VanityError({
      code: 'VANITY_CSS_INVALID_RAW',
      message: `this raw block does not parse: ${message}`,
      file,
      fix: message.includes('@keyframes')
        ? 'an animation is a value — define it with keyframes() and interpolate the handle'
        : 'the block must hold as the body of a CSS rule',
    })
  }
}

// ─── Emission ────────────────────────────────────────────────────────────────

interface RawArm {
  media?: string
  supports?: string
  container?: string
  startingStyle?: boolean
}

function emitNodes(nodes: VanityFlatNode[], className: string, system: VanitySystemContext, file: string): void {
  const diagnostics: VanityDiagnostic[] = []
  walkNodes(nodes, {}, className, system, file, diagnostics)

  if (diagnostics.length > 0)
    throw new VanityError(diagnostics)
}

function walkNodes(nodes: VanityFlatNode[], arm: RawArm, className: string, system: VanitySystemContext, file: string, diagnostics: VanityDiagnostic[]): void {
  for (const node of nodes) {
    if (node.kind === 'at') {
      const merged = mergeRawArm(arm, node.prelude, file, diagnostics)

      if (merged)
        walkNodes(node.children, merged, className, system, file, diagnostics)

      continue
    }

    const declarations: Record<string, string> = {}

    for (const [property, value] of node.declarations) {
      const issue = checkDeclaration(property, value)

      if (issue !== undefined) {
        diagnostics.push({
          code: issue.kind === 'unknown-property' ? 'VANITY_CSS_UNKNOWN_PROPERTY' : 'VANITY_CSS_INVALID_VALUE',
          message: `css.raw ${node.selector.replaceAll(`.${MARKER}`, '&')} ${property}: ${issue.reason}${issue.suggestion ? ` — did you mean '${issue.suggestion}'?` : ''}`,
          file,
        })
        continue
      }

      declarations[property] = value
    }

    if (Object.keys(declarations).length === 0)
      continue

    emitGlobal(node.selector.replaceAll(`.${MARKER}`, className), {
      layer: system.defaultLayer,
      layerRoot: system.layerRoot,
      units: [{ arm: { ...arm }, declarations }],
    })
  }
}

function mergeRawArm(arm: RawArm, prelude: string, file: string, diagnostics: VanityDiagnostic[]): RawArm | undefined {
  if (prelude === '@starting-style')
    return { ...arm, startingStyle: true }

  for (const kind of ['media', 'supports', 'container'] as const) {
    if (!prelude.startsWith(`@${kind}`)) {
      continue
    }

    const params = prelude.slice(kind.length + 1).trim()

    if (kind === 'container' && arm.container !== undefined) {
      diagnostics.push({
        code: 'VANITY_CSS_INVALID_RAW',
        message: 'css.raw nests two container queries — a rule queries one container',
        file,
        fix: 'restructure so each rule sits under a single @container',
      })
      return undefined
    }

    return {
      ...arm,
      [kind]: arm[kind] === undefined ? params : `${arm[kind]} and ${params}`,
    }
  }

  diagnostics.push({
    code: 'VANITY_CSS_INVALID_RAW',
    message: `css.raw cannot hold ${prelude.split(/[\s{]/)[0]}`,
    file,
    fix: prelude.startsWith('@keyframes')
      ? 'an animation is a value — define it with keyframes() and interpolate the handle'
      : 'raw blocks nest @media, @supports, @container, and @starting-style',
  })

  return undefined
}
