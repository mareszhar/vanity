/**
 * `keyframes` and `fontFace` ([spec-css.md §9]): anonymous at-rules whose
 * identity is the export that holds them. Steps are declaration-only rule
 * objects — a condition or selector inside one is semantically meaningless,
 * so the grammar refuses it rather than silently ignoring it.
 */

import type { VanityDiagnosticInput as VanityDiagnostic } from '../diagnostics'
import type { VanitySystemContext } from './context'
import type { VanityFontFaceFunction, VanityKeyframesFunction } from './types'
import { isUnsafeValue } from '../atoms/handle'
import { VanityError } from '../diagnostics'
import { substrate } from '../substrate'
import { convertToKebab } from '../tokens/names'
import { createLayerContext, requireStyleModuleFile } from './context'
import { compileStyleRule, isPlainObject, isSelectorKey } from './rule'
import { checkCssBlock, serializeDeclarationNumber } from './validation'
import { serializeStyleValue } from './values'

const TIME = /^(?:from|to|\d+(?:\.\d+)?%)(?:\s*,\s*(?:from|to|\d+(?:\.\d+)?%))*$/

export function bindKeyframes(system: VanitySystemContext): VanityKeyframesFunction {
  const keyframes = ((steps, debugId?) => {
    const file = requireStyleModuleFile('keyframes')
    const diagnostics: VanityDiagnostic[] = []
    const compiled: Record<string, Record<string, string | number | Array<string | number>>> = {}

    for (const [time, step] of Object.entries(steps as Record<string, unknown>)) {
      if (step === undefined || step === null)
        continue

      if (!TIME.test(time)) {
        diagnostics.push({
          code: 'VANITY_CSS_INVALID_KEY',
          message: `'${time}' is not a keyframe step — steps are 'from', 'to', or percentages`,
          path: time,
          file,
        })
        continue
      }

      if (!isPlainObject(step)) {
        diagnostics.push({
          code: 'VANITY_CSS_INVALID_KEY',
          message: `the '${time}' step must be a declarations object`,
          path: time,
          file,
        })
        continue
      }

      const declarations: Record<string, unknown> = {}

      for (const [property, value] of Object.entries(step)) {
        if (value === undefined || value === null)
          continue

        const path = `${time}.${property}`

        if (system.conditions.has(property) || isSelectorKey(property) || property.startsWith('@') || (isPlainObject(value) && !isUnsafeValue(value) && !property.startsWith('--'))) {
          diagnostics.push({
            code: 'VANITY_CSS_INVALID_KEY',
            message: `${path} — conditions and selectors are meaningless inside a keyframe step`,
            path,
            file,
            fix: 'put the condition around the animation declaration in the style that plays it',
          })
          continue
        }

        declarations[property] = value
      }

      try {
        compiled[time] = compileStyleRule(declarations, { ...system, file, rootPath: [time], styleName: debugId }).units[0]?.declarations ?? {}
      }
      catch (error) {
        if (!(error instanceof VanityError))
          throw error
        diagnostics.push(...error.diagnostics)
      }
    }

    if (diagnostics.length > 0)
      throw new VanityError(diagnostics)

    return substrate.css.emitKeyframes({
      debugId,
      render: (name) => {
        const body = Object.entries(compiled)
          .map(([time, declarations]) => [
            `  ${time} {`,
            serializeDeclarations(declarations, '    '),
            '  }',
          ].join('\n'))
          .join('\n')
        const css = `@keyframes ${name} {\n${body}\n}`
        const issue = checkCssBlock(css)
        if (issue !== undefined) {
          throw new VanityError({
            code: 'VANITY_CSS_INVALID_VALUE',
            message: `the keyframes rule does not parse: ${issue}`,
            file,
          })
        }
        return `@layer ${system.layerRoot}.${system.defaultLayer} {\n${indent(css)}\n}`
      },
    })
  }) as VanityKeyframesFunction
  ;(keyframes as any).layer = (name: string) => bindKeyframes(createLayerContext(system, name))
  return keyframes
}

export function bindFontFace(system: VanitySystemContext): VanityFontFaceFunction {
  const fontFace = ((rule, debugId?) => {
    const file = requireStyleModuleFile('fontFace')
    const declarations: Record<string, string | number | Array<string | number>> = {}
    for (const [property, value] of Object.entries(rule)) {
      if (value === undefined)
        continue
      declarations[property] = Array.isArray(value)
        ? value.map(entry => serializeStyleValue(entry, `fontFace.${property}`, { file }))
        : serializeStyleValue(value, `fontFace.${property}`, { file })
    }
    return substrate.css.emitFontFace({
      debugId,
      render: (family) => {
        const css = [
          '@font-face {',
          `  font-family: "${family}";`,
          serializeDeclarations(declarations, '  '),
          '}',
        ].filter(Boolean).join('\n')
        const issue = checkCssBlock(css)
        if (issue !== undefined) {
          throw new VanityError({
            code: 'VANITY_CSS_INVALID_VALUE',
            message: `the fontFace descriptors do not parse: ${issue}`,
            file,
          })
        }
        return `@layer ${system.layerRoot}.${system.defaultLayer} {\n${indent(css)}\n}`
      },
    })
  }) as VanityFontFaceFunction
  ;(fontFace as any).layer = (name: string) => bindFontFace(createLayerContext(system, name))
  return fontFace
}

function serializeDeclarations(
  declarations: Record<string, string | number | Array<string | number>>,
  indent = '',
): string {
  return Object.entries(declarations)
    .flatMap(([property, value]) => {
      const name = property.startsWith('--') ? property : convertToKebab(property)
      return (Array.isArray(value) ? value : [value])
        .map(entry => `${indent}${name}: ${typeof entry === 'number' ? serializeDeclarationNumber(name, entry) : entry};`)
    })
    .join('\n')
}

function indent(css: string): string {
  return css.trim().split('\n').map(line => `  ${line}`).join('\n')
}
