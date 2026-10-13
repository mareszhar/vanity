/**
 * The rule compiler: one walk turns an authored rule object into emission
 * units — declarations under an *arm* (accumulated at-rule wrappers plus a
 * `&` selector). Both nesting directions land here and compile identically
 * ([patterns.md §5]); conditions compose by intersecting arms; every
 * declaration is validated by the parser gate before anything is emitted.
 */

import type { VanityDiagnosticInput as VanityDiagnostic } from '../diagnostics'
import type { VanityConditionArm } from '../system/conditions'
import type { VanityDeclarationRecord } from './declaration'
import type { VanityDeclarationFinding } from './findings'
import type { VanityCssPropertyName, VanityPropertyAliasMap, VanityPropertyAliasMode } from './types'
import type { VanityValueContext } from './values'
import { generate, parse } from 'css-tree'
import { isUnsafeValue } from '../atoms/handle'
import { didYouMean, getDeclarationSource, getDiagnosticSource, VanityError } from '../diagnostics'
import { collectInspectionWarning, record as recordInspection } from '../introspect/records'
import { convertToKebab } from '../tokens/names'
import { getArmKey } from './arm'
import { classifyDeclarationValue, resolveDeclarationValue } from './declaration'
import { inspectDeclarationPolicy } from './declarations-policy'
import { reportDeclarationFindings } from './findings'
import { isOmit } from './fragment'
import { resolveDeferredTokenDeclarationInput } from './tdec'
import { inspectTokenRestrictions } from './token-restrictions'
import { checkDeclaration, checkPropertyName, checkQuery, checkSelector, isCssProperty, serializeDeclarationNumber } from './validation'

export { getArmKey } from './arm'

export interface VanityRuleContext extends VanityValueContext {
  conditions: Map<string, readonly VanityConditionArm[]>
  layers: readonly string[]
  defaultLayer: string
  /** The system's root layer (its prefix) — every emitted rule nests under it. */
  layerRoot: string
  /** Seeds diagnostic paths — recipe arms report as `variants.intent.brand.…`. */
  rootPath?: readonly string[]
  styleName?: string
  audit?: import('../introspect/records').VanityAuditConfig
  /**
   * Resolves keys the host surface scopes beyond the system's conditions —
   * anatomy's `'root:open'`. Returns arms to nest under, a diagnostic for a
   * malformed scoped key, or `undefined` to fall through to ordinary
   * classification.
   */
  resolveScopedConditions?: (key: string) => VanityScopedConditionResult | undefined
  propertyAliases?: {
    aliases: VanityPropertyAliasMap
    expose: VanityPropertyAliasMode
  }
  standardEmitterName?: 'class.standard'
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
  declarationRecords?: VanityDeclarationRecord[]
  /** Last authored declaration group per property; findings retain all contributions. */
  emittedDeclarations?: Record<string, VanityDeclarationRecord[]>
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

export function compileStyleRule(rule: unknown, ctx: VanityRuleContext): VanityCompiled {
  const walker = new RuleWalker(ctx)
  walker.walkInput(rule, {}, [...ctx.rootPath ?? []])
  walker.throwIfFailed()
  return { layer: ctx.defaultLayer, layerRoot: ctx.layerRoot, units: walker.units }
}

class RuleWalker {
  readonly units: VanityUnit[] = []
  private readonly diagnostics: VanityDiagnostic[] = []
  private forceNewUnit = false
  private readonly contributions: Array<{ depth: number, index: number }> = []

  constructor(private readonly ctx: VanityRuleContext) {}

  throwIfFailed(): void {
    const findings: VanityDeclarationFinding[] = []
    for (const unit of this.units) {
      const substitutions = new Map<string, string>()
      for (const candidate of this.units) {
        if (getArmKey(candidate.arm) !== getArmKey(unit.arm) && getArmKey(candidate.arm) !== getArmKey({}))
          continue
        for (const [property, value] of Object.entries(candidate.declarations)) {
          if (property.startsWith('--'))
            substitutions.set(property, String(Array.isArray(value) ? value.at(-1) : value))
        }
      }
      for (const record of unit.declarationRecords ?? []) {
        resolveDeclarationValue(record, { arm: unit.arm, substitutions })
        findings.push(...inspectDeclarationPolicy(record, this.ctx, this.ctx.styleName))
        findings.push(...inspectTokenRestrictions(record, this.ctx, this.ctx.styleName))
        if (record.escape) {
          recordInspection({ kind: 'escape', form: 'unsafe', file: this.ctx.file, ...getDiagnosticSource(record.path), detail: `${record.property}: ${record.value}`, reason: record.escape.reason, style: this.ctx.styleName, property: record.property, layer: this.ctx.defaultLayer })
        }
        for (const component of record.components) {
          if (component.incompatible) {
            findings.push({ declaration: record, style: this.ctx.styleName, diagnostic: {
              code: 'VANITY_CSS_TOKEN_KIND',
              message: `${record.path}: <${component.dataType}> ${component.tokens.length ? `token '${component.tokens.join(', ')}'` : component.origin} does not fit ${component.component}`,
              detail: [component.incompatible.reason],
              path: record.path,
              fix: `use a value whose declared data type fits ${component.component}`,
              file: this.ctx.file,
            } })
          }
        }
      }
    }
    if (this.diagnostics.length > 0)
      throw new VanityError(this.diagnostics)
    reportDeclarationFindings(findings)
  }

