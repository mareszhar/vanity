/** Typed escape for future CSS syntax Vanity does not yet understand. */

import type { VanityCssDataType, VanityCssValue } from './types'
import { throwValueError } from './error'
import { createRawNode, ExpressionValue } from './protocol'

export interface VanityRawValueConstructors {
  /** Preserve raw CSS syntax asserted as <unknown>; checks balance rather than this type’s grammar. */
  unknown: (syntax: string) => VanityCssValue<string, 'unknown'>
  /** Preserve raw CSS syntax asserted as <declaration>; checks balance rather than this type’s grammar. */
  declaration: (syntax: string) => VanityCssValue<string, 'declaration'>
  /** Preserve raw CSS syntax asserted as <number>; checks balance rather than this type’s grammar. */
  number: (syntax: string) => VanityCssValue<string, 'number'>
  /** Preserve raw CSS syntax asserted as <integer>; checks balance rather than this type’s grammar. */
  integer: (syntax: string) => VanityCssValue<string, 'integer'>
  /** Preserve raw CSS syntax asserted as <percentage>; checks balance rather than this type’s grammar. */
  percentage: (syntax: string) => VanityCssValue<string, 'percentage'>
  /** Preserve raw CSS syntax asserted as <number-percentage>; checks balance rather than this type’s grammar. */
  numberPercentage: (syntax: string) => VanityCssValue<string, 'number-percentage'>
  /** Preserve raw CSS syntax asserted as <length>; checks balance rather than this type’s grammar. */
  length: (syntax: string) => VanityCssValue<string, 'length'>
  /** Preserve raw CSS syntax asserted as <length-percentage>; checks balance rather than this type’s grammar. */
  lengthPercentage: (syntax: string) => VanityCssValue<string, 'length-percentage'>
  /** Preserve raw CSS syntax asserted as <angle>; checks balance rather than this type’s grammar. */
  angle: (syntax: string) => VanityCssValue<string, 'angle'>
  /** Preserve raw CSS syntax asserted as <time>; checks balance rather than this type’s grammar. */
  time: (syntax: string) => VanityCssValue<string, 'time'>
  /** Preserve raw CSS syntax asserted as <frequency>; checks balance rather than this type’s grammar. */
  frequency: (syntax: string) => VanityCssValue<string, 'frequency'>
  /** Preserve raw CSS syntax asserted as <resolution>; checks balance rather than this type’s grammar. */
  resolution: (syntax: string) => VanityCssValue<string, 'resolution'>
  /** Preserve raw CSS syntax asserted as <flex>; checks balance rather than this type’s grammar. */
  flex: (syntax: string) => VanityCssValue<string, 'flex'>
  /** Preserve raw CSS syntax asserted as <color>; checks balance rather than this type’s grammar. */
  color: (syntax: string) => VanityCssValue<string, 'color'>
  /** Preserve raw CSS syntax asserted as <image>; checks balance rather than this type’s grammar. */
  image: (syntax: string) => VanityCssValue<string, 'image'>
  /** Preserve raw CSS syntax asserted as <position>; checks balance rather than this type’s grammar. */
  position: (syntax: string) => VanityCssValue<string, 'position'>
  /** Preserve raw CSS syntax asserted as <easing-function>; checks balance rather than this type’s grammar. */
  easingFunction: (syntax: string) => VanityCssValue<string, 'easing-function'>
  /** Preserve raw CSS syntax asserted as <transform-function>; checks balance rather than this type’s grammar. */
  transformFunction: (syntax: string) => VanityCssValue<string, 'transform-function'>
  /** Preserve raw CSS syntax asserted as <transform-list>; checks balance rather than this type’s grammar. */
  transformList: (syntax: string) => VanityCssValue<string, 'transform-list'>
  /** Preserve raw CSS syntax asserted as <custom-ident>; checks balance rather than this type’s grammar. */
  customIdent: (syntax: string) => VanityCssValue<string, 'custom-ident'>
  /** Preserve raw CSS syntax asserted as <dashed-ident>; checks balance rather than this type’s grammar. */
  dashedIdent: (syntax: string) => VanityCssValue<string, 'dashed-ident'>
  /** Preserve raw CSS syntax asserted as <string>; checks balance rather than this type’s grammar. */
  string: (syntax: string) => VanityCssValue<string, 'string'>
  /** Preserve raw CSS syntax asserted as <url>; checks balance rather than this type’s grammar. */
  url: (syntax: string) => VanityCssValue<string, 'url'>
  /** Preserve raw CSS syntax under an explicit plugin-owned data-type name. */
  plugin: <const Name extends string>(name: Name, syntax: string) => VanityCssValue<string, `plugin:${Name}`>
}

