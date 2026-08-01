/**
 * The rule compiler: one walk turns an authored rule object into emission
 * units — declarations under an *arm* (accumulated at-rule wrappers plus a
 * `&` selector). Both nesting directions land here and compile identically
 * ([patterns.md §5]); conditions compose by intersecting arms; every
 * declaration is validated by the parser gate before anything is emitted.
 */

import type { VanityDiagnosticInput as VanityDiagnostic } from '../diagnostics'
import type { VanityConditionArm } from '../system/conditions'
import type { VanityCssPropertyName, VanityPropertyAliasMap, VanityPropertyAliasMode } from './types'
import type { VanityValueContext } from './values'
import { didYouMean, VanityError } from '../diagnostics'
import { checkDeclaration, checkPropertyName, checkQuery, checkSelector, isCssProperty } from '../internal/cssParser'
import { kebab } from '../tokens/names'
import { isOmit } from './fragment'
import { deferredTokenDeclarationInput } from './tdec'
import { serializeStyleValue } from './values'

export interface VanityRuleContext extends VanityValueContext {
  conditions: Map<string, readonly VanityConditionArm[]>
  layers: readonly string[]
  defaultLayer: string
  /** The system's root layer (its prefix) — every emitted rule nests under it. */
  layerRoot: string
  /** Seeds diagnostic paths — recipe arms report as `variants.intent.brand.…`. */
  rootPath?: readonly string[]
  /**
   * Resolves keys the host surface scopes beyond the system's conditions —
   * anatomy's `'root:open'`. Returns arms to nest under, a diagnostic for a
   * malformed scoped key, or `undefined` to fall through to ordinary
   * classification.
   */
  scopedConditions?: (key: string) => VanityScopedConditionResult | undefined
  propertyAliases?: {
    aliases: VanityPropertyAliasMap
    expose: VanityPropertyAliasMode
  }
  standardEmitterName?: 'class.standard' | 'css.standard'
  resolveTokenDeclarations?: (input: object) => object
}

export type VanityScopedConditionResult
  = | { arms: readonly VanityConditionArm[] }
    | { diagnostic: Omit<VanityDiagnostic, 'file'> }

export interface VanityArm {
  media?: string
  supports?: string
  container?: string
  selector?: string
  scopes?: readonly string[]
  startingStyle?: boolean
}

export interface VanityUnit {
  arm: VanityArm
  declarations: Record<string, string | number | Array<string | number>>
}

export interface VanityCompiled {
  /** The authoring-surface layer name: `recipes`, `overrides`. */
  layer: string
  /**
   * The system's root layer — the prefix. Emission nests every rule as
   * `@layer <root>.<layer>`, so the only *global* layer name a system claims
   * is its own namespace and foreign systems' layer orders stay untouched
   * ([patterns.md §6]).
   */
  layerRoot: string
  units: VanityUnit[]
}

const BASE = 'base'

export function compileRule(rule: unknown, ctx: VanityRuleContext): VanityCompiled {
  const walker = new RuleWalker(ctx)
  walker.walkInput(rule, {}, [...ctx.rootPath ?? []])
  walker.throwIfFailed()
  return { layer: ctx.defaultLayer, layerRoot: ctx.layerRoot, units: walker.units }
}

class RuleWalker {
  readonly units: VanityUnit[] = []
  private readonly diagnostics: VanityDiagnostic[] = []
  private forceNewUnit = false

  constructor(private readonly ctx: VanityRuleContext) {}

  throwIfFailed(): void {
    if (this.diagnostics.length > 0)
      throw new VanityError(this.diagnostics)
  }

  walkInput(input: unknown, arm: VanityArm, path: string[]): void {
    if (input === undefined || input === null || input === false || isOmit(input))
      return

    if (Array.isArray(input)) {
      for (const contribution of input) {
        this.forceNewUnit = true
        this.walkInput(contribution, arm, path)
      }
      return
    }

    if (!isPlainObject(input)) {
      this.report({
        code: 'VANITY_CSS_INVALID_KEY',
        message: `${path.join('.') || 'rule'} is not a style contribution`,
        path: path.join('.') || undefined,
        fix: 'pass a rule object, fragment, contribution array, or ds.omit',
      })
      return
    }

    this.walk(input, arm, path)
  }

