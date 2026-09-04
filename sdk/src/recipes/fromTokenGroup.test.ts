import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { fromTokenGroup } from '../index'
import { createFixtureSystem } from '../test-support/system'

describe('fromTokenGroup()', () => {
  it('proves the repeated recipe case: same-key tone variants from a palette group', () => {
    const { returned: badge } = emit(() => {
      const ds = createFixtureSystem({
        tokens: { tone: { brand: 'rebeccapurple', danger: 'crimson', neutral: 'gray' } },
      })

      return ds.recipe({
        variants: {
          tone: fromTokenGroup(ds.t.tone, token => ({ background: token })),
        },
        defaults: { tone: 'neutral' },
      }, 'badge')
    })

    expect(badge.variants.tone).toEqual(['brand', 'danger', 'neutral'])
    expect(badge({ tone: 'danger' })).toMatch(/badge_tone_danger/)
  })

  it('rejects arbitrary objects so the helper never becomes a generic map alias', () => {
    expect(() => fromTokenGroup({ nope: 1 } as never, value => value)).toThrow(/resolved token handle/)
  })
})
