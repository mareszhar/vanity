import { channel, createSystem } from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

describe('relative color-family types', () => {
  it('discovers .from on all eight families with collision-free alpha naming', () => {
    const ds = createSystem()
    const base = ds.color('red')

    expectTypeOf(ds.rgb.from(base, { r: channel.add(1) }).type).toEqualTypeOf<'color'>()
    expectTypeOf(ds.hsl.from(base, { h: channel.add(1) }).type).toEqualTypeOf<'color'>()
    expectTypeOf(ds.hwb.from(base, { w: channel.add(1) }).type).toEqualTypeOf<'color'>()
    expectTypeOf(ds.lab.from(base, { a: channel.add(1), alpha: 0.5 }).type).toEqualTypeOf<'color'>()
    expectTypeOf(ds.lch.from(base, { c: channel.add(1) }).type).toEqualTypeOf<'color'>()
    expectTypeOf(ds.oklab.from(base, { a: channel.add(1), alpha: 0.5 }).type).toEqualTypeOf<'color'>()
    expectTypeOf(ds.oklch.from(base, { c: channel.add(1) }).type).toEqualTypeOf<'color'>()
    expectTypeOf(ds.color.from(base, { space: 'display-p3' }).type).toEqualTypeOf<'color'>()

    // @ts-expect-error — Lab's `a` is an axis; alpha is always `alpha`.
    ds.lab.from(base, { opacity: 0.5 })
    // @ts-expect-error — RGB has no hue channel.
    ds.rgb.from(base, { h: 30 })
  })
})
