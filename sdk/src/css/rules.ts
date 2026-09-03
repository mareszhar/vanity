import type { VanitySystemContext } from './context'
import type { VanityRulesEmitter } from './types'
import { VanityError } from '../diagnostics'
import { record } from '../introspect/records'
import { substrate } from '../substrate'
import { createLayerContext } from './context'
import { emitGlobal } from './emit'
import { compileStyleRule } from './rule'
import { checkSelector } from './validation'

/** The canonical selector-map emitter. */
export function createRulesEmitter(system: VanitySystemContext): VanityRulesEmitter<string, string> {
  const rules = ((entries: Readonly<Record<string, unknown>>) => {
    for (const [selector, rule] of Object.entries(entries))
      emitRule(system, selector, rule)
  }) as VanityRulesEmitter<string, string>
  ;(rules as any).layer = (name: string) => createRulesEmitter(createLayerContext(system, name))
  return rules
}

function emitRule(system: VanitySystemContext, selector: string, rule: unknown): void {
  const file = substrate.modules.requireStyleModule('rules')
  const reason = checkSelector(selector)
  if (reason !== undefined) {
    throw new VanityError({
      code: 'VANITY_CSS_INVALID_SELECTOR',
      message: `the rules selector '${selector}' does not parse: ${reason}`,
      file,
      fix: 'fix the selector — the same text must hold as CSS',
    })
  }
  const compiled = compileStyleRule(rule, {
    ...system,
    defaultLayer: system.globalDefaultLayer,
    file,
  })
  record({ kind: 'escape', form: 'rules', file, detail: selector, layer: compiled.layer })
  emitGlobal(selector, compiled)
}
