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
})
