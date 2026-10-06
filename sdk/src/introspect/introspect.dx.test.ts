/**
 * The editor-DX evidence dimension for introspection: the audit config completes its categories
 * and rejects a typo at the offending key — the same feedback loop as every
 * other surface ([patterns.md §10]).
 */

import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

const preamble = `
import { createSystem } from '@mszr/vanity'
const open = createSystem()
`

describe('the audit config', () => {
  it('completes the audit categories', () => {
    const result = project.query`${preamble}
      void open.consolidate({ audit: { ${cursor} } })
    `
    expect(result).toSuggest([
      'unusedTokens',
      'nearDuplicates',
      'contrast',
      'escapes',
      'scaleStrays',
      'derivedCaseGrowth',
    ])
  })

  it('completes the levels on an audit category', () => {
    const result = project.query`${preamble}
      void open.consolidate({ audit: { escapes: ${cursor} } })
    `
    expect(result).toSuggest(['off', 'warn', 'error'])
  })

  it('a typo\'d audit category dies at the offending key', () => {
    const { errors } = project.check`${preamble}
      void open.consolidate({ audit: { unusedToken: 'error' } })
    `
    expect(errors).toHaveError(/unusedToken/, { on: 'unusedToken' })
    expect(errors).toHaveErrorCount(1)
  })

  it('documents the locked audit capability at its cursor', () => {
    const result = project.query`${preamble}
      import type { VanityManifest } from '@mszr/vanity/vite'
      import { buildAgentContext } from '@mszr/vanity/vite'
      import type { VanityTokenExplanation } from '@mszr/vanity'
      const ds = open.addTokens({ color: { brand: 'red' } }).consolidate()
      void ds.${cursor('audit')}audit()
      const report = ds.audit()
      void report.${cursor('report')}
      const token = ds.explain(ds.t.color.brand)
      void token.${cursor('token')}
      declare const explanation: VanityTokenExplanation
      void explanation.${cursor('explanation')}
      declare const manifest: VanityManifest
      const context = buildAgentContext(manifest)
      void context.${cursor('context')}
      void context.tokens[0]?.${cursor('contextToken')}
    `

    expect(result.at('audit').hover?.documentation).toContain('Run every audit this system can evaluate')
    expect(result.at('audit').hover?.displayText).toContain('VanityAuditReport')
    expect(result.at('report')).toSuggest(['findings', 'unevaluated'], { requireDocumentation: true })
    expect(result.at('token')).toSuggest(['dependencies', 'declarations', 'preview', 'portability'], { requireDocumentation: true })
    expect(result.at('explanation')).toSuggest([
      'path',
      'source',
      'name',
      'type',
      'expression',
      'dependencies',
      'reference',
      'emit',
      'mutable',
      'hasDefault',
      'inference',
      'fold',
      'preview',
      'support',
      'declarations',
      'branches',
      'registration',
      'runtime',
      'portability',
      'metadata',
      'description',
      'deprecated',
    ], { requireDocumentation: true })
    expect(result.at('context')).toSuggest(['manifestVersion', 'identities', 'system', 'environment', 'tokens', 'modules', 'policy'], { requireDocumentation: true })
    expect(result.at('contextToken')).toSuggest(['path', 'type', 'reference', 'mutable', 'dependencies', 'contexts', 'description'], { requireDocumentation: true })
    expect(result.at('contextToken').findCompletion('contexts')?.documentation).toContain('root, layer, at-rule and selector')
  })
})
