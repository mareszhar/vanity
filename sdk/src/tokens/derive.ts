/** Pure authored token-module composition, derivation, and patch operations. */

import type { TokenContribution, TokenDerivation, TokenModule } from './module'
import type {
  VanityGraphInput,
  VanityTokenDefinition,
  VanityTokenModule,
  VanityTokenModuleOptions,
} from './types'
import {
  createTokenModule,
  freezeTokenGroup,
  isTokenModule,
} from './module'
import { assertTokenModulesCompatible } from './requirements'

function requireTokenModule(value: unknown, operation: string): TokenModule {
  if (!isTokenModule(value))
    throw new TypeError(`[vanity] ${operation} needs an unfinished token module`)
  return value as TokenModule
}

function appendTokenContribution(
  module: TokenModule,
  contribution: TokenContribution,
): TokenModule {
  return createTokenModule(
    [...module.contributions, Object.freeze(contribution)],
    module.requirement,
    module.tokenPolicy,
    module.derivationEmission,
  )
}

/** Append one pure graph operation to an unfinished module. */
export function addTokenContribution(
  module: unknown,
  contribution: TokenContribution,
): TokenModule {
  return appendTokenContribution(requireTokenModule(module, 'addTokenContribution'), contribution)
}

/** Compose two inert modules without materializing either module. */
export function composeTokenModules(target: unknown, module: unknown): TokenModule {
  const targetModule = requireTokenModule(target, 'composeTokenModules')
  const sourceModule = requireTokenModule(module, 'composeTokenModules')
  assertTokenModulesCompatible(targetModule.requirement, sourceModule.requirement)
  return createTokenModule(
    [...targetModule.contributions, ...sourceModule.contributions],
    targetModule.requirement ?? sourceModule.requirement,
    targetModule.tokenPolicy ?? sourceModule.tokenPolicy,
    targetModule.derivationEmission,
  )
}

/** Add a lazy derivation stage; the stage runs only at system finalization. */
export function deriveTokenModule(
  module: unknown,
  stage: TokenDerivation,
): TokenModule {
  const target = requireTokenModule(module, 'deriveTokenModule')
  return appendTokenContribution(target, {
    kind: 'derive',
    stage,
    emission: target.derivationEmission,
  })
}

function applyTokenModulePatch(
  module: unknown,
  mode: 'augment' | 'overwrite',
  input: VanityGraphInput | VanityTokenDefinition<any, any> | unknown,
): TokenModule {
  const target = requireTokenModule(module, `${mode}TokenDefinition`)
  const additions: readonly TokenContribution[] = isTokenModule(input)
    ? (input as TokenModule).contributions.map((contribution): TokenContribution => {
        if (contribution.kind === 'seed')
          return Object.freeze({ kind: 'patch' as const, mode, graph: contribution.graph })
        if (contribution.kind === 'derive')
          return Object.freeze({ kind: 'patch-stage' as const, mode, stage: contribution.stage })
        if (contribution.kind === 'patch-stage')
          return Object.freeze({ ...contribution, mode })
        return Object.freeze({ ...contribution, mode })
      })
    : [Object.freeze({
        kind: 'patch' as const,
        mode,
        graph: freezeTokenGroup(input as VanityGraphInput) as VanityGraphInput,
      })]
  return createTokenModule(
    [...target.contributions, ...additions],
    target.requirement,
    target.tokenPolicy,
    target.derivationEmission,
  )
}

/** Add definitions to existing token slots without replacing occupied slots. */
export function augmentTokenDefinition(
  module: unknown,
  input: VanityGraphInput | VanityTokenModule<any, any> | unknown,
): TokenModule {
  return applyTokenModulePatch(module, 'augment', input)
}

/** Replace existing token slots deliberately. */
export function overwriteTokenDefinition(
  module: unknown,
  input: VanityGraphInput | VanityTokenModule<any, any> | unknown,
): TokenModule {
  return applyTokenModulePatch(module, 'overwrite', input)
}