  private walk(rule: object, arm: VanityArm, path: string[]): void {
    const deferredDeclarations = deferredTokenDeclarationInput(rule)
    if (deferredDeclarations !== undefined) {
      if (this.ctx.resolveTokenDeclarations === undefined) {
        this.report({
          code: 'VANITY_TOKENS_INVALID_OVERRIDE',
          message: 'this token declaration fragment is not bound to a locked token graph',
          path: path.join('.') || undefined,
          fix: 'use the fragment through the locked system produced by the same open-system chain',
        })
      }
      else {
        this.walk(this.ctx.resolveTokenDeclarations(deferredDeclarations), arm, path)
      }
    }

    for (const [key, value] of Object.entries(rule)) {
      if (value === undefined || value === null)
        continue

      if (key === 'layer') {
        this.report({
          code: 'VANITY_CSS_INVALID_KEY',
          message: `${this.at(path, key)} — layer placement is emitter configuration, not rule data`,
          path: this.at(path, key),
          fix: `use the emitter's .layer(name) method or ds.inLayer(name)`,
        })
        continue
      }

      const condition = this.ctx.conditions.get(key)

      if (condition !== undefined) {
        this.nest(key, value, condition, arm, path)
        continue
      }

      const scoped = this.ctx.scopedConditions?.(key)

      if (scoped !== undefined) {
        if ('diagnostic' in scoped)
          this.report(scoped.diagnostic)
        else
          this.nest(key, value, scoped.arms, arm, path)
        continue
      }

      if (key.startsWith('--')) {
        this.declare(arm, key, value, path)
        continue
      }

      if (key.startsWith('@')) {
        this.atRule(key, value, arm, path)
        continue
      }

      if (isSelectorKey(key)) {
        this.selector(key, value, arm, path)
        continue
      }

      const alias = this.ctx.propertyAliases?.aliases[key]
      if (alias !== undefined) {
        if (Object.hasOwn(rule, alias)) {
          this.report({
            code: 'VANITY_CSS_INVALID_KEY',
            message: `${this.at(path, key)} and ${this.at(path, alias)} declare the same CSS property`,
            path: this.at(path, key),
            fix: 'choose either the alias or the standard property name in this rule arm',
          })
          continue
        }
        this.property(alias, value, arm, path, key)
        continue
      }

      if (this.ctx.propertyAliases?.expose === 'aliases-only'
        && Object.values(this.ctx.propertyAliases.aliases).includes(key as VanityCssPropertyName)) {
        this.report({
          code: 'VANITY_CSS_INVALID_KEY',
          message: `${this.at(path, key)} is hidden by the aliases-only policy`,
          path: this.at(path, key),
          fix: `use the configured alias, or write this declaration through ${this.ctx.standardEmitterName ?? 'class.standard'}()`,
        })
        continue
      }

      this.property(key, value, arm, path)
    }
  }

  /** A named condition forks the walk into each of its arms. */
  private nest(key: string, value: unknown, condition: readonly VanityConditionArm[], arm: VanityArm, path: string[]): void {
    if (!isPlainObject(value) && !Array.isArray(value) && !isOmit(value)) {
      this.report({
        code: 'VANITY_CSS_INVALID_KEY',
        message: `${this.at(path, key)} is a condition, so it takes a nested rule — not a plain value`,
        path: this.at(path, key),
        fix: `write ${key}: { property: value }`,
      })
      return
    }

    for (const conditionArm of condition) {
      const merged = this.mergeArm(arm, conditionArm, [...path, key])

      if (merged)
        this.walkInput(value, merged, [...path, key])
    }
  }

  private atRule(key: string, value: unknown, arm: VanityArm, path: string[]): void {
    if (!isPlainObject(value) && !Array.isArray(value) && !isOmit(value)) {
      this.report({
        code: 'VANITY_CSS_INVALID_KEY',
        message: `${this.at(path, key)} takes a nested rule`,
        path: this.at(path, key),
      })
      return
    }

    if (key === '@starting-style') {
      this.walkInput(value, { ...arm, startingStyle: true }, [...path, key])
      return
    }

    for (const kind of ['media', 'supports', 'container'] as const) {
      if (!key.startsWith(`@${kind} `))
        continue

      const params = key.slice(kind.length + 2).trim()
      const reason = checkQuery(kind, params)

      if (reason !== undefined) {
        this.report({
          code: 'VANITY_CSS_INVALID_SELECTOR',
          message: `${this.at(path, key)} does not parse: ${reason}`,
          path: this.at(path, key),
          fix: 'fix the query — the same text must hold as CSS',
        })
        return
      }

      const merged = this.mergeArm(arm, { [kind]: params }, [...path, key])

      if (merged)
        this.walkInput(value, merged, [...path, key])

      return
    }

    const redirect = key.startsWith('@keyframes')
      ? 'use keyframes() — an animation is a value, not a global name'
      : key.startsWith('@font-face')
        ? 'use fontFace()'
        : key.startsWith('@layer')
          ? 'layers are declared once in createSystem; per-style placement is the layer key'
          : 'use @media, @supports, @container, or @starting-style'

    this.report({
      code: 'VANITY_CSS_INVALID_KEY',
      message: `${this.at(path, key)} is not an at-rule css() nests`,
      path: this.at(path, key),
      fix: redirect,
    })
  }

