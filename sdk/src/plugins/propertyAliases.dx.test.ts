import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('property alias editor DX', () => {
  it('completes exact aliases beside standards in both mode', () => {
    const result = project.query`
      import { createSystem, propertyAliases } from '@mszr/vanity'
      const ds = createSystem()
        .addPlugin(propertyAliases({ py: 'paddingBlock', bg: 'background' }))
        .consolidate()
      void ds.class({ ${cursor} })
    `
    expect(result.completions).toContainCompletions(['py', 'bg', 'paddingBlock', 'background', 'color'])
    expect(result.completions).not.toContainCompletion('pb')
  })

  it('aliases-only narrows the primary vocabulary and leaves class.standard complete', () => {
    const result = project.query`
      import { createSystem, propertyAliases } from '@mszr/vanity'
      const ds = createSystem()
        .addPlugin(propertyAliases({ py: 'paddingBlock' }, { expose: 'aliases-only' }))
        .consolidate()
      void ds.class({ ${cursor('primary')} })
      void ds.class.standard({ ${cursor('standard')} })
    `
    expect(result.at('primary').completions).toContainCompletion('py')
    expect(result.at('primary').completions).not.toContainCompletion('paddingBlock')
    expect(result.at('standard').completions).toContainCompletion('paddingBlock')
  })

  it('retains alias completion for reusable fragments', () => {
    const result = project.query`
      import { createSystem, propertyAliases } from '@mszr/vanity'
      const ds = createSystem()
        .addPlugin(propertyAliases({ py: 'paddingBlock' }))
        .consolidate()
      const fragment = ds.fragment({ ${cursor('fragment')} })
      void ds.class([fragment, { py: '2rem' }])
    `
    expect(result.at('fragment').completions).toContainCompletions(['py', 'paddingBlock'])
  })
})
