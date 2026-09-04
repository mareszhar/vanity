/** Resolve an open-system snapshot into the direct locked system contract. */

import type { VanityValueOperationContext } from '../values/kernel'
import type { VanityConsolidateOptions } from './open'
import type { OpenSystemState } from './state'
import { getStyleModuleFile, hasStyleModuleFile } from '../css/context'
import { getDiagnosticSource, VanityError } from '../diagnostics'
import { getConstructorUsages } from '../tokens/module'
import { getTokenModuleRequirement } from '../tokens/requirements'
import { resolveTokenModule } from '../tokens/resolve'
import { serializeValueWithContext } from '../values/kernel'
import { VANITY_DEFAULT_CSS_SUPPORT } from '../values/protocol'
import { reorderAxes } from './axes'
import { materializeLockedSystemContract, VANITY_DEFAULT_LAYERS } from './locked'
import { getPluginIds } from './plugins'
import { resolvePolicies } from './policies'
import { getSystemTokenModuleRequirement } from './shape'

type OpenState = OpenSystemState

export function consolidateSystem(
  state: OpenState,
  options: VanityConsolidateOptions = {},
): object {
  assertPlainSystemModule()
  const source = getDiagnosticSource()?.file
  const finalState = options.axisOrder === undefined
    ? state
    : { ...state, axes: reorderAxes(state.axes, options.axisOrder) } as OpenState
  const policyPreview = previewTokenModule(finalState, finalState.tokens as object)
  enforceConstructorPolicies(state, policyPreview)
  const declaredLayers = options.layerOrder ?? state.policies.layerOrder ?? VANITY_DEFAULT_LAYERS
  for (const [name, group] of Object.entries(state.rules)) {
    if (group.layer !== undefined && !declaredLayers.includes(group.layer)) {
      throw new VanityError({
        code: 'VANITY_SYSTEM_UNKNOWN_LAYER',
        message: `named system rule '${name}' references undeclared layer '${group.layer}'; `
          + 'declare it in policies.layerOrder or consolidate({ layerOrder })',
        path: ['rules', name, 'layer'],
        file: source,
        fix: 'declare the layer in policies.layerOrder or consolidate({ layerOrder })',
      })
    }
  }
  if (state.revisions.singularAdds > 40) {
    console.warn(
      `[vanity] VANITY_SYSTEM_SINGULAR_ADD_THRESHOLD: this system accumulated ${state.revisions.singularAdds} singular add links. `
      + 'For a shorter type chain, group bulk vocabulary with define*().add() and mount it through the plural add method.',
    )
  }
  const { axisOrder: _axisOrder, ...systemOptions } = options
  const valueContext = getValueContext(finalState)
  const requirement = getTokenRequirementOfState(finalState, valueContext)
  return materializeLockedSystemContract(
    {
      kernel: finalState.values,
      valueContext,
      signature: requirement.capabilitySignature,
      requirement,
      tokenPolicy: getTokenPolicyOfState(finalState),
      axes: finalState.axes,
      dtcg: finalState.codecs,
    },
    {
      tokens: finalState.tokens as any,
      conditions: finalState.conditions,
      ...(systemOptions.layerOrder !== undefined || finalState.policies.layerOrder === undefined
        ? {}
        : { layerOrder: finalState.policies.layerOrder }),
      ...systemOptions,
    } as any,
    {
      ...(source === undefined ? {} : { source }),
      consts: finalState.consts,
      utilities: getFlattenedPaths(finalState.utils),
      utilityTree: finalState.utils,
      ruleGroups: describeSystemRules(finalState.rules, source),
      systemRules: finalState.rules,
      policies: finalState.policies,
      plugins: getPluginIds(finalState.plugins),
      owners: finalState.provenance.owners,
      overwrites: finalState.provenance.overwrites,
    },
  )
}

function getValueContext(state: OpenState): VanityValueOperationContext {
  const policies = resolvePolicies(state.policies, {
    support: state.policies.support ?? VANITY_DEFAULT_CSS_SUPPORT,
  })
  return {
    values: state.values,
    policies,
  }
}

function getTokenPolicyOfState(state: OpenState) {
  const policies = resolvePolicies(state.policies, {
    support: state.policies.support ?? VANITY_DEFAULT_CSS_SUPPORT,
  })
  return Object.freeze({
    reference: policies.tokens.reference,
    emit: policies.tokens.emit,
  })
}

function getTokenRequirementOfState(
  state: OpenState,
  context: VanityValueOperationContext,
) {
  const prior = getTokenModuleRequirement(state.tokens)
  return getSystemTokenModuleRequirement(
    state.values,
    context,
    state.axes,
    prior?.compatibleCapabilitySignatures,
  )
}

