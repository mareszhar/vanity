import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('unified token and condition editor DX', () => {
  it('discovers tdef types, token-builder operations, axes, and condition algebra', () => {
    const result = project.query`
      import { createSystem, data, selector } from '@mszr/vanity'
      const open = createSystem().addAxis('density', {
        modes: { cozy: '&', compact: data('density', 'compact') },
        default: 'cozy',
      })
      const reservation = open.tdef.color({ mutable: true })
      const tokens = open.defineTokens({ optional: reservation })
      const state = selector('&:hover')
      void open.tdef.${cursor('tdef')}
      void tokens.${cursor('builder')}
      void reservation.${cursor('axis')}
      void state.${cursor('condition')}
    `

    expect(result.at('tdef').completions).toContainCompletions([
      'color',
      'length',
      'angle',
      'time',
      'number',
    ])
    expect(result.at('builder').completions).toContainCompletions(['add', 'refs', 'root'])
    expect(result.at('builder').completions).not.toContainCompletion('t')
    expect(result.at('axis').completions).toContainCompletion('density')
    expect(result.at('axis').completions).not.toContainCompletions(['config', 'type'])
    expect(result.at('condition').completions).toContainCompletions(['and', 'or', 'not', 'ast', 'arms'])
  })

  it('keeps duplicate names, axis modes, ranges, and order failures local', () => {
    const { errors } = project.check`
      import { createSystem, data, media } from '@mszr/vanity'
      const open = createSystem()
        .addAxis('density', {
          modes: { cozy: '&', compact: data('density', 'compact') },
          default: 'cozy',
        })
        .addAxis('motion', {
          modes: { full: '&', reduced: media('(prefers-reduced-motion: reduce)') },
          default: 'full',
        })
      const tokens = open.defineTokens({ value: 'red' })
      tokens.add('value', 'blue')
      open.tdef({ val: 'red' }).density({ tiny: 'blue' })
      open.consolidate({ axisOrder: ['density'] })
      media({ width: { '=': '60rem', '<': '80rem' } })
    `

    expect(errors).toHaveErrorCount(4)
    expect(errors).toHaveError(/value|never/)
    expect(errors).toHaveError(/tiny|density/)
    expect(errors).toHaveError(/axisOrder|never|motion/)
    expect(errors).toHaveError(/width|not assignable|operator/)
  })
})
