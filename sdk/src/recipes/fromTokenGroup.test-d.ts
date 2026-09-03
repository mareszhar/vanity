import { createSystem, fromTokenGroup } from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

const ds = createSystem()
  .addTokens({ tone: { brand: 'purple', danger: 'red' } })
  .consolidate()
const tones = fromTokenGroup(ds.t.tone, token => ({ background: token }))

describe('fromTokenGroup typing', () => {
  it('retains exact keys and callback handle types', () => {
    expectTypeOf(tones).toHaveProperty('brand')
    expectTypeOf(tones).toHaveProperty('danger')
    // @ts-expect-error — exact group keys only
    void tones.warning
  })
})
