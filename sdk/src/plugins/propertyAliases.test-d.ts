import { createSystem, media, propertyAliases } from '@mszr/vanity'
import { describe, it } from 'vitest'

const both = createSystem()
  .addPlugin(propertyAliases({ py: 'paddingBlock', bg: 'background' }))
  .addConditions({ wide: media('(width >= 60rem)') })
  .consolidate()

const strict = createSystem()
  .addPlugin(propertyAliases({ py: 'paddingBlock' }, { expose: 'aliases-only' }))
  .addConditions({ wide: media('(width >= 60rem)') })
  .consolidate()

describe('property alias typing', () => {
  it('keeps aliases exact and exposes the standards lane', () => {
    const fragment = both.fragment({ py: '1rem', bg: 'red' })
    void both.class([fragment, false, both.omit, { py: '2rem' }])
    void both.rules({ body: [fragment, { bg: 'blue' }] })
    void both.recipe({ base: [fragment, { color: 'white' }] })
    void both.anatomy({
      parts: ['root'],
      base: { root: [fragment, { color: 'white' }] },
    })
    void both.class({ py: '1rem', paddingBlock: '2rem', bg: 'red' })
    void both.class({ 'wide': { py: '1rem' }, '&:hover': { bg: 'red' } })
    // @ts-expect-error — unknown aliases never become an index signature
    void both.class({ pyy: '1rem' })
    // @ts-expect-error — unknown aliases stay local inside contribution arrays
    void both.class([{ pyy: '1rem' }])

    const strictFragment = strict.fragment({ py: '1rem' })
    void strict.class([strictFragment, { py: '2rem' }])
    void strict.rules({ body: [strictFragment, { py: '2rem' }] })
    void strict.class({ 'wide': { py: '1rem' }, '&:hover': { py: '2rem' } })
    // @ts-expect-error — aliases-only removes aliased standards from the primary lane
    void strict.class({ paddingBlock: '1rem' })
    // @ts-expect-error — hidden standards stay hidden in fragments
    void strict.fragment({ paddingBlock: '1rem' })
    // @ts-expect-error — the hidden spelling remains hidden in every conditional arm
    void strict.class({ wide: { paddingBlock: '1rem' } })
    void strict.class.standard({ paddingBlock: '1rem' })
  })
})
