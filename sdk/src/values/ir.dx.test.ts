import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('shared value editor DX', () => {
  it('groups units and typed raw forms into focused namespaces', () => {
    const result = project.query`
      import { length, rawValue } from '@mszr/vanity'
      void length.${cursor('length')}
      void rawValue.${cursor('raw')}
    `

    expect(result.at('length').completions).toContainCompletions(['px', 'rem', 'em', 'vh', 'cqi'])
    expect(result.at('raw').completions).toContainCompletions(['unknown', 'length', 'color', 'transformList'])
  })

  it('keeps custom-property anatomy and color interpolation discoverable', () => {
    const result = project.query`
      import { customProperty, mix } from '@mszr/vanity'
      const gap = customProperty('--gap', { type: 'length' })
      void gap.${cursor('property')}
      void mix('#fff', '#000', 0.5).${cursor('mix')}
    `

    expect(result.at('property').completions).toContainCompletions(['$name', '$var'])
    expect(result.at('mix').completions).toContainCompletion('in')
  })

  it('puts an incompatible min operand in one local diagnostic', () => {
    const { errors } = project.check`
      import { min } from '@mszr/vanity'
      void min('1s', '2px')
    `
    expect(errors).toHaveErrorCount(1)
    expect(errors).toHaveError(/never|1s|2px/)
  })

  it('keeps self/system brands and unit hovers readable', () => {
    const result = project.query`
      import type { VanitySystemValue } from '@mszr/vanity'
      import { length } from '@mszr/vanity'
      const measure = length.em(2)
      declare const resolved: VanitySystemValue<'length'>
      void meas${cursor('self')}ure
      void resol${cursor('system')}ved
    `

    expect(result.at('self').hover).toContain('VanityUnitValue')
    expect(result.at('system').hover).toContain('VanitySystemValue')
    expect(result.at('self').hover).not.toContain('VanityExpressionNode')
    expect(result.at('system').hover).not.toContain('VanityExpressionNode')
  })
})
