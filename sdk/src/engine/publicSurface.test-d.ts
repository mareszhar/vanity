/** The removed engine dialect is not part of the package surface. */

import type { VanityAutoImportRouting } from '@mszr/vanity/config'
import type { HailSystemRules } from '@mszr/vanity/presets'
import * as vanity from '@mszr/vanity'
import * as runtime from '@mszr/vanity/runtime'
import { describe, it } from 'vitest'

// @ts-expect-error — removed engine types are not compatibility-exported
type RemovedEngine = import('@mszr/vanity').VanityEngine
// @ts-expect-error — removed engine option types are not compatibility-exported
type RemovedEngineOptions = import('@mszr/vanity').VanityEngineOptions
// @ts-expect-error — the legacy compatibility carrier is internal
type RemovedEngineRequirement = import('@mszr/vanity').VanityEngineRequirement
// @ts-expect-error — the public input follows the named-system-rule vocabulary
type RemovedRuleGroup = import('@mszr/vanity').VanityRuleGroup
// @ts-expect-error — runtime objects are controllers, not bound-runtime facades
type RemovedBoundRuntime = import('@mszr/vanity').VanityBoundRuntime

void (undefined as unknown as RemovedEngine)
void (undefined as unknown as RemovedEngineOptions)
void (undefined as unknown as RemovedEngineRequirement)
void (undefined as unknown as RemovedRuleGroup)
void (undefined as unknown as RemovedBoundRuntime)

describe('canonical package surface', () => {
  it('authors through one open and then locked system', () => {
    void vanity.createSystem
    void vanity.definePlugin
    void vanity.defineTokens
    void (undefined as unknown as vanity.VanitySystemRule)
    void (undefined as unknown as HailSystemRules<Record<never, never>>)
    void (undefined as unknown as VanityAutoImportRouting)

    // @ts-expect-error — the pre-release engine object was removed without an alias
    void vanity.createEngine
    // Built-ins are dual: portable imports and policy-bound system members.
    void vanity.oklch
    // @ts-expect-error — grouped changes use ds.tokenOverride
    void vanity.theme
    // @ts-expect-error — interchange receives the open system vocabulary
    void vanity.importDesignTokens({}, { engine: vanity.createSystem() })
  })

  it('uses runtime controllers and explicit custom-property operations', () => {
    void runtime.setCustomProperty
    void (undefined as unknown as runtime.VanityRuntimeController<unknown>)

    // @ts-expect-error — runtime token writes live on the declared-root runtime controller
    void runtime.applyTheme
    // @ts-expect-error — axes are selected by a bound runtime
    void runtime.setScheme
  })
})
