/**
 * The build-time CSS parser gate: the "parse the values" half of the
 * validation split ([patterns.md §2]). lightningcss owns value grammar and
 * selector/query syntax; the W3C property list owns property existence, so a
 * platform property lightningcss has not learned yet is never blocked
 * ([patterns.md §2]). Every check memoizes — style sheets
 * repeat themselves, native calls shouldn't.
 */

import { Buffer } from 'node:buffer'
import { all as knownCssProperties } from 'known-css-properties'
import { transform } from 'lightningcss'
import { didYouMean } from '../diagnostics'

const KNOWN_PROPERTIES = new Set(knownCssProperties)
const CSS_WIDE_KEYWORDS = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer'])

/**
 * Property grammar keywords that the parser currently reports as unresolved
 * despite accepting their declaration syntax. Keep this centralized and
 * fixture-backed: declaration forms must never grow local keyword exceptions.
 */
const PROPERTY_GRAMMAR_KEYWORDS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  'box-shadow': new Set(['none']),
  'text-shadow': new Set(['none']),
})

/**
 * Forward-compatible native functions whose current standardized grammar is
 * newer than the parser substrate. Keep entries parity-ledger-backed and
 * remove them once the substrate classifies the syntax natively.
 */
const STANDARDIZED_FUNCTION_GAPS = Object.freeze([
  'light-dark(',
] as const)

/** Is this kebab-case name a CSS property? The condition-collision authority. */
export function isCssProperty(name: string): boolean {
  return KNOWN_PROPERTIES.has(name)
}

export interface VanityDeclarationIssue {
  kind: 'unknown-property' | 'invalid-value'
  reason: string
  suggestion?: string
}

/**
 * Check a property name alone — the gate for numeric values, whose grammar
 * belongs to the substrate's unit rule but whose *existence* is still ours.
 * Vendor-prefixed names pass, same as `checkDeclaration`.
 */
export function checkPropertyName(property: string): VanityDeclarationIssue | undefined {
  if (property.startsWith('-') || KNOWN_PROPERTIES.has(property))
    return undefined

  return {
    kind: 'unknown-property',
    reason: `${property} is not a CSS property`,
    suggestion: didYouMean(property, knownCssProperties),
  }
}

type Classified
  = | { kind: 'typed' }
    | { kind: 'unparsed', resolvable: boolean }
    | { kind: 'unknown', name: string }

const declarationCache = new Map<string, VanityDeclarationIssue | undefined>()

/**
 * Check one declaration (kebab-case property, serialized value). Returns the
 * issue, or `undefined` when the declaration is sound. Values carrying `var()`
 * or unknown functions are accepted — their grammar is only decidable in the
 * browser, and an unknown function may be tomorrow's platform.
 */
export function checkDeclaration(property: string, value: string): VanityDeclarationIssue | undefined {
  if (property.startsWith('--'))
    return undefined

  const key = `${property}\0${value}`

  if (declarationCache.has(key))
    return declarationCache.get(key)

  const issue = getDeclarationIssue(property, value)
  declarationCache.set(key, issue)
  return issue
}

function getDeclarationIssue(property: string, value: string): VanityDeclarationIssue | undefined {
  const keyword = value.trim().toLowerCase()
  const standardizedFunctionGap = STANDARDIZED_FUNCTION_GAPS.some(
    cssFunction => keyword.includes(cssFunction),
  )

  // CSS-wide keywords are valid for every property. lightningcss currently
  // exposes some shorthand uses (notably `font: inherit`) as unresolved
  // unparsed declarations, so recognize the platform-wide grammar before
  // asking its property-specific visitor for a classification.
  if (CSS_WIDE_KEYWORDS.has(keyword) || PROPERTY_GRAMMAR_KEYWORDS[property]?.has(keyword))
    return undefined

  let classified: Classified = { kind: 'typed' }

  try {
    transform({
      filename: 'vanity-check.css',
      code: Buffer.from(`.x{${property}:${value}}`),
      errorRecovery: false,
      visitor: {
        Declaration(declaration) {
          if (declaration.property === 'unparsed') {
            const resolvable = declaration.value.value.some(
              token => token.type === 'var' || token.type === 'env' || token.type === 'function',
            )
            classified = { kind: 'unparsed', resolvable }
          }
          else if (declaration.property === 'custom') {
            classified = { kind: 'unknown', name: declaration.value.name }
          }
        },
      },
    })
  }
  catch (error) {
    return { kind: 'invalid-value', reason: (error as Error).message }
  }

  // The visitor assigns from a callback, which control flow cannot see.
  const outcome = classified as Classified

  if (outcome.kind === 'unparsed' && !outcome.resolvable && !standardizedFunctionGap)
    return { kind: 'invalid-value', reason: `'${value}' does not parse as a ${property} value` }

  if (outcome.kind === 'unknown' && !outcome.name.startsWith('-') && !KNOWN_PROPERTIES.has(outcome.name)) {
    return {
      kind: 'unknown-property',
      reason: `${outcome.name} is not a CSS property`,
      suggestion: didYouMean(outcome.name, knownCssProperties),
    }
  }

  return undefined
}

const syntaxCache = new Map<string, string | undefined>()

function checkSyntax(key: string, css: string): string | undefined {
  if (syntaxCache.has(key))
    return syntaxCache.get(key)

  let reason: string | undefined

  try {
    transform({ filename: 'vanity-check.css', code: Buffer.from(css), errorRecovery: false })
  }
  catch (error) {
    reason = (error as Error).message
  }

  syntaxCache.set(key, reason)
  return reason
}

/** Check a selector (with `&` still unresolved). Returns the parse failure, if any. */
export function checkSelector(selector: string): string | undefined {
  const probe = selector.replaceAll('&', '.vanity-probe')
  return checkSyntax(`s\0${selector}`, `${probe}{--vanity-probe:0}`)
}

/** Check an at-rule's params: `checkQuery('media', '(min-width: 768px)')`. */
export function checkQuery(atRule: 'media' | 'supports' | 'container', params: string): string | undefined {
  return checkSyntax(`${atRule}\0${params}`, `@${atRule} ${params}{.x{--vanity-probe:0}}`)
}

/** Check a complete CSS rule or at-rule without changing its authored order. */
export function checkCssBlock(css: string): string | undefined {
  return checkSyntax(`block\0${css}`, css)
}