  private selector(key: string, value: unknown, arm: VanityArm, path: string[]): void {
    if (!isPlainObject(value) && !Array.isArray(value) && !isOmit(value)) {
      this.report({
        code: 'VANITY_CSS_INVALID_KEY',
        message: `${this.at(path, key)} is a selector, so it takes a nested rule`,
        path: this.at(path, key),
      })
      return
    }

    // Native-nesting semantics: a selector without `&` is a descendant.
    const selector = key.includes('&') ? key : `& ${key}`
    const reason = checkSelector(selector)

    if (reason !== undefined) {
      this.report({
        code: 'VANITY_CSS_INVALID_SELECTOR',
        message: `${this.at(path, key)} does not parse: ${reason}`,
        path: this.at(path, key),
      })
      return
    }

    const merged = this.mergeArm(arm, { selector }, [...path, key])

    if (merged)
      this.walkInput(value, merged, [...path, key])
  }

  private property(key: string, value: unknown, arm: VanityArm, path: string[], authoredKey = key): void {
    const authoredPath = [...path, authoredKey]
    if (isPlainObject(value)) {
      // A nested object under a non-property reads as a mistyped condition,
      // not as a property-first map — name the key itself.
      if (!isCssProperty(kebab(key))) {
        const suggestion = didYouMean(key, [...this.ctx.conditions.keys()])
        this.report({
          code: 'VANITY_CSS_UNKNOWN_PROPERTY',
          message: `${this.at(path, authoredKey)} is neither a CSS property nor a condition of this system${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
          path: this.at(path, authoredKey),
          fix: suggestion ? `use '${suggestion}', or declare the condition in createSystem` : 'declare the condition in createSystem({ conditions })',
        })
        return
      }

      // The property-first direction: one property across conditions.
      for (const [conditionName, conditionValue] of Object.entries(value)) {
        if (conditionValue === undefined || conditionValue === null)
          continue

        if (conditionName === BASE) {
          this.declare(arm, key, conditionValue, authoredPath)
          continue
        }

        const condition = this.ctx.conditions.get(conditionName)

        if (condition === undefined) {
          const suggestion = didYouMean(conditionName, [...this.ctx.conditions.keys(), BASE])
          this.report({
            code: 'VANITY_CSS_UNKNOWN_CONDITION',
            message: `${this.at(authoredPath, conditionName)} is not a condition of this system${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
            path: this.at(authoredPath, conditionName),
            fix: suggestion ? `use '${suggestion}', or declare the condition in createSystem` : 'declare the condition in createSystem({ conditions })',
          })
          continue
        }

        for (const conditionArm of condition) {
          const merged = this.mergeArm(arm, conditionArm, [...authoredPath, conditionName])

          if (merged)
            this.declare(merged, key, conditionValue, [...authoredPath, conditionName])
        }
      }
      return
    }

    this.declare(arm, key, value, authoredPath)
  }

  private declare(arm: VanityArm, property: string, value: unknown, path: string[]): void {
    if (value === undefined || value === null || isOmit(value))
      return
    const at = path.join('.')

    try {
      const serialized = Array.isArray(value)
        ? value.map(entry => serializeStyleValue(entry, at, this.ctx))
        : serializeStyleValue(value, at, this.ctx)

      const cssProperty = kebab(property)

      for (const entry of Array.isArray(serialized) ? serialized : [serialized]) {
        // Numbers take the substrate's unit rule downstream, so only their
        // property's existence is checkable here — but it is checked: an
        // unknown property never rides a numeric value out silently.
        const issue = typeof entry === 'string'
          ? checkDeclaration(cssProperty, entry)
          : checkPropertyName(cssProperty)

        if (issue?.kind === 'unknown-property') {
          this.report({
            code: 'VANITY_CSS_UNKNOWN_PROPERTY',
            message: `${at} — ${issue.reason}${issue.suggestion ? ` — did you mean '${camel(issue.suggestion)}'?` : ''}`,
            path: at,
            fix: issue.suggestion ? `use ${camel(issue.suggestion)}` : 'use a CSS property, a condition, or a selector containing \'&\'',
          })
          return
        }

        if (issue?.kind === 'invalid-value') {
          this.report({
            code: 'VANITY_CSS_INVALID_VALUE',
            message: `${at}: ${issue.reason}`,
            path: at,
            fix: `give ${cssProperty} a value its grammar accepts`,
          })
          return
        }
      }

      this.unit(arm).declarations[property] = serialized
    }
    catch (error) {
      if (error instanceof VanityError) {
        this.diagnostics.push(...error.diagnostics)
        return
      }

      throw error
    }
  }

