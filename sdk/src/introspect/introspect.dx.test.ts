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
import { createEngine } from '@test/legacy'
const de = createEngine()
`

describe('the audit config', () => {
  it('completes the audit categories', () => {
    const result = project.query`${preamble}
      void de.createSystem({ tokens: {}, audit: { ${cursor} } })
    `
    expect(result.completions).toContainCompletions([
      'unusedTokens',
      'nearDuplicates',
      'contrast',
      'escapes',
      'scaleStrays',
    ])
  })

  it('completes the levels on an audit category', () => {
    const result = project.query`${preamble}
      void de.createSystem({ tokens: {}, audit: { escapes: ${cursor} } })
    `
    expect(result.completions).toContainCompletions(['off', 'warn', 'error'])
  })

  it('a typo\'d audit category dies at the offending key', () => {
    const { errors } = project.check`${preamble}
      void de.createSystem({ tokens: {}, audit: { unusedToken: 'error' } })
    `
    expect(errors).toHaveError(/unusedToken/)
    expect(errors).toHaveErrorCount(1)
  })
})
