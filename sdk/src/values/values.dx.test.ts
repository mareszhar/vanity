/** Language-service contracts for the fluent CSS value surface. */

import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('cSS value editor DX', () => {
  it('calculation operations complete as one small immutable surface', () => {
    const { completions } = project.query`
      import { createEngine } from '@test/legacy'
      void createEngine().calc('1rem').${cursor}
    `

    expect(completions).toContainCompletions(['add', 'subtract', 'multiply', 'divide', 'negate', 'css'])
  })

  it('a dimensional mistake is one diagnostic at its operand', () => {
    const { errors } = project.check`
      import { createEngine } from '@test/legacy'
      void createEngine().calc('1rem').add('20deg')
    `

    expect(errors).toHaveErrorCount(1)
    expect(errors).toHaveError(/20deg|never/)
  })

  it('grid helpers complete as one focused namespace', () => {
    const { completions } = project.query`
      import { createEngine } from '@test/legacy'
      void createEngine().grid.${cursor}
    `

    expect(completions).toContainCompletions(['minmax', 'repeat', 'template', 'areas'])
  })

  it('relative color and channel operations are discoverable', () => {
    const result = project.query`
      import { createEngine } from '@test/legacy'
      const de = createEngine()
      void de.oklch.${cursor('oklch')}
      void de.rgb.${cursor('rgb')}
      void de.hsl.${cursor('hsl')}
      void de.hwb.${cursor('hwb')}
      void de.lab.${cursor('lab')}
      void de.lch.${cursor('lch')}
      void de.oklab.${cursor('oklab')}
      void de.color.${cursor('color')}
      void de.channel.${cursor('channel')}
    `

    expect(result.at('oklch').completions).toContainCompletion('from')
    for (const family of ['rgb', 'hsl', 'hwb', 'lab', 'lch', 'oklab', 'color'])
      expect(result.at(family).completions).toContainCompletion('from')
    expect(result.at('channel').completions).toContainCompletions(['set', 'add', 'subtract', 'multiply', 'divide'])
  })
})
