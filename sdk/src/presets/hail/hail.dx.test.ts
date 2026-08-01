import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('hail editor DX', () => {
  it('makes the zero-config vocabulary discoverable without elevation noise', () => {
    const result = project.query`
      import { createSystem } from '@mszr/vanity'
      import { hail } from '@mszr/vanity/presets'
      const ds = createSystem().addPlugin(hail()).consolidate()
      void ds.${cursor('system')}
      void ds.oklchx.${cursor('family')}
      void ds.mx.${cursor('mixins')}
    `

    expect(result.at('system').completions).toContainCompletions([
      'rgbx',
      'hslx',
      'hwbx',
      'labx',
      'lchx',
      'oklabx',
      'oklchx',
      'colorx',
      'span',
      'exact',
      'size',
      'bem',
      'contrastOf',
      'mx',
    ])
    expect(result.at('family').completions).toContainCompletion('from')
    expect(result.at('family').completions).not.toContainCompletion('inE')
    expect(result.at('mixins').completions).toContainCompletions(['circle', 'square', 'truncate'])
  })

  it('projects conditional and renamed members exactly', () => {
    const result = project.query`
      import { createSystem } from '@mszr/vanity'
      import { hail } from '@mszr/vanity/presets'
      const ds = createSystem().addPlugin(hail({
        color: { elevation: true, markers: { span: 'portion', exact: 'literal' } },
      })).consolidate()
      void ds.${cursor('system')}
      void ds.oklchx.${cursor('family')}
      void ds.oklchx.${cursor('hover')}inE
    `

    expect(result.at('system').completions).toContainCompletions(['portion', 'literal'])
    expect(result.at('system').completions).not.toContainCompletions(['span', 'exact'])
    expect(result.at('family').completions).toContainCompletions(['from', 'inE'])
    expect(result.at('hover').hover).toContain('semantic elevation')
    expect(result.at('hover').hover).not.toContain('VanityDefinitionMerge')
  })

  it('localizes malformed ranges, preset names, and elevation conflicts', () => {
    const { errors } = project.check`
      import { createSystem } from '@mszr/vanity'
      import { hail } from '@mszr/vanity/presets'
      hail({ color: { ranges: { l: [0, 0.5, 1], r: [0, 1] } } })
      hail({ presets: { mode: 'opt-in', listed: ['pallete'] } })
      const ds = createSystem().addPlugin(hail({ color: { elevation: true } }))
      ds.oklchx.from('red', { l: 0.5, e: 0.5 })
    `

    expect(errors).toHaveErrorCount(4)
    expect(errors).toHaveError(/readonly.*minimum.*maximum|not assignable/)
    expect(errors).toHaveError(/pallete|HailPresetName/)
    expect(errors).toHaveError(/e.*never|not assignable/)
  })

  it('turns Hail hover and utility hover into compact inline guidance', () => {
    const result = project.query`
      import { createSystem } from '@mszr/vanity'
      import { ${cursor('hail')}hail } from '@mszr/vanity/presets'
      const ds = createSystem().addPlugin(hail()).consolidate()
      void ds.${cursor('size')}size
      void ds.${cursor('contrast')}contrastOf
    `

    expect(result.at('hail').hover).toContain('deletable opinionated layer')
    expect(result.at('size').hover).toContain('unitless')
    expect(result.at('contrast').hover).toContain('Aesthetic')
    for (const name of ['hail', 'size', 'contrast'] as const)
      expect(result.at(name).hover).not.toMatch(/VanityDefinitionMerge|VanityExpressionNode|\bany\b/)
  })
})
