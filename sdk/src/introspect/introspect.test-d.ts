/**
 * The type evidence dimension for introspection: the audit config is typed at the key
 * ([patterns.md §2]) and the manifest format is a public type external
 * tools can build on.
 */

import type { VanityManifest, VanityManifestToken } from '@mszr/vanity/vite'
import type {
  VanityAuditConfig,
  VanityAuditKind,
  VanityAuditLevel,
  VanityDtcgDocument,
  VanityIntrospectedToken,
  VanityRuntimeInspection,
} from '../index'
import { describe, expectTypeOf, it } from 'vitest'
import { createSystem, exportDesignTokens, importDesignTokens } from '../index'

describe('the audit config', () => {
  it('accepts the declared audit categories at the declared levels', () => {
    const config: VanityAuditConfig = { unusedTokens: 'error', escapes: 'off', scaleStrays: 'warn' }

    void createSystem().consolidate({ audit: config })
    void createSystem().consolidate({ audit: { nearDuplicates: 'error', contrast: 'warn' } })
  })

  it('rejects an unknown audit category and a wrong level, each at the offending key', () => {
    createSystem().consolidate({
      // @ts-expect-error — 'unusedToken' names no audit category
      audit: { unusedToken: 'error' },
    })

    createSystem().consolidate({
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
    expectTypeOf<VanityManifest['version']>().toEqualTypeOf<4>()
    expectTypeOf<VanityManifest['system']['tokens'][string]>().toEqualTypeOf<VanityManifestToken>()
    expectTypeOf<VanityManifestToken['declarations']>().toEqualTypeOf<VanityManifestToken['declarations']>()
    expectTypeOf<VanityManifestToken['mutable']>().toEqualTypeOf<boolean>()
  })

  it('types explanations, runtime inspection, and DTCG interchange', () => {
    const open = createSystem()
    const ds = open.addTokens({ space: { sm: open.tdef({ val: open.length.rem(1) }) } }).consolidate()
    expectTypeOf(ds.explain(ds.t.space.sm)).toEqualTypeOf<VanityIntrospectedToken>()
    expectTypeOf(ds.runtime().inspect()).toEqualTypeOf<VanityRuntimeInspection>()
    expectTypeOf(exportDesignTokens(ds)).toEqualTypeOf<VanityDtcgDocument>()
    expectTypeOf(importDesignTokens({ space: { sm: { $type: 'dimension', $value: { value: 1, unit: 'rem' } } } }, { system: open }))
      .toMatchTypeOf<object>()

    // @ts-expect-error — export mode is a closed semantic choice
    void exportDesignTokens(ds, { mode: 'flattened' })
  })
})
