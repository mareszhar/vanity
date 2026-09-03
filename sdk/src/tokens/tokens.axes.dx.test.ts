import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('axis editor DX', () => {
  it('discovers axis names, modes, order, and canonical branch handles', () => {
    const result = project.query`
      import { colorSchemes, createSystem, data } from '@mszr/vanity'
      const open = createSystem().addAxis('scheme', colorSchemes()).addAxis('density', {
        modes: { cozy: '&', compact: data('density', 'compact') },
      })
      const token = open.tdef({ val: '1rem', axes: { scheme: { dark: '0.75rem' } } })
      const ds = open.addTokens({ space: { control: token } }).consolidate({ axisOrder: [${cursor('order')}] })
      open.tdef({ val: '1rem', axes: { ${cursor('axes')}: {} } })
      open.tdef({ val: '1rem', axes: { scheme: { ${cursor('modes')}: '0.75rem' } } })
      void ds.t.space.control.$axes.${cursor('handleAxes')}
    `

    expect(result.at('order').completions).toContainCompletions(['scheme', 'density'])
    expect(result.at('axes').completions).toContainCompletions(['scheme', 'density'])
    expect(result.at('modes').completions).toContainCompletions(['light', 'dark'])
    expect(result.at('handleAxes').completions).toContainCompletions(['scheme'])
  })

  it('keeps invalid axes, modes, and incomplete order diagnostics local', () => {
    const { errors } = project.check`
      import { colorSchemes, createSystem, data } from '@mszr/vanity'
      const open = createSystem().addAxis('scheme', colorSchemes()).addAxis('density', {
        modes: { compact: data('density', 'compact') },
      })
      open.consolidate({ axisOrder: ['scheme'] })
      open.tdef({ val: 'red', axes: { scheme: { midnight: 'black' } } })
      open.tdef({ val: 'red', axes: { contrast: { high: 'black' } } })
    `

    expect(errors).toHaveErrorCount(3)
    expect(errors).toHaveError(/axisOrder|never|density/)
    expect(errors).toHaveError(/midnight|never/)
    expect(errors).toHaveError(/contrast|never/)
  })
})
