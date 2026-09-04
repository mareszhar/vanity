import { angle, createSystem, length, number, rawValue } from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

describe('the value law — compatible handles are values', () => {
  it('crosses constructors, operations, fallbacks, and property forms', () => {
    const open = createSystem()
    const ds = open.addTokens({
      channel: {
        lightness: open.tdef({ val: number(0.6), mutable: true }),
        chroma: open.tdef({ val: number(0.18), mutable: true }),
        hue: open.tdef({ val: angle.deg(285), mutable: true }),
      },
      space: {
        sm: open.tdef({ val: length.rem(0.5), mutable: true }),
        md: open.tdef({ val: length.rem(1), mutable: true }),
      },
      image: {
        hero: open.tdef({ val: rawValue.image('url(hero.png)') }),
      },
    }).consolidate()

    const color = ds.oklch(ds.t.channel.lightness, ds.t.channel.chroma, ds.t.channel.hue)
    const negative = ds.calc(ds.t.space.md).negate()
    const sum = ds.calc(ds.t.space.sm).add(ds.t.space.md)
    const bounded = ds.clamp(ds.t.space.sm, ds.t.space.md, ds.length.rem(4))
    const tracks = ds.grid.minmax(ds.t.space.sm, ds.t.space.md)
    const fallback = ds.customProperty('--library-gap', { type: 'length' }).$var(ds.t.space.md)
    const image = ds.lightDark(ds.rawValue.image('url(day.png)'), 'none')
    const tokenImage = ds.lightDark('none', ds.t.image.hero)

    ds.class({
      'color': color,
      'marginInline': negative,
      'padding': ds.t.space.md,
      'gridTemplateColumns': ds.grid.repeat(2, tracks),
      '--fallback-gap': fallback,
      'backgroundImage': image,
      'maskImage': tokenImage,
    })

    ds.snapshotFrom(rt => rt.t.space.md.$set(ds.t.space.sm))

    expectTypeOf(sum).toExtend<import('@mszr/vanity').VanityMathValue<'length'>>()
    expectTypeOf(bounded).toExtend<import('@mszr/vanity').VanityMathValue<'length'>>()

    // @ts-expect-error — a length handle is not a numeric color channel
    ds.oklch(ds.t.space.md, ds.t.channel.chroma, ds.t.channel.hue)
    // @ts-expect-error — an angle handle cannot be added to a length calculation
    ds.calc(ds.t.space.md).add(ds.t.channel.hue)
    // @ts-expect-error — CSS light-dark() cannot mix its color and image forms
    ds.lightDark(ds.rawValue.image('url(day.png)'), ds.oklch(0.2, 0, 0))
    // @ts-expect-error — locked value surfaces expose only declared constructors
    ds.unregisteredColorPair({ light: 'white', dark: 'black' })
  })
})