function previewTokenModule(state: OpenState, module: object): object {
  const context = getValueContext(state)
  return resolveTokenModule(module, {
    prefix: 'vanity-open',
    root: ':root',
    serializeValue: value => serializeValueWithContext(context, value),
    support: context.policies.support,
    policies: context.policies,
    axes: state.axes,
    dtcgCodecIds: new Set(state.codecs.map(codec => codec.extension)),
    emitCss: false,
  }) as object
}

function enforceConstructorPolicies(state: OpenState, tokens: object): void {
  const usages = getConstructorUsages(tokens)
  const errors: import('../diagnostics').VanityDiagnosticInput[] = []
  for (const [path, constructors] of Object.entries(usages)) {
    for (const name of constructors) {
      const policy = state.policies.constructors?.[name]
      const restriction = policy?.restrict
      if (!restriction)
        continue
      const policyRevision = state.revisions.restrictions[name] ?? 0
      const valueRevision = state.revisions.tokens[path] ?? 0
      const applies = restriction.enforce === 'retroactive' || valueRevision > policyRevision
      if (!applies)
        continue
      const use = restriction.use ? `; use '${restriction.use}'` : ''
      const reason = restriction.reason ? ` (${restriction.reason})` : ''
      const diagnostic: import('../diagnostics').VanityDiagnosticInput = {
        code: 'VANITY_POLICY_RESTRICTED_CONSTRUCTOR',
        severity: restriction.level === 'forbid' ? 'error' : 'warning',
        message: `${path} uses ${restriction.level === 'forbid' ? 'forbidden' : 'discouraged'} constructor '${name}'${reason}`,
        path,
        fix: restriction.use
          ? `replace '${name}' with '${restriction.use}'`
          : `remove the '${name}' constructor use or revise its restriction policy`,
      }
      if (restriction.level === 'forbid')
        errors.push(diagnostic)
      else
        console.warn(`[vanity] ${diagnostic.code}: ${diagnostic.message}${use}`)
    }
  }
  if (errors.length > 0)
    throw new VanityError(errors)
}

function describeSystemRules(
  rules: Readonly<Record<string, OpenSystemState['rules'][string]>>,
  file?: string,
): readonly {
  readonly name: string
  readonly description?: string
  readonly layer?: string
  readonly order?: number
  readonly selectors: readonly string[]
  readonly fingerprint: string
}[] {
  return Object.entries(rules).map(([name, rule]) => ({
    name,
    ...(rule.description === undefined ? {} : { description: rule.description }),
    ...(rule.layer === undefined ? {} : { layer: rule.layer }),
    ...(rule.order === undefined ? {} : { order: rule.order }),
    selectors: Object.keys(rule.css),
    fingerprint: getRuleFingerprint(rule.css, file),
  }))
}

function getRuleFingerprint(value: unknown, file?: string): string {
  const seen = new WeakSet<object>()
  const normalize = (input: unknown): unknown => {
    if (input === null || typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean')
      return input
    if (typeof input === 'function') {
      if ('$path' in input)
        return { token: String((input as any).$path) }
      return { function: input.name || 'anonymous' }
    }
    if (typeof input !== 'object')
      return String(input)
    if (seen.has(input)) {
      throw new VanityError({
        code: 'VANITY_SYSTEM_INVALID_DEFINITION',
        message: 'a named system rule cannot contain cycles',
        path: 'rules',
        file,
        fix: 'remove the cyclic reference from the system rule',
      })
    }
    seen.add(input)
    if ('$path' in input)
      return { token: String((input as any).$path) }
    if ('css' in input && typeof (input as any).css === 'string')
      return { value: (input as any).css }
    const normalized = Array.isArray(input)
      ? input.map(normalize)
      : Object.fromEntries(Object.keys(input).sort().map(key => [key, normalize((input as any)[key])]))
    seen.delete(input)
    return normalized
  }
  let hash = 0x811C9DC5
  for (const char of JSON.stringify(normalize(value))) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return `rule-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function getFlattenedPaths(value: object, parent: string[] = []): string[] {
  const paths: string[] = []
  for (const [name, child] of Object.entries(value)) {
    const next = [...parent, name]
    if (child && typeof child === 'object' && !Array.isArray(child))
      paths.push(...getFlattenedPaths(child, next))
    else
      paths.push(next.join('.'))
  }
  return paths
}

function assertPlainSystemModule(): void {
  if (!hasStyleModuleFile())
    return
  const file = getDiagnosticSource()?.file ?? getStyleModuleFile()!.filePath
  if (!/\.css\.[cm]?[jt]sx?$/.test(file))
    return
  throw new VanityError({
    code: 'VANITY_SYSTEM_IN_STYLE_MODULE',
    message: 'createSystem()/consolidate() cannot run inside a *.css.ts module',
    file,
    detail: ['A system is a pure compiler contract shared by styles, tools, browser runtime, and SSR.'],
    fix: 'move the open-system chain and consolidate() call to a plain system.ts, then import the locked system into this style module',
  })
}