  walkInput(input: unknown, arm: VanityArm, path: string[]): void {
    if (input === undefined || input === null || input === false || isOmit(input))
      return

    if (Array.isArray(input)) {
      for (const [index, contribution] of input.entries()) {
        this.forceNewUnit = true
        this.contributions.push({ depth: path.length, index })
        try {
          this.walkInput(contribution, arm, path)
        }
        finally {
          this.contributions.pop()
        }
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
    const deferredDeclarations = resolveDeferredTokenDeclarationInput(rule)
    if (deferredDeclarations !== undefined) {
      if (this.ctx.resolveTokenDeclarations === undefined) {
        this.report({
          code: 'VANITY_TOKENS_INVALID_OVERRIDE',
          message: 'this token declaration fragment is not bound to a locked token module',
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
          message: `${this.joinPath(path, key)} — layer placement is emitter configuration, not rule data`,
          path: this.joinPath(path, key),
          fix: `use the emitter's .layer(name) method or ds.inLayer(name)`,
        })
        continue
      }

      if (key === '[object Object]') {
        this.report({
          code: 'VANITY_CSS_INVALID_KEY',
          message: `${this.joinPath(path, key)} is a condition object used as a style key`,
          path: this.joinPath(path, key),
          fix: 'register the condition in createSystem({ conditions }), then use its name as the key',
        })
        continue
      }

      const condition = this.ctx.conditions.get(key)

      this.inspectSelector(key, path)

      if (condition !== undefined) {
        this.nest(key, value, condition, arm, path)
        continue
      }

      const scoped = this.ctx.resolveScopedConditions?.(key)

      if (scoped !== undefined) {
        if ('diagnostic' in scoped)
          this.report(scoped.diagnostic)
        else
          this.nest(key, value, scoped.arms, arm, path)
        continue
      }

      if (key.startsWith('--')) {
        this.declare(arm, key, value, [...path, key])
        continue
      }

      if (key.startsWith('@')) {
        this.visitAtRule(key, value, arm, path)
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
            message: `${this.joinPath(path, key)} and ${this.joinPath(path, alias)} declare the same CSS property`,
            path: this.joinPath(path, key),
            fix: 'choose either the alias or the standard property name in this rule arm',
          })
          continue
        }
        this.writeProperty(alias, value, arm, path, key)
        continue
      }

      if (this.ctx.propertyAliases?.expose === 'aliases-only'
        && Object.values(this.ctx.propertyAliases.aliases).includes(key as VanityCssPropertyName)) {
        this.report({
          code: 'VANITY_CSS_INVALID_KEY',
          message: `${this.joinPath(path, key)} is hidden by the aliases-only policy`,
          path: this.joinPath(path, key),
          fix: `use the configured alias, or write this declaration through ${this.ctx.standardEmitterName ?? 'class.standard'}()`,
        })
        continue
      }

      this.writeProperty(key, value, arm, path)
    }
  }

