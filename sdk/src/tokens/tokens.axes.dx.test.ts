import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('axis editor DX', () => {
  it('discovers axis helpers, axis names, modes, and ordered handles', () => {
    const result = project.query`
      import { createEngine } from '@test/legacy'
      const de = createEngine().axes(({ axis, data, defaultMode, scheme }) => ({
        scheme: scheme(),
        density: axis({ modes: { cozy: defaultMode(), compact: data('density', 'compact') } }),
      }))
      const ordered = de.axisOrder(${cursor('order')})
      ordered.token({ val: '1rem', axes: { ${cursor('axes')}: {} } })
      const token = ordered.token({ val: '1rem', axes: { scheme: { ${cursor('modes')}: '0.75rem' } } })
      const ds = ordered.createSystem({ tokens: { space: { control: token } } })
      void ds.t.space.control.$axes.${cursor('handleAxes')}
    `

    expect(result.at('order').completions).toContainCompletions(['scheme', 'density'])
    expect(result.at('axes').completions).toContainCompletions(['scheme', 'density'])
    expect(result.at('modes').completions).toContainCompletions(['light', 'dark'])
    expect(result.at('handleAxes').completions).toContainCompletions(['scheme'])
  })

  it('keeps invalid axes, modes, and incomplete order diagnostics local', () => {
    const { errors } = project.check`
      import { createEngine } from '@test/legacy'
      const de = createEngine().axes(({ axis, data, scheme }) => ({
        scheme: scheme(),
        density: axis({ modes: { compact: data('density', 'compact') } }),
      }))
      de.axisOrder('scheme')
      de.token({ val: 'red', axes: { scheme: { midnight: 'black' } } })
      de.token({ val: 'red', axes: { contrast: { high: 'black' } } })
    `

    expect(errors).toHaveErrorCount(3)
    expect(errors).toHaveError(/axisOrder|never|scheme/)
    expect(errors).toHaveError(/midnight|never/)
    expect(errors).toHaveError(/contrast|never/)
  })
})
