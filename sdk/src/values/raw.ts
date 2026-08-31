/** Typed escape for future CSS syntax Vanity does not yet understand. */

import type { VanityCssDataType, VanityCssValue } from './types'
import { ExpressionValue, rawNode } from './protocol'

export interface VanityRawValueConstructors {
  unknown: (syntax: string) => VanityCssValue<string, 'unknown'>
  declaration: (syntax: string) => VanityCssValue<string, 'declaration'>
  number: (syntax: string) => VanityCssValue<string, 'number'>
  integer: (syntax: string) => VanityCssValue<string, 'integer'>
  percentage: (syntax: string) => VanityCssValue<string, 'percentage'>
  numberPercentage: (syntax: string) => VanityCssValue<string, 'number-percentage'>
  length: (syntax: string) => VanityCssValue<string, 'length'>
  lengthPercentage: (syntax: string) => VanityCssValue<string, 'length-percentage'>
  angle: (syntax: string) => VanityCssValue<string, 'angle'>
  time: (syntax: string) => VanityCssValue<string, 'time'>
  frequency: (syntax: string) => VanityCssValue<string, 'frequency'>
  resolution: (syntax: string) => VanityCssValue<string, 'resolution'>
  flex: (syntax: string) => VanityCssValue<string, 'flex'>
  color: (syntax: string) => VanityCssValue<string, 'color'>
  image: (syntax: string) => VanityCssValue<string, 'image'>
  position: (syntax: string) => VanityCssValue<string, 'position'>
  easingFunction: (syntax: string) => VanityCssValue<string, 'easing-function'>
  transformFunction: (syntax: string) => VanityCssValue<string, 'transform-function'>
  transformList: (syntax: string) => VanityCssValue<string, 'transform-list'>
  customIdent: (syntax: string) => VanityCssValue<string, 'custom-ident'>
  dashedIdent: (syntax: string) => VanityCssValue<string, 'dashed-ident'>
  string: (syntax: string) => VanityCssValue<string, 'string'>
  url: (syntax: string) => VanityCssValue<string, 'url'>
  plugin: <const Name extends string>(name: Name, syntax: string) => VanityCssValue<string, `plugin:${Name}`>
}

function typed<Type extends VanityCssDataType>(type: Type, syntax: string): VanityCssValue<string, Type> {
  validateRawSyntax(syntax)
  return new ExpressionValue(rawNode(type, syntax, { helper: `rawValue.${type}` }))
}

export const rawValue: VanityRawValueConstructors = Object.freeze({
  unknown: (syntax: string) => typed('unknown', syntax),
  declaration: (syntax: string) => typed('declaration', syntax),
  number: (syntax: string) => typed('number', syntax),
  integer: (syntax: string) => typed('integer', syntax),
  percentage: (syntax: string) => typed('percentage', syntax),
  numberPercentage: (syntax: string) => typed('number-percentage', syntax),
  length: (syntax: string) => typed('length', syntax),
  lengthPercentage: (syntax: string) => typed('length-percentage', syntax),
  angle: (syntax: string) => typed('angle', syntax),
  time: (syntax: string) => typed('time', syntax),
  frequency: (syntax: string) => typed('frequency', syntax),
  resolution: (syntax: string) => typed('resolution', syntax),
  flex: (syntax: string) => typed('flex', syntax),
  color: (syntax: string) => typed('color', syntax),
  image: (syntax: string) => typed('image', syntax),
  position: (syntax: string) => typed('position', syntax),
  easingFunction: (syntax: string) => typed('easing-function', syntax),
  transformFunction: (syntax: string) => typed('transform-function', syntax),
  transformList: (syntax: string) => typed('transform-list', syntax),
  customIdent: (syntax: string) => typed('custom-ident', syntax),
  dashedIdent: (syntax: string) => typed('dashed-ident', syntax),
  string: (syntax: string) => typed('string', syntax),
  url: (syntax: string) => typed('url', syntax),
  plugin: <const Name extends string>(name: Name, syntax: string) => {
    if (name.trim().length === 0)
      throw new TypeError('[vanity] a raw plugin value needs a non-empty data-type name')
    return typed(`plugin:${name}` as const, syntax)
  },
})

/** Broad token/balance safety without pretending to parse future grammar. */
function validateRawSyntax(syntax: string): void {
  if (syntax.trim().length === 0)
    throw new TypeError('[vanity] a raw CSS value cannot be empty')
  if (syntax.includes('\0'))
    throw new TypeError('[vanity] a raw CSS value cannot contain U+0000')

  const stack: string[] = []
  let quote: '"' | '\'' | undefined
  let escaped = false

  for (let index = 0; index < syntax.length; index++) {
    const char = syntax[index]!
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote)
        quote = undefined
      continue
    }
    if (char === '/' && syntax[index + 1] === '*') {
      const end = syntax.indexOf('*/', index + 2)
      if (end < 0)
        throw new TypeError('[vanity] raw CSS has an unterminated comment')
      index = end + 1
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '(' || char === '[' || char === '{') {
      stack.push(char)
    }
    else if (char === ')' || char === ']' || char === '}') {
      const opening = stack.pop()
      if (!opening || !matches(opening, char))
        throw new TypeError(`[vanity] raw CSS has an unmatched '${char}'`)
    }
  }

  if (quote)
    throw new TypeError('[vanity] raw CSS has an unterminated string')
  if (escaped)
    throw new TypeError('[vanity] raw CSS has a dangling escape')
  if (stack.length > 0)
    throw new TypeError(`[vanity] raw CSS has an unmatched '${stack.at(-1)}'`)
}

function matches(opening: string, closing: string): boolean {
  return (opening === '(' && closing === ')')
    || (opening === '[' && closing === ']')
    || (opening === '{' && closing === '}')
}
