import type { VanityDeclarationRecord } from './declaration'
import type { VanityDeclarationFinding } from './findings'
import type { VanityValueContext } from './values'
import { convertToKebab } from '../tokens/names'
import { isDeclarationPropertyAllowed } from './grammar'

/** Enforce token contracts over the classifier's finalized components. */
export function inspectTokenRestrictions(record: VanityDeclarationRecord, ctx: VanityValueContext, style?: string): VanityDeclarationFinding[] {
  const findings: VanityDeclarationFinding[] = []
  for (const component of record.components) {
    if (component.origin === 'unsafe' || component.origin === 'port')
      continue
    for (const path of component.tokens) {
      const restriction = ctx.tokenGraph?.nodes.get(path)?.contract.restrict
      if (!restriction || restriction.properties.some(property => isDeclarationPropertyAllowed(component.component, convertToKebab(property))))
        continue
      findings.push({ declaration: record, style, diagnostic: {
        code: 'VANITY_TOKEN_RESTRICTED',
        severity: restriction.level === 'discourage' ? 'warning' : 'error',
        message: `${record.path}: token '${path}' is not permitted in ${component.component}`,
        detail: restriction.reason ? [restriction.reason] : [],
        path: record.path,
        file: ctx.file,
        fix: `use this role in ${restriction.properties.join(', ')}, choose a role for ${component.component}, or label an exception with unsafe.value`,
      } })
    }
  }
  return findings
}
