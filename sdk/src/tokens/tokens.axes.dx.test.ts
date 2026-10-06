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
      void ds.t.space.${cursor('handle')}control
    `

    expect(result.at('order')).toSuggest(['scheme', 'density'])
    expect(result.at('axes')).toSuggest(['scheme', 'density'])
    expect(result.at('modes')).toSuggest(['light', 'dark'])
    expect(result.at('handleAxes')).toSuggest(['scheme'])
    const hover = result.at('handle').hover?.displayText ?? ''
    expect(hover).toContain('space.control')
    expect(hover).toContain('VanityTokenHandle')
    expect(hover).not.toMatch(/TdefResult|VanityAxisDefinition|Omit</)
    expect(hover.length).toBeLessThan(600)
  })

  it('explains the selected case value and runtime action at the cursor', () => {
    const result = project.query`
      import { createSystem, thisMode } from '@mszr/vanity'
      const open = createSystem().addAxis('scheme', { modes: { light: '&', dark: thisMode } })
      const ds = open.addTokens({ gap: open.tdef.length({ val: '1rem', mutable: true, cases: [
        { when: { scheme: 'light' }, val: '0.5rem' },
        { when: { scheme: 'dark' }, val: null },
      ] }) }).consolidate()
      const rt = ds.runtime()
      void ds.t.gap.${cursor('buildSelector')}$case
      void rt.t.gap.${cursor('runtimeSelector')}$case
      void ds.t.gap.$case({ scheme: 'light' }).${cursor('light')}$val
      void rt.t.gap.$case({ scheme: 'dark' }).${cursor('dark')}$val
      void rt.t.gap.$case({ scheme: 'light' }).${cursor('actions')}$val
      void ds.t.gap.$case({ ${cursor('address')}scheme: 'light' })
    `
    expect(result.at('light').hover?.displayText).toContain('"0.5rem"')
    expect(result.at('dark').hover?.displayText).toMatch(/\$val: undefined/)
    expect(result.at('dark').hover?.documentation).toContain('no-default reservation')
    expect(result.at('actions')).toSuggest(['$set', '$unset', '$val'], { requireDocumentation: true })
    expect(result.at('address')).toSuggest('scheme')
    for (const [location, type, purpose] of [
      ['buildSelector', 'VanityTokenCaseSelector', 'Resolve the branch selected'],
      ['runtimeSelector', 'VanityRuntimeCaseSelector', 'Select an authored intersection branch'],
    ] as const) {
      const hover = result.at(location).hover
      expect(hover?.displayText).toContain(type)
      expect(hover?.documentation).toContain(purpose)
      expect(hover?.displayText.length).toBeLessThan(600)
    }
    expect(result.errors).toBeClean()
    const discovery = project.query`${result.files['__selenita__.ts']}
      void ds.t.gap.$case({ scheme: ${cursor('buildModes')} })
      void rt.t.gap.$case({ scheme: ${cursor('runtimeModes')} })
    `
    for (const location of ['buildModes', 'runtimeModes'] as const) {
      expect(discovery.at(location)).toSuggest(['light', 'dark'])
      expect(discovery.at(location).signatureHelp?.activeParameter?.documentation).toContain('Exact axis-mode address')
    }
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
