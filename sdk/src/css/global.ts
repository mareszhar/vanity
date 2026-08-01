/**
 * `globalCss` ([spec-css.md §7]): the explicit global lane — same rule
 * shape as `css()` including conditions, no class generated, `reset` layer by
 * default, and just as validated as the scoped lane.
 */

import type { VanitySystemContext } from './css'
import type { VanityGlobalCssFunction, VanityRulesEmitter } from './types'
import { VanityError } from '../diagnostics'
import { checkSelector } from '../internal/cssParser'
import { record } from '../internal/inspect'
import { requireStyleModule } from '../internal/styleModule'
import { inDeclaredLayer } from './css'
import { emitGlobal } from './emit'
import { compileRule } from './rule'

export function bindGlobalCss(system: VanitySystemContext): VanityGlobalCssFunction<string, string> {
  return (selector, rule) => emitRule(system, selector, rule, 'globalCss')
}

/** The target explicit selector map. Every entry shares the same layer. */
export function bindRules(system: VanitySystemContext): VanityRulesEmitter<string, string> {
  const rules = ((entries: Readonly<Record<string, unknown>>) => {
    for (const [selector, rule] of Object.entries(entries))
      emitRule(system, selector, rule, 'rules')
  }) as VanityRulesEmitter<string, string>

  ;(rules as any).layer = (name: string) => bindRules(inDeclaredLayer(system, name))
  return rules
}

function emitRule(
  system: VanitySystemContext,
  selector: string,
  rule: unknown,
  surface: 'globalCss' | 'rules',
): void {
  const file = requireStyleModule(surface)
  const reason = checkSelector(selector)

  if (reason !== undefined) {
    throw new VanityError({
      code: 'VANITY_CSS_INVALID_SELECTOR',
      message: `the ${surface} selector '${selector}' does not parse: ${reason}`,
      file,
      fix: 'fix the selector — the same text must hold as CSS',
    })
  }

  const compiled = compileRule(rule, {
    ...system,
    defaultLayer: system.globalDefaultLayer,
    file,
  })

  record({ kind: 'escape', form: surface, file, detail: selector, layer: compiled.layer })
  emitGlobal(selector, compiled)
}
