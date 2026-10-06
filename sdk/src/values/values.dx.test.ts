/** Language-service contracts for the fluent CSS value surface. */

import { cursor, mark } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('cSS value editor DX', () => {
  it('calculation operations complete as one small immutable surface', () => {
    const { completions } = project.query`
      import { calc } from '@mszr/vanity'
      void calc('1rem').${cursor}
    `

    expect(completions).toSuggest(['add', 'subtract', 'multiply', 'divide', 'negate', 'css', 'type', 'dimension'], { requireDocumentation: true })
  })

  it('a dimensional mistake is one diagnostic at its operand', () => {
    for (const operation of ['add', 'subtract']) {
      const result = project.check`
        import { calc } from '@mszr/vanity'
        void calc('1rem').${operation}('20deg')
      `
      expect(result).toHaveErrorCount(1)
      expect(result).toHaveError(/calc cannot add or subtract length and angle: use compatible dimensions/, { on: '\'20deg\'' })
      expect(project.check({ '__selenita__.ts': result.files['__selenita__.ts']!.replace('20deg', '20px') })).toBeClean()
    }
    const uncertain = project.check`
      import { angle, calc, length } from '@mszr/vanity'
      const operand = Math.random() > 0.5 ? length.rem(1) : angle.deg(20)
      void calc('1rem').add(${mark('operand')`operand`})
      void calc(operand).subtract('1px')
    `
    expect(uncertain).toHaveErrorCount(2)
    expect(uncertain).toHaveError(/length and angle: use compatible dimensions/, { on: uncertain.rangeOf('operand') })
    expect(uncertain).toHaveError(/angle and length: use compatible dimensions/, { on: '\'1px\'' })
    expect(project.check({ '__selenita__.ts': uncertain.files['__selenita__.ts']!.replace('angle.deg(20)', 'length.px(20)').replace('angle, calc', 'calc') })).toBeClean()
    const guidance = project.query`
      import { calc } from '@mszr/vanity'
      calc('1rem').add(${cursor})
    `.signatureHelp
    expect(guidance?.activeParameter?.documentation).toContain('lengths and percentages may combine')
  })

  it('grid helpers complete as one focused namespace', () => {
    const { completions } = project.query`
      import { grid } from '@mszr/vanity'
      void grid.${cursor}
    `

    expect(completions).toSuggest(['minmax', 'repeat', 'template', 'areas'])
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

    expect(result.at('oklch')).toSuggest('from')
    for (const family of ['rgb', 'hsl', 'hwb', 'lab', 'lch', 'oklab', 'color'] as const)
      expect(result.at(family)).toSuggest('from')
    expect(result.at('channel')).toSuggest(['set', 'add', 'subtract', 'multiply', 'divide'], { requireDocumentation: true })
  })
})
