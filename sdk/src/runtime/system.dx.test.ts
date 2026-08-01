import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('runtime editor DX', () => {
  it('discovers the system runtime surface and mutable handle actions', () => {
    const result = project.query`
      import { createEngine } from '@test/legacy'
      const de = createEngine().axes(({ axis, data, defaultMode, scheme }) => ({
        scheme: scheme({ locality: 'root' }),
        density: axis({ modes: { cozy: defaultMode(), compact: data('density', 'compact') } }),
      }))
      const ds = de.createSystem({ tokens: {
        color: {
          brand: de.token.color({ mutable: true, axes: { scheme: { dark: null } } }),
          fixed: de.oklch(0.5, 0.1, 200),
        },
      } })
      void ds.${cursor('system')}
      const runtime = ds.runtime()
      void runtime.t.color.brand.${cursor('mutable')}
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
    expect(result.at('fixed').completions).not.toContainCompletion('$set')
    expect(result.at('axis').completions).toContainCompletions(['$switchTo', '$cycle', '$current', 'light', 'dark'])
    expect(result.at('mode').completions).toContainCompletion('$activate')
  })

  it('keeps wrong modes and no-target setters local', () => {
    const { errors } = project.check`
      import { createEngine } from '@test/legacy'
      const de = createEngine().axes(({ axis, data }) => ({
        density: axis({ modes: { compact: data('density', 'compact') } }),
      }))
      const ds = de.createSystem({ tokens: { space: de.token.length({ mutable: true }) } })
      ds.t.space.$set('1rem')
      const runtime = ds.runtime()
      runtime.axes.density.$switchTo('dense')
      runtime.t.space.$set(de.oklch(0.5, 0.1, 200))
    `

    expect(errors).toHaveErrorCount(3)
    expect(errors).toHaveError(/\$set.*does not exist|Property '\$set'/)
    expect(errors).toHaveError(/dense.*compact|not assignable/)
    expect(errors).toHaveError(/color.*length|not assignable/)
  })
})
