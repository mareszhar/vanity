import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('policy editor DX', () => {
  it('completes namespaced policies and localizes a bound restriction', () => {
    const result = project.query`
      import { createSystem, oklch } from '@mszr/vanity'
      const ds = createSystem({
        ${cursor('policy')}constructors: {
          oklch: { restrict: { level: 'forbid', use: 'oklchx' } },
        },
      })
      oklch(0.6, 0.2, 280)
      ds.oklch(0.6, 0.2, 280)
    `

    expect(result.at('policy').completions).toContainCompletions([
      'constructors',
      'support',
      'layerOrder',
      'tokens',
      'plugins',
    ])
    expect(result.errors).toHaveErrorCount(1)
    expect(result.errors).toHaveError(/forbidden|oklchx|argument/)
  })
})
