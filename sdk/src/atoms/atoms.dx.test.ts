/**
 * The editor-DX plane for atoms: property, shorthand, and toggle keys
 * autocomplete together; token keys autocomplete as values; a wrong value is
 * one diagnostic at the offending key ([patterns.md §10]).
 */

import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

const defineFixture = `
import { createEngine } from '@test/legacy'

const de = createEngine()
const { defineAtoms, t } = de.createSystem({
  tokens: { space: { sm: '8px', md: '16px' }, color: { brand: '#635bff' } },
  conditions: { md: '@media (min-width: 768px)' },
})

const atoms = defineAtoms({
  properties: { display: ['none', 'flex'], gap: t.space, padding: t.space },
  shorthands: { p: 'padding' },
  toggles: { stack: { display: 'flex', flexDirection: 'column' } },
  conditions: ['md'],
})

void atoms
`

describe('atoms, at the cursor', () => {
  it('the spec-shaped call raises no diagnostics', () => {
    const { errors } = project.check`${defineFixture}
      void atoms({ stack: true, gap: 'sm', p: { base: 'md', md: 'sm' } })
    `
    expect(errors).toBeClean()
  })

  it('properties, shorthands, and toggles autocomplete together', () => {
    const result = project.query`${defineFixture}
      void atoms({ ${cursor} })
    `
    expect(result.completions).toContainCompletions(['display', 'gap', 'padding', 'p', 'stack'])
  })

  it('token keys autocomplete as values', () => {
    const result = project.query`${defineFixture}
      void atoms({ gap: '${cursor}' })
    `
    expect(result.completions).toContainCompletions(['sm', 'md'])
  })

  it('a value outside the map is one diagnostic at the key', () => {
    const { errors } = project.check`${defineFixture}
      void atoms({ gap: 'lg' })
    `
    expect(errors).toHaveError(/lg|sm|md/)
    expect(errors).toHaveErrorCount(1)
  })
})
