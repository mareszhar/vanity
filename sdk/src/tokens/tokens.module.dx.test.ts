import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('token-module editor DX', () => {
  it('discovers configuration, typed no-default constructors, handles, and projections', () => {
    const result = project.query`
      import { createSystem, data, oklch } from '@mszr/vanity'
      const open = createSystem().addAxis('scheme', {
        modes: { dark: data('scheme', 'dark') },
      })
      const colors = open.defineTokens({
        color: {
          brand: open.tdef({ val: oklch(0.58, 0.2, 285), mutable: true, axes: { scheme: { dark: null } } }),
        },
      })
      const ds = open.addTokens(colors).consolidate()
      void open.tdef.${cursor('typed')}
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
      import { createSystem, data } from '@mszr/vanity'
      const open = createSystem().addAxis('scheme', {
        modes: { dark: data('scheme', 'dark') },
      })
      const ds = open.addTokens({
        color: { accent: open.tdef({ val: 'red', axes: { scheme: { dark: 'black' } } }) },
      }).consolidate()
      void ds.t.color.accent.$axes.scheme.light
    `

    expect(errors).toHaveErrorCount(1)
    expect(errors).toHaveError(/light.*does not exist|Property 'light'/)
  })

  it('keeps token hovers compact and factual', () => {
    const result = project.query`
      import { createSystem, oklch } from '@mszr/vanity'
      const ds = createSystem()
        .addTokens({ color: { brand: oklch(0.58, 0.2, 285) } })
        .consolidate({ prefix: 'app' })
      ds.t.color.${cursor('brand')}brand
    `

    const hover = result.at('brand').hover ?? ''
    expect(hover).toContain('VanityTokenHandleOf')
    expect(hover).toContain('app-color-brand')
    expect(hover).toContain('color.brand')
    expect(hover).toContain('VanityDefaultTokenPolicy')
  })
})
