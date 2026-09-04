/**
 * The editor-DX evidence dimension for atoms: property, shorthand, and toggle keys
 * autocomplete together; token keys autocomplete as values; a wrong value is
 * one diagnostic at the offending key ([patterns.md §10]).
 */

import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

const defineFixture = `
import { createSystem } from '@mszr/vanity'

const open = createSystem()
  .addConditions({ md: '@media (min-width: 768px)' })
  .addTokens({ space: { sm: '8px', md: '16px' }, color: { brand: '#635bff' } })
const { atoms: makeAtoms, t } = open.consolidate()

const atoms = makeAtoms({
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

describe('atoms option documentation', () => {
  it('describes the finite property and condition inputs at their keys', () => {
    const result = project.query`${defineFixture}
      void makeAtoms({ properties${cursor('properties')}: { display: ['none', 'flex'] }, conditions${cursor('conditions')}: ['md'] })
    `
    expect(result.at('properties').hover).toContain('Property → its closed value set')
    expect(result.at('conditions').hover).toContain('conditions available at atoms call sites')
  })
})
