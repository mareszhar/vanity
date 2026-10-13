/**
 * Emission: compiled units become substrate calls, every rule inside its
 * `@layer` ([patterns.md §6]). The base unit rides `style()` (it owns the
 * class); every conditioned or selector unit is a `globalStyle` against the
 * resolved selector, in source order — within a layer, ordinary CSS order
 * applies. Interpolated class names stay bare; the substrate's selector
 * transform dots every registered class.
 */

import type { VanityEmittedDeclarationRecord } from '../introspect/records'
import type { VanityArm, VanityCompiled, VanityUnit } from './rule'
import { getDiagnosticExports, getDiagnosticSource } from '../diagnostics'
import { record } from '../introspect/records'
import { substrate } from '../substrate'
import { getStyleModuleFile } from './context'
import { getArmKey, splitTopLevel } from './rule'

type SubstrateRule = Record<string, unknown>

export function emitStyle(compiled: VanityCompiled, debugId?: string): string {
  const layer = getQualifiedLayer(compiled)
  const [baseUnit, rest] = splitBase(compiled.units)
  const className = substrate.css.emitClassRule({
    rule: applyLayer(layer, convertToSubstrateRule(baseUnit?.declarations ?? {})),
    debugId,
  })

  for (const unit of rest) {
    const selector = unit.arm.selector === undefined
      ? className
      : unit.arm.selector.replaceAll('&', className)

    substrate.css.emitGlobalRule({
      selector,
      rule: applyLayer(layer, applyAtRules(unit.arm, convertToSubstrateRule(unit.declarations))),
    })
  }

  recordEmittedStyle(className, compiled, debugId, [...baseUnit ? [baseUnit] : [], ...rest])
  return className
}

/**
 * Attach every unit — the base included — to an already-created class.
 * Anatomy parts are created before their rules compile (cross-part references
 * need every part's class name first), so their rules land here.
 */
export function emitOnto(className: string, compiled: VanityCompiled): void {
  const layer = getQualifiedLayer(compiled)

  for (const unit of compiled.units) {
    const selector = unit.arm.selector === undefined
      ? className
      : unit.arm.selector.replaceAll('&', className)

    substrate.css.emitGlobalRule({
      selector,
      rule: applyLayer(layer, applyAtRules(unit.arm, convertToSubstrateRule(unit.declarations))),
    })
  }
  recordEmittedStyle(className, compiled)
}

export function emitGlobal(selector: string, compiled: VanityCompiled): void {
  const layer = getQualifiedLayer(compiled)

  for (const unit of compiled.units) {
    const resolved = unit.arm.selector === undefined
      ? selector
      : composeOnto(selector, unit.arm.selector)

    substrate.css.emitGlobalRule({
      selector: resolved,
      rule: applyLayer(layer, applyAtRules(unit.arm, convertToSubstrateRule(unit.declarations))),
    })
  }
}

/** The substrate merges identical arms: first property position, last authored value. */
function recordEmittedStyle(className: string, compiled: VanityCompiled, name?: string, units = compiled.units): void {
  const groups = new Map<string, { arm: VanityArm, declarations: Map<string, import('./declaration').VanityDeclarationRecord[]> }>()
  for (const unit of units) {
    const key = getArmKey(unit.arm)
    let group = groups.get(key)
    if (!group) {
      group = { arm: unit.arm, declarations: new Map() }
      groups.set(key, group)
    }
    for (const [property, declarations] of Object.entries(unit.emittedDeclarations ?? {}))
      group.declarations.set(property, declarations)
  }
  const layer = getQualifiedLayer(compiled)
  const emittedDeclarations: VanityEmittedDeclarationRecord[] = []
  let groupOrdinal = 0
  for (const group of groups.values()) {
    const ordinal = groupOrdinal++
    const selector = group.arm.selector === undefined ? className : group.arm.selector.replaceAll('&', className)
    for (const declarations of group.declarations.values()) {
      for (const declaration of declarations) {
        const conditions = [...declaration.conditionPath ?? []]
        if (declaration.authoredKey !== undefined) {
          const index = conditions.lastIndexOf(declaration.authoredKey)
          if (index >= 0)
            conditions.splice(index, 1)
        }
        emittedDeclarations.push({ ...declaration, conditionPath: conditions.slice(declaration.stylePath?.length ?? 0), arm: { ...group.arm, selector, ordinal }, layer })
      }
    }
  }
  const vars = new Set<string>()
  for (const declaration of emittedDeclarations) {
    for (const match of String(declaration.value).matchAll(/var\((--[\w-]+)/g))
      vars.add(match[1]!)
  }
  record({
    kind: 'style',
    file: getStyleModuleFile()?.filePath,
    ...getDiagnosticSource(),
    ...(name === undefined ? {} : { name }),
    class: className,
    vars: [...vars],
    declarations: compiled.units.flatMap(unit => unit.declarationRecords ?? []),
    emittedDeclarations,
    layer,
    exports: getDiagnosticExports(),
  })
}

/** `recipes` under root `prism` → `prism.recipes` — the emitted, namespaced form. */
function getQualifiedLayer(compiled: VanityCompiled): string {
  return `${compiled.layerRoot}.${compiled.layer}`
}

function splitBase(units: VanityUnit[]): [VanityUnit | undefined, VanityUnit[]] {
  const base = units.find(unit => isBaseArm(unit.arm))
  return [base, units.filter(unit => unit !== base)]
}

function isBaseArm(arm: VanityArm): boolean {
  return arm.media === undefined && arm.supports === undefined
    && arm.container === undefined && arm.selector === undefined
    && (arm.scopes?.length ?? 0) === 0 && !arm.startingStyle
}

/** Custom-property keys ride the substrate's `vars`; everything else is a declaration. */
function convertToSubstrateRule(declarations: Record<string, string | number | Array<string | number>>): SubstrateRule {
  const rule: SubstrateRule = {}
  let vars: Record<string, string> | undefined

  for (const [property, value] of Object.entries(declarations)) {
    if (property.startsWith('--')) {
      vars = vars ?? {}
      vars[property] = String(value)
    }
    else {
      rule[property] = value
    }
  }

  return vars === undefined ? rule : { ...rule, vars }
}

function applyAtRules(arm: VanityArm, rule: SubstrateRule): SubstrateRule {
  let wrapped = rule

  if (arm.startingStyle)
    wrapped = { '@starting-style': wrapped }

  if (arm.container !== undefined)
    wrapped = { '@container': { [arm.container]: wrapped } }

  if (arm.supports !== undefined)
    wrapped = { '@supports': { [arm.supports]: wrapped } }

  if (arm.media !== undefined)
    wrapped = { '@media': { [arm.media]: wrapped } }

  for (const scope of [...arm.scopes ?? []].reverse())
    wrapped = { '@scope': { [scope]: wrapped } }

  return wrapped
}

function applyLayer(layer: string, rule: SubstrateRule): SubstrateRule {
  return { '@layer': { [layer]: rule } }
}

/** Substitute a global selector's parts for `&` in a condition's selector arm. */
function composeOnto(globalSelector: string, armSelector: string): string {
  const products: string[] = []

  for (const globalPart of splitTopLevel(globalSelector, ',')) {
    for (const armPart of splitTopLevel(armSelector, ','))
      products.push(armPart.replaceAll('&', globalPart))
  }

  return products.join(', ')
}
