import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('token-graph editor DX', () => {
  it('discovers configuration, typed no-default constructors, handles, and projections', () => {
    const result = project.query`
      import { createEngine } from '@test/legacy'
      const de = createEngine().axes(({ axis, data }) => ({
        scheme: axis({ modes: { dark: data('scheme', 'dark') } }),
      }))
      const colors = de.defineTokens({
        color: {
          brand: de.token({ val: de.oklch(0.58, 0.2, 285), mutable: true, axes: { scheme: { dark: null } } }),
        },
      })
      const ds = de.createSystem({ tokens: colors })
      void de.token.${cursor('typed')}
      void ds.t.color.brand.${cursor('handle')}
      void ds.t.color.brand.$axes.scheme.${cursor('modes')}
      void ds.${cursor('system')}
    `

    expect(result.at('typed').completions).toContainCompletions(['color', 'length', 'angle', 'time', 'number'])
    expect(result.at('handle').completions).toContainCompletions([
      '$name',
      '$val',
      '$var',
      '$path',
      '$type',
      '$reference',
      '$emit',
      '$mutable',
      '$axes',
      '$case',
    ])
    expect(result.at('handle').completions).not.toContainCompletion('mode')
    expect(result.at('handle').completions).not.toContainCompletion('name')
    expect(result.at('modes').completions).toContainCompletion('dark')
    expect(result.at('modes').completions).not.toContainCompletion('light')
    expect(result.at('system').completions).toContainCompletions(['tokensOf', 'namesOf', 'varsOf'])
  })

  it('keeps trait conflicts local and branch mistakes exact', () => {
    const { errors } = project.check`
      import { createEngine } from '@test/legacy'
      const de = createEngine().axes(({ axis, data }) => ({
        scheme: axis({ modes: { dark: data('scheme', 'dark') } }),
      }))
      de.token({ val: 'red', mutable: true, reference: 'val' })
      const ds = de.createSystem({
        tokens: { color: { accent: de.token({ val: 'red', axes: { scheme: { dark: 'black' } } }) } },
      })
      void ds.t.color.accent.$axes.scheme.light
    `

    expect(errors).toHaveErrorCount(2)
    expect(errors).toHaveError(/reference|"val"|not assignable/)
    expect(errors).toHaveError(/light.*does not exist|Property 'light'/)
  })

  it('keeps token hovers compact and factual', () => {
    const result = project.query`
      import { createEngine } from '@test/legacy'
      const de = createEngine()
      const ds = de.createSystem({ tokens: { color: { brand: de.oklch(0.58, 0.2, 285) } }, prefix: 'app' })
      ds.t.color.${cursor('brand')}brand
    `

    const hover = result.at('brand').hover ?? ''
    expect(hover).toContain('VanityTokenHandleOf')
    expect(hover).toContain('app-color-brand')
    expect(hover).toContain('color.brand')
    expect(hover).toContain('VanityDefaultTokenPolicy')
  })
})
