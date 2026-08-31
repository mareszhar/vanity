/**
 * The runtime evidence dimension for atoms ([spec-integrations.md §5]): token keys resolve to
 * precompiled classes, shorthands alias, toggles switch, condition maps pick
 * the pre-generated arms, and the labeled escape emits at build time while
 * runtime calls are redirected to the open-value port boundary.
 */

import { restoreAtoms } from '@mszr/vanity/runtime'
import { emit } from '@test'
import { describe, expect, it, vi } from 'vitest'
import { createSystem, unsafe, VanityError } from '../test-support/characterization'

function miniAtoms() {
  return emit(() => {
    const { defineAtoms, t } = createSystem({
      tokens: { space: { sm: '8px', md: '16px' }, color: { brand: '#635bff' } },
      conditions: { md: '@media (min-width: 768px)' },
    })

    return defineAtoms({
      properties: {
        display: ['none', 'flex'],
        gap: t.space,
        padding: t.space,
        color: t.color,
      },
      shorthands: { p: 'padding' },
      toggles: { stack: { display: 'flex', flexDirection: 'column' } },
      conditions: ['md'],
    }, 'atoms')
  })
}

describe('atoms resolution', () => {
  it('token keys resolve to precompiled classes', () => {
    const { returned: atoms } = miniAtoms()

    expect(atoms({ gap: 'sm' })).toMatch(/^prism_atoms_gap_sm__[\w-]+$/)
    expect(atoms({ gap: 'sm', display: 'flex' }).split(' ')).toHaveLength(2)
  })

  it('a shorthand resolves to its property\'s classes', () => {
    const { returned: atoms } = miniAtoms()

    expect(atoms({ p: 'md' })).toBe(atoms({ padding: 'md' }))
  })

  it('toggles switch one class', () => {
    const { returned: atoms } = miniAtoms()

    expect(atoms({ stack: true })).toMatch(/^prism_atoms_stack__[\w-]+$/)
    expect(atoms({ stack: false })).toBe('')
  })

  it('condition maps pick the pre-generated arms', () => {
    const { returned: atoms } = miniAtoms()
    const classes = atoms({ p: { base: 'sm', md: 'md' } }).split(' ')

    expect(classes[0]).toMatch(/^prism_atoms_padding_sm__[\w-]+$/)
    expect(classes[1]).toMatch(/^prism_atoms_padding_md_md__[\w-]+$/)
  })

  it('an unknown value warns once and never half-styles', () => {
    const { returned: atoms } = miniAtoms()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(atoms({ gap: 'lg' as never })).toBe('')
    expect(atoms({ gap: 'lg' as never })).toBe('')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('not a declared gap value')

    warn.mockRestore()
  })

  it('an undeclared condition at the call site warns with the reason', () => {
    const { returned: atoms } = miniAtoms()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    atoms({ gap: { hover: 'sm' } as never })
    expect(warn.mock.calls[0][0]).toContain('not declared on these atoms')

    warn.mockRestore()
  })
})

describe('the labeled escape', () => {
  it('emits at build time, memoized, with the label in the class', () => {
    const { returned, css } = emit(() => {
      const { defineAtoms, t } = createSystem({
        tokens: { space: { sm: '8px' } },
      })
      const atoms = defineAtoms({ properties: { inlineSize: t.space } }, 'atoms')

      const first = atoms({ inlineSize: unsafe.value('37ch', 'editorial measure') })
      const second = atoms({ inlineSize: unsafe.value('37ch', 'editorial measure') })

      return { first, second }
    })

    expect(returned.first).toMatch(/^prism_atoms_unsafe_inlineSize__[\w-]+$/)
    expect(returned.second).toBe(returned.first)
    expect(css).toContain('inline-size: 37ch')
  })

  it('redirects open runtime values to ports', () => {
    const { returned: atoms } = miniAtoms()
    const runtime = restoreAtoms(JSON.parse(JSON.stringify({
      name: 'atoms',
      classes: { gap: { sm: { base: atoms({ gap: 'sm' }) } } },
      shorthands: {},
      toggles: {},
    })))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(runtime({ gap: unsafe.value('3vw', 'why not') })).toBe('')
    expect(warn.mock.calls[0][0]).toContain('port')

    warn.mockRestore()
  })
})

describe('definition diagnostics', () => {
  it('an unknown condition dies at definition with the fix', () => {
    expect(() => emit(() => {
      const { defineAtoms, t } = createSystem({
        tokens: { space: { sm: '8px' } },
        conditions: { md: '@media (min-width: 768px)' },
      })

      return defineAtoms({ properties: { gap: t.space }, conditions: ['mdd' as never] })
    })).toThrowError(/VANITY_ATOMS_UNKNOWN_CONDITION[\s\S]*did you mean 'md'/)
  })

  it('a toggle colliding with a property dies at definition', () => {
    expect(() => emit(() => {
      const { defineAtoms, t } = createSystem({ tokens: { space: { sm: '8px' } } })

      return defineAtoms({
        properties: { padding: t.space },
        toggles: { padding: { display: 'flex' } } as never,
      })
    })).toThrowError(VanityError)
  })
})
