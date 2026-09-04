import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('runtime editor DX', () => {
  it('discovers the system runtime surface and mutable handle actions', () => {
    const result = project.query`
      import { colorSchemes, createSystem, data, oklch } from '@mszr/vanity'
      const open = createSystem()
        .addAxis('scheme', colorSchemes({ locality: 'root' }))
        .addAxis('density', { modes: { cozy: '&', compact: data('density', 'compact') } })
      const ds = open.addTokens({
        color: {
          brand: open.tdef.color({ mutable: true, axes: { scheme: { dark: null } } }),
          fixed: oklch(0.5, 0.1, 200),
        },
      }).consolidate()
      void ds.${cursor('system')}
      const runtime = ds.runtime()
      void runtime.t.color.brand.${cursor('mutable')}
      void runtime.t.color.brand.${cursor('set')}$set
      void runtime.t.color.fixed.${cursor('fixed')}
      void runtime.axes.scheme.${cursor('axis')}
      void runtime.axes.scheme.dark.${cursor('mode')}
    `

    expect(result.at('system').completions).toContainCompletions([
      'runtime',
      'runtimeStyle',
      'runtimeProps',
      'reconcileRuntimeSnapshot',
    ])
    expect(result.at('mutable').completions).toContainCompletions(['$set', '$unset', '$axes', '$case'])
    expect(result.at('set').hover).toContain('Set a mutable token')
    expect(result.at('fixed').completions).not.toContainCompletion('$set')
    expect(result.at('axis').completions).toContainCompletions(['$switchTo', '$cycle', '$current', 'light', 'dark'])
    expect(result.at('mode').completions).toContainCompletion('$activate')
  })

  it('keeps wrong modes and no-target setters local', () => {
    const { errors } = project.check`
      import { createSystem, data, oklch } from '@mszr/vanity'
      const open = createSystem().addAxis('density', {
        modes: { compact: data('density', 'compact') },
      })
      const ds = open.addTokens({ space: open.tdef.length({ mutable: true }) }).consolidate()
      ds.t.space.$set('1rem')
      const runtime = ds.runtime()
      runtime.axes.density.$switchTo('dense')
      runtime.t.space.$set(oklch(0.5, 0.1, 200))
    `

    expect(errors).toHaveErrorCount(3)
    expect(errors).toHaveError(/\$set.*does not exist|Property '\$set'/)
    expect(errors).toHaveError(/dense.*compact|not assignable/)
    expect(errors).toHaveError(/color.*length|not assignable/)
  })
})
