/**
 * The type plane for introspection: the audit config is typed at the key
 * ([patterns.md §2]) and the manifest format is a public type external
 * tools can build on.
 */

import type { VanityManifest, VanityManifestToken } from '@mszr/vanity/vite'
import type {
  VanityAuditConfig,
  VanityAuditKind,
  VanityAuditLevel,
  VanityDtcgDocument,
  VanityRuntimeInspection,
  VanityTokenExplanation,
} from '../test-support/characterization'
import { describe, expectTypeOf, it } from 'vitest'
import { createEngine, createSystem, exportDesignTokens, importDesignTokens } from '../test-support/characterization'

describe('the audit config', () => {
  it('accepts the declared lanes at the declared levels', () => {
    const config: VanityAuditConfig = { unusedTokens: 'error', escapes: 'off', scaleStrays: 'warn' }

    void createSystem({ tokens: {}, audit: config })
    void createSystem({ tokens: {}, audit: { nearDuplicates: 'error', contrast: 'warn' } })
  })

  it('rejects an unknown lane and a wrong level, each at the offending key', () => {
    void createSystem({
      tokens: {},
      // @ts-expect-error — 'unusedToken' names no audit lane
      audit: { unusedToken: 'error' },
    })

    void createSystem({
      tokens: {},
      // @ts-expect-error — 'loud' is not an audit level
      audit: { escapes: 'loud' },
    })
  })

  it('kinds and levels are closed unions', () => {
    expectTypeOf<VanityAuditKind>().toEqualTypeOf<
      | 'unusedTokens'
      | 'nearDuplicates'
      | 'contrast'
      | 'escapes'
      | 'scaleStrays'
      | 'focusVisibility'
      | 'specificityContexts'
      | 'rawAssertions'
      | 'nonportableValues'
      | 'ambiguousAxes'
      | 'mutableRootHazards'
      | 'aliasEscapes'
      | 'overwriteInventory'
      | 'eagerStyleBarrels'
      | 'cssParityGaps'
      | 'staleArtifacts'
      | 'rootModeDisagreements'
    >()
    expectTypeOf<VanityAuditLevel>().toEqualTypeOf<'off' | 'warn' | 'error'>()
  })
})

describe('the manifest format', () => {
  it('is versioned and shaped as documented', () => {
    expectTypeOf<VanityManifest['version']>().toEqualTypeOf<3>()
    expectTypeOf<VanityManifest['system']['tokens'][string]>().toEqualTypeOf<VanityManifestToken>()
    expectTypeOf<VanityManifestToken['declarations']>().toEqualTypeOf<VanityManifestToken['declarations']>()
    expectTypeOf<VanityManifestToken['mutable']>().toEqualTypeOf<boolean>()
  })

  it('types explanations, runtime inspection, and DTCG interchange', () => {
    const de = createEngine()
    const ds = de.createSystem({ tokens: de.defineTokens({ space: { sm: de.token({ val: de.length.rem(1) }) } }) })
    expectTypeOf(ds.explain(ds.t.space.sm)).toEqualTypeOf<VanityTokenExplanation>()
    expectTypeOf(ds.runtime().inspect()).toEqualTypeOf<VanityRuntimeInspection>()
    expectTypeOf(exportDesignTokens(ds)).toEqualTypeOf<VanityDtcgDocument>()
    expectTypeOf(importDesignTokens({ space: { sm: { $type: 'dimension', $value: { value: 1, unit: 'rem' } } } }, { system: de }))
      .toMatchTypeOf<object>()

    // @ts-expect-error — export mode is a closed semantic choice
    void exportDesignTokens(ds, { mode: 'flattened' })
  })
})
