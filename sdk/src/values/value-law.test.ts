import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { angle, createSystem, length, number, rawValue } from '../index'
import { substrate } from '../substrate'

function createValueLawSystem() {
  return substrate.modules.runInFileScope({
    filePath: 'src/values/value-law.system.ts',
    packageName: '@vanity/fixture',
  }, () => {
    const open = createSystem()
    return open.addTokens({
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
  })
}

describe('the value law — compatible handles are values', () => {
  it('serializes one handle vocabulary across value and declaration forms', () => {
    const { css, returned } = emit(() => {
      const ds = createValueLawSystem()

      const color = ds.oklch(ds.t.channel.lightness, ds.t.channel.chroma, ds.t.channel.hue)
      const calculation = ds.calc(ds.t.space.md).negate()
      const image = ds.lightDark(ds.rawValue.image('url(day.png)'), 'none')
      const tokenImage = ds.lightDark('none', ds.t.image.hero)
      const className = ds.class({
        color,
        marginInline: calculation,
        padding: ds.t.space.md,
        gridTemplateColumns: ds.grid.repeat(2, ds.grid.minmax(ds.t.space.sm, ds.t.space.md)),
        backgroundImage: image,
        maskImage: tokenImage,
      })
      const seed = ds.snapshotFrom((rt) => {
        rt.t.space.md.$set(ds.t.space.sm)
      })

      return {
        className,
        color: ds.serialize(color),
        calculation: ds.serialize(calculation),
        image: ds.serialize(image),
        tokenImage: ds.serialize(tokenImage),
        seed,
      }
    })

    expect(returned.color).toBe('oklch(var(--vanity-channel-lightness) var(--vanity-channel-chroma) var(--vanity-channel-hue))')
    expect(returned.calculation).toBe('calc(-1 * var(--vanity-space-md))')
    expect(returned.image).toBe('light-dark(url(day.png), none)')
    expect(returned.tokenImage).toBe('light-dark(none, var(--vanity-image-hero))')
    expect(returned.seed.overrides).toEqual([{
      token: ['space', 'md'],
      address: { kind: 'base' },
      val: 'var(--vanity-space-sm)',
    }])
    expect(css).toContain('padding: var(--vanity-space-md)')
    expect(css).toContain('grid-template-columns: repeat(2, minmax(var(--vanity-space-sm), var(--vanity-space-md)))')
    expect(css).toContain('background-image: light-dark(url(day.png), none)')
    expect(css).toContain('mask-image: light-dark(none, var(--vanity-image-hero))')
  })
})
