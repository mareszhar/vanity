import type { VanityDeclarationPolicies } from '../values/policies'
import type { VanityCssDataType } from '../values/types'
import type { VanityDeclarationRecord } from './declaration'
import type { VanityDeclarationFinding } from './findings'
import type { VanityValueContext } from './values'
import { resolveTokenReplacement } from '../tokens/deprecation'
import { convertToKebab } from '../tokens/names'
import { getDeclarationPropertyData } from './grammar'

/** Policy consumes the finalized origin record; it never reclassifies a style value. */
export function inspectDeclarationPolicy(record: VanityDeclarationRecord, ctx: VanityValueContext, style?: string): VanityDeclarationFinding[] {
  const policy = ctx.policies?.declarations
  if (!policy)
    return []
  const propertyRequired = Object.entries(policy.properties ?? {}).some(([property, requirement]) => requirement === 'token' && convertToKebab(property) === record.property)
  const findings: VanityDeclarationFinding[] = []
  for (const component of record.components) {
    const governed = propertyRequired || isRequiredType(policy, component.dataType, component.component)
    record.governed ||= governed
    if (component.origin === 'unsafe' || component.origin === 'port')
      continue
    const primitives = component.origin === 'token' ? component.tokens.filter(path => ctx.tokenGraph?.nodes.get(path)?.contract.usage?.tier === 'primitive') : []
    if (primitives.length) {
      add('VANITY_DECLARATION_PRIMITIVE', `${record.path}: primitive token '${primitives.join(', ')}' is used directly in a style declaration`, 'use a semantic role, or label the deliberate exception with unsafe.value')
      continue
    }
    if (!governed || policy.mechanics?.includes(component.value))
      continue
    if (component.origin === 'token')
      continue
    if (component.origin === 'derived') {
      if (policy.derivations === 'restrict' && !component.derivation?.allowed)
        add('VANITY_DECLARATION_DERIVED', `${record.path}: ${component.value} — ${component.derivation?.reason ?? 'The net transformation is not established'}`, 'use integer or reciprocal scaling of one token, an unscaled token sum, or label the exception with unsafe.value')
      continue
    }
    const nodes = [...new Set([...ctx.tokenGraph?.nodes.values() ?? []].map(node => resolveTokenReplacement(node, ctx.tokenGraph!)))]
    const amount = getNumericValue(component.value)
    const candidates = nodes.filter(node => node.handle.$type === component.dataType)
      .map(node => ({ node, value: String(node.handle.$val), parsed: getNumericValue(String(node.handle.$val)) }))
      .filter(candidate => amount === undefined || candidate.parsed?.unit === amount.unit)
      .sort((left, right) => amount ? Math.abs((left.parsed?.value ?? Infinity) - amount.value) - Math.abs((right.parsed?.value ?? Infinity) - amount.value) || left.node.key.localeCompare(right.node.key) : left.node.key.localeCompare(right.node.key))
      .slice(0, 3)
    const equal = candidates.filter(candidate => candidate.value === component.value && candidate.node.contract.reference === 'val')
    const suggestions = candidates.map(({ node, value }) => `${node.key} (${value}${node.contract.usage?.for?.length ? `, ${node.contract.usage.for.join('; ')}` : node.meta.description ? `, ${node.meta.description}` : ''})`)
    add('VANITY_DECLARATION_RAW', `${record.path}: '${component.value}' — ${component.component} <${component.dataType}> must come from a token under this system's declarations policy`, `use a role, or record an exception: unsafe.value(${JSON.stringify(component.value)}, 'state the intent')${equal.length ? '; pass the handle directly, or give the token reference: \'var\'' : ''}`, [...(suggestions.length ? [`Nearest roles: ${suggestions.join(', ')}.`] : []), ...(equal.length ? [`The literal equals ${equal.map(candidate => candidate.node.key).join(', ')}; val interpolation does not retain token identity.`] : [])])
  }
  return findings

  function add(code: 'VANITY_DECLARATION_RAW' | 'VANITY_DECLARATION_DERIVED' | 'VANITY_DECLARATION_PRIMITIVE', message: string, fix: string, detail: string[] = []): void {
    findings.push({ declaration: record, style, diagnostic: { code, severity: policy!.level === 'discourage' ? 'warning' : 'error', message, path: record.path, file: ctx.file, detail: [...detail, ...(policy!.reason ? [policy!.reason] : [])], fix } })
  }
}

function matchesPolicyType(policy: VanityDeclarationPolicies, type: string): boolean {
  return policy.tokens?.includes(type as VanityCssDataType) === true
    || ((type === 'length-percentage' || type === 'number-percentage') && type.split('-').some(part => policy.tokens?.includes(part as VanityCssDataType)))
}

function isRequiredType(policy: VanityDeclarationPolicies, type: string, property: string): boolean {
  if (matchesPolicyType(policy, type))
    return true
  return type === 'unknown' && isDeclarationPropertyGoverned(policy, property)
}

/** Audits use the same generated property vocabulary to avoid duplicate findings. */
export function isDeclarationPropertyGoverned(policy: VanityDeclarationPolicies, property: string): boolean {
  return Object.keys(policy.properties ?? {}).some(name => convertToKebab(name) === property)
    || (getDeclarationPropertyData(property)?.acceptedTypes ?? []).some(type => matchesPolicyType(policy, type))
}

function getNumericValue(source: string): { value: number, unit: string } | undefined {
  const match = /^([+-]?(?:\d*\.)?\d+)([a-z%]*)$/i.exec(source)
  return match ? { value: Number(match[1]), unit: match[2]! } : undefined
}
