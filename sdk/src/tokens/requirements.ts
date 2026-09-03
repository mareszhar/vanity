/** Compatibility requirements for portable and system-bound token modules. */

import type { VanityTokenModuleRequirement } from './types'
import { VanityError } from '../diagnostics'

const TOKEN_MODULE = Symbol.for('vanity.tokenModule')

/** Read the compatibility record carried by an inert token module. */
export function getTokenModuleRequirement(value: unknown): VanityTokenModuleRequirement | undefined {
  if (!isTokenModuleValue(value))
    return undefined
  return (value as { readonly requirement?: VanityTokenModuleRequirement }).requirement
}

/** Reject composition when two authored modules have no compatible capability ancestry. */
export function assertTokenModulesCompatible(
  target: VanityTokenModuleRequirement | undefined,
  module: VanityTokenModuleRequirement | undefined,
): void {
  if (module === undefined)
    return

  if (target === undefined || !target.compatibleCapabilitySignatures.includes(module.capabilitySignature)) {
    throw new VanityError({
      code: 'VANITY_TOKEN_MODULE_INCOMPATIBLE',
      message: 'token modules were created with incompatible capability sets',
      detail: [
        `target capability signature: ${target?.capabilitySignature ?? 'unbound'}`,
        `module capability signature: ${module?.capabilitySignature ?? 'unbound'}`,
      ],
      fix: { message: 'define and compose the module with aligned constructors, extensions, support, and policy revisions' },
    })
  }
}

function isTokenModuleValue(value: unknown): boolean {
  return typeof value === 'object' && value !== null
    && (value as Record<symbol, unknown>)[TOKEN_MODULE] === true
}
