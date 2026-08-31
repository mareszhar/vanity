import type {
  VanityColorish,
  VanityConstructors,
  VanityCssInput,
  VanityFragment,
  VanityOpenSystemBase,
  VanitySystem,
  VanityToken,
} from '@mszr/vanity'
import { createSystem } from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

describe('public authoring vocabulary', () => {
  it('spells compatible input and token boundaries', () => {
    const open = createSystem().addTokens(current => ({
      length: current.tdef.length({ val: current.length.rem(1), mutable: true }),
      color: current.tdef.color({ val: 'rebeccapurple', mutable: true }),
    }))

    const acceptLength = (_value: VanityCssInput<'length'>) => undefined
    const acceptLengthToken = (_value: VanityToken<'length'>) => undefined
    const acceptColor = (_value: VanityColorish) => undefined

    acceptLength(open.length.rem(1))
    acceptLength(open.t.length)
    acceptLength(open.calc(open.t.length).add(open.length.rem(1)))
    acceptLengthToken(open.t.length)
    acceptColor(open.t.color)

    // @ts-expect-error — color values do not satisfy a typed length-value form
    acceptLength(open.oklch(0.6, 0.2, 280))
    // @ts-expect-error — color tokens do not satisfy a typed length-token form
    acceptLengthToken(open.t.color)
  })

  it('uses compact constructor, open-system, locked-system, and fragment types', () => {
    const withTokens = createSystem().addTokens({ color: { brand: 'red' } })
    const withRemPolicy = createSystem({
      constructors: { length: { unitless: 'rem' } },
    })
    const locked = withTokens.consolidate()
    const lockedWithRemPolicy = withRemPolicy.consolidate()

    const portableHelper = (constructors: VanityConstructors) =>
      constructors.oklch(0.6, 0.2, 280)
    const setupHelper = (system: VanityOpenSystemBase) =>
      system.oklch(0.6, 0.2, 280)
    const styleHelper = (system: VanitySystem): VanityFragment =>
      system.fragment({ color: 'rebeccapurple' })

    portableHelper(withTokens)
    portableHelper(withRemPolicy)
    setupHelper(withTokens)
    setupHelper(withRemPolicy)
    styleHelper(locked)
    styleHelper(lockedWithRemPolicy)

    expectTypeOf(withTokens).toExtend<VanityOpenSystemBase>()
  })
})