  private unit(arm: VanityArm): VanityUnit {
    const key = armKey(arm)
    const existing = this.units.at(-1)

    if (!this.forceNewUnit && existing && armKey(existing.arm) === key)
      return existing

    this.forceNewUnit = false
    const created: VanityUnit = { arm, declarations: {} }
    this.units.push(created)
    return created
  }

  private mergeArm(outer: VanityArm, inner: VanityConditionArm | VanityArm, path: string[]): VanityArm | undefined {
    if (outer.container !== undefined && inner.container !== undefined) {
      this.report({
        code: 'VANITY_CSS_INVALID_KEY',
        message: `${path.join('.')} nests two container conditions — a rule queries one container`,
        path: path.join('.'),
        fix: 'restructure so each rule sits under a single @container',
      })
      return undefined
    }

    return {
      media: joinQueries(outer.media, inner.media),
      supports: joinQueries(outer.supports, inner.supports),
      container: outer.container ?? inner.container,
      selector: composeSelectors(outer.selector, inner.selector),
      scopes: [...outer.scopes ?? [], ...inner.scopes ?? []],
      startingStyle: outer.startingStyle || ('startingStyle' in inner ? inner.startingStyle : undefined),
    }
  }

  private at(path: string[], key: string): string {
    return [...path, key].join('.')
  }

  private report(diagnostic: Omit<VanityDiagnostic, 'file'>): void {
    this.diagnostics.push({ ...diagnostic, file: this.ctx.file })
  }
}

// ─── Arm algebra ─────────────────────────────────────────────────────────────

/** The identity of an arm — units merge on it, recipes compare on it. */
export function armKey(arm: VanityArm): string {
  return JSON.stringify([arm.media, arm.supports, arm.container, arm.selector, arm.scopes, arm.startingStyle])
}

/** Validate a declared layer name against the system's order; `undefined` means valid. */
export function checkLayer(declared: string, layers: readonly string[]): Omit<VanityDiagnostic, 'file'> | undefined {
  if (layers.includes(declared))
    return undefined

  const suggestion = didYouMean(declared, layers)

  return {
    code: 'VANITY_SYSTEM_UNKNOWN_LAYER',
    message: `'${declared}' is not a layer of this system${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
    path: 'layer',
    fix: `use one of: ${layers.join(', ')} — or declare it in createSystem({ layers })`,
  }
}

function joinQueries(outer: string | undefined, inner: string | undefined): string | undefined {
  if (outer === undefined || inner === undefined)
    return outer ?? inner

  return `${outer} and ${inner}`
}

/** Intersect two `&` selectors: the inner's `&` becomes the outer, comma parts multiplied. */
export function composeSelectors(outer: string | undefined, inner: string | undefined): string | undefined {
  if (outer === undefined || inner === undefined)
    return outer ?? inner

  const products: string[] = []

  for (const outerPart of splitTopLevel(outer, ',')) {
    for (const innerPart of splitTopLevel(inner, ','))
      products.push(innerPart.replaceAll('&', outerPart.trim()))
  }

  return products.join(', ')
}

/** Split on a separator at nesting depth zero, respecting parens, brackets, and strings. */
export function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | undefined
  let start = 0

  for (let index = 0; index < text.length; index++) {
    const char = text[index]

    if (quote !== undefined) {
      if (char === quote && text[index - 1] !== '\\')
        quote = undefined
      continue
    }

    if (char === '\'' || char === '"') {
      quote = char
    }
    else if (char === '(' || char === '[') {
      depth++
    }
    else if (char === ')' || char === ']') {
      depth--
    }
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, index).trim())
      start = index + 1
    }
  }

  const tail = text.slice(start).trim()

  if (tail.length > 0)
    parts.push(tail)

  return parts
}

// ─── Key classification ──────────────────────────────────────────────────────

/** Selector keys contain `&`, whitespace, a combinator, or start like a simple selector. */
export function isSelectorKey(key: string): boolean {
  return /[&\s>~+]/.test(key) || /^[.#:[*]/.test(key)
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (value.constructor === Object || value.constructor === undefined)
}

/** Kebab back to camel, for suggestions that read like the authoring surface. */
function camel(property: string): string {
  return property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}
