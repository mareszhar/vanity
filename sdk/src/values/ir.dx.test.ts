import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('shared value editor DX', () => {
  it('groups units and typed raw forms into focused namespaces', () => {
    const result = project.query`
      import { angle, flex, frequency, length, rawValue, resolution, time } from '@mszr/vanity'
      void length.${cursor('length')}
      void angle.${cursor('angle')}
      void time.${cursor('time')}
      void frequency.${cursor('frequency')}
      void resolution.${cursor('resolution')}
      void flex.${cursor('flex')}
      void rawValue.${cursor('raw')}
    `

    expect(result.at('length')).toSuggest(['px', 'rem', 'em', 'vh', 'cqi'], { requireDocumentation: true })
    expect(result.at('raw')).toSuggest(['unknown', 'length', 'color', 'transformList'], { requireDocumentation: true })
    const inheritedFunctionMembers = new Set(['apply', 'arguments', 'bind', 'call', 'caller', 'length', 'name', 'prototype', 'toString', 'Symbol', '[Symbol.hasInstance]'])
    for (const namespace of ['length', 'angle', 'time', 'frequency', 'resolution', 'flex', 'raw'] as const) {
      const observation = result.at(namespace)
      const members = observation.completionNames.filter(name => !inheritedFunctionMembers.has(name))
      expect(members.length, namespace).toBeGreaterThan(0)
      expect(observation).toSuggest(members, { requireDocumentation: true })
    }
  })

  it('keeps custom-property anatomy and color interpolation discoverable', () => {
    const result = project.query`
      import { colorMix, customProperty } from '@mszr/vanity'
      const gap = customProperty('--gap', { type: 'length' })
      void gap.${cursor('property')}
      void colorMix(['#fff', '#000']).${cursor('mix')}
    `

    expect(result.at('property')).toSuggest(['$name', '$var'])
    expect(result.at('mix')).toSuggest('in')
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

    expect(result.at('self').hover?.displayText).toContain('VanityUnitValue')
    expect(result.at('system').hover?.displayText).toContain('VanitySystemValue')
    expect(result.at('self').hover?.text).not.toContain('VanityExpressionNode')
    expect(result.at('system').hover?.text).not.toContain('VanityExpressionNode')
  })
})
