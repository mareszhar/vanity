/** Language-service contracts for the fluent CSS value surface. */

import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('cSS value editor DX', () => {
  it('calculation operations complete as one small immutable surface', () => {
    const { completions } = project.query`
      import { calc } from '@mszr/vanity'
      void calc('1rem').${cursor}
    `

    expect(completions).toContainCompletions(['add', 'subtract', 'multiply', 'divide', 'negate', 'css'])
  })

  it('a dimensional mistake is one diagnostic at its operand', () => {
    const { errors } = project.check`
      import { calc } from '@mszr/vanity'
      void calc('1rem').add('20deg')
    `

    expect(errors).toHaveErrorCount(1)
    expect(errors).toHaveError(/20deg|never/)
  })

  it('grid helpers complete as one focused namespace', () => {
    const { completions } = project.query`
      import { grid } from '@mszr/vanity'
      void grid.${cursor}
    `

    expect(completions).toContainCompletions(['minmax', 'repeat', 'template', 'areas'])
  })

  it('relative color and channel operations are discoverable', () => {
    const result = project.query`
      import { channel, color, hsl, hwb, lab, lch, oklab, oklch, rgb } from '@mszr/vanity'
      void oklch.${cursor('oklch')}
      void rgb.${cursor('rgb')}
      void hsl.${cursor('hsl')}
      void hwb.${cursor('hwb')}
      void lab.${cursor('lab')}
      void lch.${cursor('lch')}
      void oklab.${cursor('oklab')}
      void color.${cursor('color')}
      void channel.${cursor('channel')}
    `

    expect(result.at('oklch').completions).toContainCompletion('from')
    for (const family of ['rgb', 'hsl', 'hwb', 'lab', 'lch', 'oklab', 'color'])
      expect(result.at(family).completions).toContainCompletion('from')
    expect(result.at('channel').completions).toContainCompletions(['set', 'add', 'subtract', 'multiply', 'divide'])
  })
})