function createTypedRawValue<Type extends VanityCssDataType>(type: Type, syntax: string): VanityCssValue<string, Type> {
  validateRawSyntax(syntax)
  return new ExpressionValue(createRawNode(type, syntax, { helper: `rawValue.${type}` }))
}

export const rawValue: VanityRawValueConstructors = Object.freeze({
  unknown: (syntax: string) => createTypedRawValue('unknown', syntax),
  declaration: (syntax: string) => createTypedRawValue('declaration', syntax),
  number: (syntax: string) => createTypedRawValue('number', syntax),
  integer: (syntax: string) => createTypedRawValue('integer', syntax),
  percentage: (syntax: string) => createTypedRawValue('percentage', syntax),
  numberPercentage: (syntax: string) => createTypedRawValue('number-percentage', syntax),
  length: (syntax: string) => createTypedRawValue('length', syntax),
  lengthPercentage: (syntax: string) => createTypedRawValue('length-percentage', syntax),
  angle: (syntax: string) => createTypedRawValue('angle', syntax),
  time: (syntax: string) => createTypedRawValue('time', syntax),
  frequency: (syntax: string) => createTypedRawValue('frequency', syntax),
  resolution: (syntax: string) => createTypedRawValue('resolution', syntax),
  flex: (syntax: string) => createTypedRawValue('flex', syntax),
  color: (syntax: string) => createTypedRawValue('color', syntax),
  image: (syntax: string) => createTypedRawValue('image', syntax),
  position: (syntax: string) => createTypedRawValue('position', syntax),
  easingFunction: (syntax: string) => createTypedRawValue('easing-function', syntax),
  transformFunction: (syntax: string) => createTypedRawValue('transform-function', syntax),
  transformList: (syntax: string) => createTypedRawValue('transform-list', syntax),
  customIdent: (syntax: string) => createTypedRawValue('custom-ident', syntax),
  dashedIdent: (syntax: string) => createTypedRawValue('dashed-ident', syntax),
  string: (syntax: string) => createTypedRawValue('string', syntax),
  url: (syntax: string) => createTypedRawValue('url', syntax),
  plugin: <const Name extends string>(name: Name, syntax: string) => {
    if (name.trim().length === 0) {
      throwValueError(
        'VANITY_CSS_INVALID_VALUE',
        'a raw plugin value needs a non-empty data-type name',
        'rawValue.plugin',
        'provide a stable data-type name',
      )
    }
    return createTypedRawValue(`plugin:${name}` as const, syntax)
  },
})

/** Broad token/balance safety without pretending to parse future grammar. */
function validateRawSyntax(syntax: string): void {
  if (syntax.trim().length === 0) {
    throwValueError(
      'VANITY_CSS_INVALID_VALUE',
      'a raw CSS value cannot be empty',
      'rawValue',
      'provide non-empty CSS syntax',
    )
  }
  if (syntax.includes('\0')) {
    throwValueError(
      'VANITY_CSS_INVALID_VALUE',
      'a raw CSS value cannot contain U+0000',
      'rawValue',
      'remove the null character from the CSS syntax',
    )
  }

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
      if (end < 0) {
        throwValueError(
          'VANITY_CSS_INVALID_VALUE',
          'raw CSS has an unterminated comment',
          'rawValue',
          'close the comment with */',
        )
      }
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
      if (!opening || !isMatchingDelimiter(opening, char)) {
        throwValueError(
          'VANITY_CSS_INVALID_VALUE',
          `raw CSS has an unmatched '${char}'`,
          'rawValue',
          'balance the CSS delimiters',
        )
      }
    }
  }

  if (quote) {
    throwValueError(
      'VANITY_CSS_INVALID_VALUE',
      'raw CSS has an unterminated string',
      'rawValue',
      'close the quoted CSS string',
    )
  }
  if (escaped) {
    throwValueError(
      'VANITY_CSS_INVALID_VALUE',
      'raw CSS has a dangling escape',
      'rawValue',
      'complete or remove the final escape character',
    )
  }
  if (stack.length > 0) {
    throwValueError(
      'VANITY_CSS_INVALID_VALUE',
      `raw CSS has an unmatched '${stack.at(-1)}'`,
      'rawValue',
      'balance the CSS delimiters',
    )
  }
}

function isMatchingDelimiter(opening: string, closing: string): boolean {
  return (opening === '(' && closing === ')')
    || (opening === '[' && closing === ']')
    || (opening === '{' && closing === '}')
}