/** Tag authored contributions with the identity used by lazy module handles. */
export function markTokenModule(module: unknown, id: symbol): TokenModule {
  const target = requireTokenModule(module, 'markTokenModule')
  const contributions = target.contributions.map((contribution): TokenContribution =>
    contribution.kind === 'patch' || contribution.kind === 'patch-stage' || contribution.moduleId !== undefined
      ? contribution
      : Object.freeze({
          ...contribution,
          moduleId: id,
          modulePath: Object.freeze([...(contribution.modulePath ?? [])]),
        }))
  return createTokenModule(
    contributions,
    target.requirement,
    target.tokenPolicy,
    target.derivationEmission,
  )
}

/** Mount an unfinished module beneath a path while keeping references lazy. */
export function prefixTokenModule(module: unknown, path: readonly string[]): TokenModule {
  const target = requireTokenModule(module, 'prefixTokenModule')
  if (path.length === 0)
    return target
  const contributions = target.contributions.map((contribution): TokenContribution => {
    if (contribution.kind === 'seed') {
      return Object.freeze({
        ...contribution,
        graph: wrapTokenGraph(path, contribution.graph),
        modulePath: Object.freeze([...path, ...(contribution.modulePath ?? [])]),
      })
    }
    if (contribution.kind === 'patch') {
      return Object.freeze({
        ...contribution,
        graph: wrapTokenGraph(path, contribution.graph),
      })
    }
    if (contribution.kind === 'patch-stage') {
      return Object.freeze({
        ...contribution,
        stage: (tree: Record<string, unknown>) =>
          wrapTokenGraph(path, contribution.stage(readGraphPath(tree, path))),
      })
    }
    return Object.freeze({
      ...contribution,
      modulePath: Object.freeze([...path, ...(contribution.modulePath ?? [])]),
      stage: (tree: Record<string, unknown>) =>
        wrapTokenGraph(path, contribution.stage(readGraphPath(tree, path))),
    })
  })
  return createTokenModule(
    contributions,
    target.requirement,
    target.tokenPolicy,
    target.derivationEmission,
  )
}

/** Apply a module root immutably to every authored seed and derivation. */
export function applyTokenModuleRoot(
  module: unknown,
  root: string | {
    readonly root?: string
    readonly runtimeRoot?: string
    readonly scopes?: readonly string[]
    readonly systemRoot?: true
  },
): TokenModule {
  const target = requireTokenModule(module, 'applyTokenModuleRoot')
  const options: VanityTokenModuleOptions = typeof root === 'string' ? { root } : root
  if (options.root !== undefined && options.root.trim().length === 0)
    throw new TypeError('[vanity] a token module root must be a non-empty selector')
  const emission = Object.freeze({ ...options })
  const contributions = target.contributions.map((contribution): TokenContribution =>
    contribution.kind === 'patch' || contribution.kind === 'patch-stage'
      ? contribution
      : contribution.emission.root !== undefined
        || contribution.emission.systemRoot === true
        || contribution.emission.runtimeRoot !== undefined
        || contribution.emission.scopes !== undefined
        ? contribution
        : Object.freeze({
            ...contribution,
            emission: Object.freeze({ ...contribution.emission, ...options }),
          }))
  return createTokenModule(
    contributions,
    target.requirement,
    target.tokenPolicy,
    emission,
  )
}

function wrapTokenGraph(path: readonly string[], graph: object): VanityGraphInput {
  let wrapped: object = graph
  for (const name of [...path].reverse())
    wrapped = { [name]: wrapped }
  return wrapped as VanityGraphInput
}

function readGraphPath(tree: Record<string, unknown>, path: readonly string[]): Record<string, unknown> {
  let current = tree
  for (const name of path) {
    const child = current[name]
    current = child && (typeof child === 'object' || typeof child === 'function')
      ? child as Record<string, unknown>
      : {}
  }
  return current
}