  /** A named condition forks the walk into each of its arms. */
  private nest(key: string, value: unknown, condition: readonly VanityConditionArm[], arm: VanityArm, path: string[]): void {
    if (!isPlainObject(value) && !Array.isArray(value) && !isOmit(value)) {
      this.report({
        code: 'VANITY_CSS_INVALID_KEY',
        message: `${this.joinPath(path, key)} is a condition, so it takes a nested rule — not a plain value`,
        path: this.joinPath(path, key),
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

  private visitAtRule(key: string, value: unknown, arm: VanityArm, path: string[]): void {
    if (!isPlainObject(value) && !Array.isArray(value) && !isOmit(value)) {
      this.report({
        code: 'VANITY_CSS_INVALID_KEY',
        message: `${this.joinPath(path, key)} takes a nested rule`,
        path: this.joinPath(path, key),
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
          message: `${this.joinPath(path, key)} does not parse: ${reason}`,
          path: this.joinPath(path, key),
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
      message: `${this.joinPath(path, key)} is not an at-rule class() nests`,
      path: this.joinPath(path, key),
      fix: redirect,
    })
  }

  private selector(key: string, value: unknown, arm: VanityArm, path: string[]): void {
    if (!isPlainObject(value) && !Array.isArray(value) && !isOmit(value)) {
      this.report({
        code: 'VANITY_CSS_INVALID_KEY',
        message: `${this.joinPath(path, key)} is a selector, so it takes a nested rule`,
        path: this.joinPath(path, key),
      })
      return
    }

    // Native-nesting semantics: a selector without `&` is a descendant.
    const selector = nestSelector(key)
    const reason = checkSelector(selector, [...path, key])

    if (reason !== undefined) {
      this.report({
        code: 'VANITY_CSS_INVALID_SELECTOR',
        message: `${this.joinPath(path, key)} does not parse: ${reason}`,
        path: this.joinPath(path, key),
      })
      return
    }

    const merged = this.mergeArm(arm, { selector }, [...path, key])

    if (merged)
      this.walkInput(value, merged, [...path, key])
  }

  private writeProperty(key: string, value: unknown, arm: VanityArm, path: string[], authoredKey = key): void {
    const authoredPath = [...path, authoredKey]
    if (isPlainObject(value) && !isUnsafeValue(value)) {
      // A nested object under a non-property reads as a mistyped condition,
      // not as a property-first map — name the key itself.
      if (!isCssProperty(convertToKebab(key))) {
        const suggestion = didYouMean(key, [...this.ctx.conditions.keys()])
        this.report({
          code: 'VANITY_CSS_UNKNOWN_PROPERTY',
          message: `${this.joinPath(path, authoredKey)} is neither a CSS property nor a condition of this system${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
          path: this.joinPath(path, authoredKey),
          fix: suggestion ? `use '${suggestion}', or declare the condition in createSystem` : 'declare the condition in createSystem({ conditions })',
        })
        return
      }

      // The property-first direction: one property across conditions.
      for (const [conditionName, conditionValue] of Object.entries(value)) {
        if (conditionValue === undefined || conditionValue === null)
          continue

        if (conditionName === BASE) {
          this.declare(arm, key, conditionValue, authoredPath, [...authoredPath, BASE], authoredKey)
          continue
        }

        const condition = this.ctx.conditions.get(conditionName)

        if (condition === undefined) {
          const suggestion = didYouMean(conditionName, [...this.ctx.conditions.keys(), BASE])
          this.report({
            code: 'VANITY_CSS_UNKNOWN_CONDITION',
            message: `${this.joinPath(authoredPath, conditionName)} is not a condition of this system${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
            path: this.joinPath(authoredPath, conditionName),
            fix: suggestion ? `use '${suggestion}', or declare the condition in createSystem` : 'declare the condition in createSystem({ conditions })',
          })
          continue
        }

        for (const conditionArm of condition) {
          const merged = this.mergeArm(arm, conditionArm, [...authoredPath, conditionName])

          if (merged)
            this.declare(merged, key, conditionValue, [...authoredPath, conditionName], [...authoredPath, conditionName], authoredKey)
        }
      }
      return
    }

    this.declare(arm, key, value, authoredPath, authoredPath, authoredKey)
  }

  private declare(arm: VanityArm, property: string, value: unknown, path: string[], sourcePath = path, authoredKey = property): void {
    if (value === undefined || value === null || isOmit(value))
      return
    const at = path.join('.')

    try {
      const cssProperty = convertToKebab(property)
      const records = (Array.isArray(value) ? value : [value]).map(entry => classifyDeclarationValue(cssProperty, entry, at, this.ctx))
      const indexedSourcePath: string[] = []
      for (let depth = 0; depth <= sourcePath.length; depth++) {
        for (const contribution of this.contributions.filter(contribution => contribution.depth === depth))
          indexedSourcePath.push(String(contribution.index))
        if (depth < sourcePath.length)
          indexedSourcePath.push(sourcePath[depth]!)
      }
      const provenance = getDeclarationSource(indexedSourcePath)
      for (const record of records) {
        Object.assign(record, provenance)
        const propertyIndex = path.lastIndexOf(property)
        record.conditionPath = path.filter((_, index) => index !== propertyIndex)
        record.stylePath = this.ctx.rootPath
        if (authoredKey !== property)
          record.authoredKey = authoredKey
      }
      const serialized = Array.isArray(value) ? records.map(record => record.value) : records[0]!.value

      for (const entry of Array.isArray(serialized) ? serialized : [serialized]) {
        // Preserve the authored number for emission, but validate the CSS
        // produced by the same substrate unit rule that emission uses.
        const issue = typeof entry === 'string'
          ? checkDeclaration(cssProperty, entry)
          : checkPropertyName(cssProperty) ?? checkDeclaration(cssProperty, serializeDeclarationNumber(cssProperty, entry))

        if (issue?.kind === 'unknown-property') {
          this.report({
            code: 'VANITY_CSS_UNKNOWN_PROPERTY',
            message: `${at} — ${issue.reason}${issue.suggestion ? ` — did you mean '${convertToCamel(issue.suggestion)}'?` : ''}`,
            path: at,
            fix: issue.suggestion ? `use ${convertToCamel(issue.suggestion)}` : 'use a CSS property, a condition, or a selector containing \'&\'',
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

      const unit = this.createUnit(arm)
      unit.declarations[property] = serialized
      unit.emittedDeclarations ??= {}
      unit.emittedDeclarations[property] = records
      unit.declarationRecords ??= []
      unit.declarationRecords.push(...records)
    }
    catch (error) {
      if (error instanceof VanityError) {
        this.diagnostics.push(...error.diagnostics)
        return
      }

      throw error
    }
  }

  private createUnit(arm: VanityArm): VanityUnit {
    const key = getArmKey(arm)
    const existing = this.units.at(-1)

    if (!this.forceNewUnit && existing && getArmKey(existing.arm) === key)
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
      selector: composeSelectors(outer.selector, inner.selector === undefined ? undefined : nestSelector(inner.selector)),
      scopes: [...outer.scopes ?? [], ...inner.scopes ?? []],
      startingStyle: outer.startingStyle || ('startingStyle' in inner ? inner.startingStyle : undefined),
    }
  }

  private joinPath(path: string[], key: string): string {
    return [...path, key].join('.')
  }

  private report(diagnostic: Omit<VanityDiagnostic, 'file'>): void {
    this.diagnostics.push({ ...diagnostic, file: this.ctx.file })
  }

  private inspectSelector(key: string, path: string[]): void {
    const selector = key.trimStart()
    const level = this.ctx.audit?.unanchoredSelectors ?? 'warn'
    if (level === 'off' || !selector.startsWith(':') || selector.includes('&'))
      return
    let selectors
    try {
      selectors = parse(selector, { context: 'selectorList' })
    }
    catch (error) {
      // Invalid selector text keeps the rule walker's existing CSS diagnostic.
      if (error instanceof Error && error.name === 'SyntaxError')
        return
      throw error
    }
    if (selectors.type !== 'SelectorList')
      return
    const anchored = selectors.children.toArray().map(entry => `&${generate(entry)}`).join(', ')
    const diagnostic: VanityDiagnostic = {
      code: 'VANITY_SELECTOR_UNANCHORED',
      severity: level === 'error' ? 'error' : 'warning',
      message: `${this.joinPath(path, key)} matches descendants of the styled element`,
      path: this.joinPath(path, key),
      file: this.ctx.file,
      ...getDiagnosticSource(this.joinPath(path, key)),
      fix: `write '${anchored}' to match the styled element; keep '${key}' only for intentional descendants`,
    }
    if (level === 'error')
      this.report(diagnostic)
    else
      collectInspectionWarning(diagnostic)
  }
}

// ─── Arm algebra ─────────────────────────────────────────────────────────────

/** The identity of an arm — units merge on it, recipes compare on it. */

/** Validate a declared layer name against the system's order; `undefined` means valid. */
export function checkLayer(declared: string, layers: readonly string[]): Omit<VanityDiagnostic, 'file'> | undefined {
  if (layers.includes(declared))
    return undefined

  const suggestion = didYouMean(declared, layers)

  return {
    code: 'VANITY_SYSTEM_UNKNOWN_LAYER',
    message: `'${declared}' is not a layer of this system${suggestion ? ` — did you mean '${suggestion}'?` : ''}`,
    path: 'layer',
    fix: `use one of: ${layers.join(', ')} — or declare it in createSystem({ layerOrder })`,
  }
}

function joinQueries(outer: string | undefined, inner: string | undefined): string | undefined {
  if (outer === undefined || inner === undefined)
    return outer ?? inner

  return `${outer} and ${inner}`
}

/** Place a selector under its rule anchor using native CSS nesting semantics. */
export function nestSelector(selector: string): string {
  return selector.includes('&') ? selector : `& ${selector}`
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
function convertToCamel(property: string): string {
  return property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}
