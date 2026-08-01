/**
 * Emission: compiled units become substrate calls, every rule inside its
 * `@layer` ([patterns.md §6]). The base unit rides `style()` (it owns the
 * class); every conditioned or selector unit is a `globalStyle` against the
 * resolved selector, in source order — within a layer, ordinary CSS order
 * applies. Interpolated class names stay bare; the substrate's selector
 * transform dots every registered class.
 */

import type { VanityArm, VanityCompiled, VanityUnit } from './rule'
import { globalStyle, style } from '@vanilla-extract/css'
import { splitTopLevel } from './rule'

type SubstrateRule = Record<string, unknown>

export function emitStyle(compiled: VanityCompiled, debugId?: string): string {
  const layer = qualifiedLayer(compiled)
  const [baseUnit, rest] = splitBase(compiled.units)
  const className = style(inLayer(layer, toSubstrateRule(baseUnit?.declarations ?? {})), debugId)

  for (const unit of rest) {
    const selector = unit.arm.selector === undefined
      ? className
      : unit.arm.selector.replaceAll('&', className)

    globalStyle(selector, inLayer(layer, wrapAtRules(unit.arm, toSubstrateRule(unit.declarations))))
  }

  return className
}

/**
 * Attach every unit — the base included — to an already-created class.
 * Anatomy parts are created before their rules compile (cross-part references
 * need every part's class name first), so their rules land here.
 */
export function emitOnto(className: string, compiled: VanityCompiled): void {
  const layer = qualifiedLayer(compiled)

  for (const unit of compiled.units) {
    const selector = unit.arm.selector === undefined
      ? className
      : unit.arm.selector.replaceAll('&', className)

    globalStyle(selector, inLayer(layer, wrapAtRules(unit.arm, toSubstrateRule(unit.declarations))))
  }
}

export function emitGlobal(selector: string, compiled: VanityCompiled): void {
  const layer = qualifiedLayer(compiled)

  for (const unit of compiled.units) {
    const resolved = unit.arm.selector === undefined
      ? selector
      : composeOnto(selector, unit.arm.selector)

    globalStyle(resolved, inLayer(layer, wrapAtRules(unit.arm, toSubstrateRule(unit.declarations))))
  }
}

/** `recipes` under root `prism` → `prism.recipes` — the emitted, namespaced form. */
function qualifiedLayer(compiled: VanityCompiled): string {
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
export function toSubstrateRule(declarations: Record<string, string | number | Array<string | number>>): SubstrateRule {
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

export function wrapAtRules(arm: VanityArm, rule: SubstrateRule): SubstrateRule {
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

export function inLayer(layer: string, rule: SubstrateRule): SubstrateRule {
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
