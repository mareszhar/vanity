/**
 * The type plane for atoms: token keys autocomplete and values outside the map
 * are rejected at the key — unless labeled through `unsafe.value`. Conditions
 * are typed to the subset the atoms declare.
 */

import { describe, it } from 'vitest'
import { createSystem, unsafe } from '../test-support/characterization'

// The type plane never executes — these calls are shapes, not effects.
const { defineAtoms, t } = createSystem({
  tokens: { space: { sm: '8px', md: '16px' }, color: { brand: '#635bff' } },
  conditions: { md: '@media (min-width: 768px)', lg: '@media (min-width: 1024px)' },
})

const atoms = defineAtoms({
  properties: {
    display: ['none', 'flex'],
    gap: t.space,
    padding: t.space,
  },
  shorthands: { p: 'padding' },
  toggles: { stack: { display: 'flex', flexDirection: 'column' } },
  conditions: ['md'],
})

describe('the call site', () => {
  it('declared keys and values pass; everything else dies at the key', () => {
    void atoms({ display: 'flex', gap: 'sm', p: 'md', stack: true })
    // @ts-expect-error — not a declared display value
    void atoms({ display: 'grid' })
    // @ts-expect-error — not a declared gap key
    void atoms({ gap: 'xl' })
    // @ts-expect-error — not a declared property, shorthand, or toggle
    void atoms({ paddingInline: 'sm' })
    // @ts-expect-error — a toggle is boolean
    void atoms({ stack: 'yes' })
  })

  it('shorthands carry their property\'s value set', () => {
    void atoms({ p: 'sm' })
    // @ts-expect-error — not a declared padding key
    void atoms({ p: 'huge' })
  })

  it('condition maps are typed to the declared subset', () => {
    void atoms({ p: { base: 'sm', md: 'md' } })
    // @ts-expect-error — lg exists on the system but is not declared on these atoms
    void atoms({ p: { lg: 'sm' } })
  })

  it('the labeled escape is legal anywhere a value is', () => {
    void atoms({ padding: unsafe.value('37ch', 'editorial measure') })
    void atoms({ p: { base: unsafe.value('37ch', 'editorial measure'), md: 'sm' } })
    // @ts-expect-error — an unlabeled arbitrary value is rejected at the key
    void atoms({ padding: '37ch' })
  })
})

describe('the definition site', () => {
  it('a non-CSS property dies at its key', () => {
    void defineAtoms({
      // @ts-expect-error — `paddin` is not a CSS property
      properties: { paddin: t.space },
    })
  })

  it('a shorthand must target a declared property', () => {
    void defineAtoms({
      properties: { padding: t.space },
      // @ts-expect-error — margin is not declared in this map
      shorthands: { m: 'margin' },
    })
  })

  it('conditions must exist on the system', () => {
    void defineAtoms({
      properties: { padding: t.space },
      // @ts-expect-error — not a condition of this system
      conditions: ['xxl'],
    })
  })
})
