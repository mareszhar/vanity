/** The canonical package surface: author through one open and then locked system. */

import type { VanityAutoImportRouting } from '@mszr/vanity/config'
import type { HailSystemRules } from '@mszr/vanity/presets'
import * as vanity from '@mszr/vanity'
import * as runtime from '@mszr/vanity/runtime'
import { describe, it } from 'vitest'

describe('canonical package surface', () => {
  it('exposes system composition, rules, and auto-import routing', () => {
    void vanity.createSystem
    void vanity.definePlugin
    void vanity.defineTokens
    void vanity.defineAxes
    void vanity.defineConditions
    void vanity.defineConsts
    void vanity.defineUtils
    void vanity.defineConstructor
    void vanity.defineConstructors
    void vanity.defineRules
    void vanity.definePolicies
    void vanity.data
    void vanity.media
    void vanity.supports
    void vanity.container
    void vanity.selector
    void vanity.condition
    void vanity.scope
    void vanity.systemRoot
    void vanity.moduleRoot
    void vanity.thisMode
    void vanity.range
    void vanity.fromEntries
    void vanity.mapRecord
    void vanity.ports
    void (undefined as unknown as vanity.VanitySystemRule)
    void (undefined as unknown as HailSystemRules<Record<never, never>>)
    void (undefined as unknown as VanityAutoImportRouting)

    // Built-ins are dual: portable imports and policy-bound system members.
    void vanity.oklch
  })

  it('uses runtime controllers and explicit custom-property operations', () => {
    void runtime.setCustomProperty
    void (undefined as unknown as runtime.VanityRuntimeController<unknown>)
  })

  it('keeps the locked type surface aligned with the reserved runtime set', () => {
    type Reserved = vanity.VanitySystemMember
    type LockedMembers = Extract<keyof vanity.VanityLockedSystem<Record<never, never>, never, never>, string>

    const lockedSubset: [LockedMembers] extends [Reserved] ? true : false = true
    const reservedSubset: [Reserved] extends [LockedMembers] ? true : false = true
    void lockedSubset
    void reservedSubset

    const locked = vanity.createSystem().consolidate()
    void locked.t
    void locked.class
    void locked.rules
    void locked.raw
    void locked.fragment
    void locked.omit
    void locked.tdec
    void locked.keyframes
    void locked.fontFace
    void locked.recipe
    void locked.anatomy
    void locked.port
    void locked.atoms
    void locked.inLayer
    void locked.tokensOf
    void locked.namesOf
    void locked.varsOf
    void locked.runtime
    void locked.snapshotFrom
    void locked.runtimeStyle
    void locked.runtimeProps
    void locked.reconcileRuntimeSnapshot
    void locked.serialize
    void locked.explain
    void locked.audit
    void locked.conditions
    void locked.layers
    void locked.axes
    void locked.consts
    void locked.policies
    void locked.introspect
    // @ts-expect-error — manifest is not a locked-system member
    void locked.manifest
  })
})
