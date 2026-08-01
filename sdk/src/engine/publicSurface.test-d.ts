/** The removed engine dialect is not part of the Phase 4 package surface. */

import * as vanity from '@mszr/vanity'
import * as runtime from '@mszr/vanity/runtime'
import { describe, it } from 'vitest'

// @ts-expect-error — removed engine types are not compatibility-exported
type RemovedEngine = import('@mszr/vanity').VanityEngine
// @ts-expect-error — removed engine option types are not compatibility-exported
type RemovedEngineOptions = import('@mszr/vanity').VanityEngineOptions
// @ts-expect-error — the legacy compatibility carrier is internal
type RemovedEngineRequirement = import('@mszr/vanity').VanityEngineRequirement

void (undefined as unknown as RemovedEngine)
void (undefined as unknown as RemovedEngineOptions)
void (undefined as unknown as RemovedEngineRequirement)

describe('canonical package surface', () => {
  it('authors through one open and then locked system', () => {
    void vanity.createSystem
    void vanity.definePlugin
    void vanity.defineTokens

    // @ts-expect-error — the pre-release engine stage was removed without an alias
    void vanity.createEngine
    // Built-ins are dual: portable imports and policy-bound system members.
    void vanity.oklch
    // @ts-expect-error — grouped changes use ds.tokenOverride
    void vanity.theme
    // @ts-expect-error — interchange receives the open system vocabulary
    void vanity.importDesignTokens({}, { engine: vanity.createSystem() })
  })

  it('uses bound runtimes and explicit custom-property operations', () => {
    void runtime.setCustomProperty

    // @ts-expect-error — runtime token writes live on the declared-root ds.runtime() facade
    void runtime.applyTheme
    // @ts-expect-error — axes are selected by a bound runtime
    void runtime.setScheme
  })
})
