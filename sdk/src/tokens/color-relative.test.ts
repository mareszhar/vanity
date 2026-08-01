import { channel, createSystem } from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'

describe('relative color-family parity', () => {
  it('serializes every CSS color family with the same channel-expression law', () => {
    const ds = createSystem()
    const pivot = ds.calc(0.5)
    const base = ds.oklch(0.62, 0.16, 28)
    const chained = channel.subtract(pivot).multiply(-1000)

    expect(ds.serialize(ds.rgb.from(base, { r: chained, alpha: 0.8 })))
      .toContain('rgb(from oklch(')
    expect(ds.serialize(ds.hsl.from(base, { h: channel.add(12), s: pivot })))
      .toContain('hsl(from oklch(')
    expect(ds.serialize(ds.hwb.from(base, { w: channel.multiply(0.5) })))
      .toContain('hwb(from oklch(')
    expect(ds.serialize(ds.lab.from(base, { a: channel.add(2), alpha: pivot })))
      .toContain('lab(from oklch(')
    expect(ds.serialize(ds.lch.from(base, { c: chained })))
      .toContain('lch(from oklch(')
    expect(ds.serialize(ds.oklab.from(base, { b: channel.subtract(0.1) })))
      .toContain('oklab(from oklch(')
    expect(ds.serialize(ds.oklch.from(base, { l: chained })))
      .toContain('oklch(')
    expect(ds.serialize(ds.color.from(base, {
      space: 'display-p3',
      channels: [channel.add(0.1), undefined, pivot],
      alpha: channel.multiply(0.8),
    }))).toContain('color(from oklch(')

    expect(ds.serialize(ds.rgb.from(base, { r: chained })))
      .toContain('calc((r - calc(0.5)) * -1000)')
  })

  it('keeps logical token and mutable-control channels live through consolidation', () => {
    const open = createSystem()
      .addToken('pivot', ds => ds.tdef.number({ val: 0.5, mutable: true, register: true }))
      .addToken('base', ds => ds.oklch(0.64, 0.17, 32))
      .addToken('relative', ds => ds.rgb.from(ds.t.base, {
        r: channel.subtract(ds.t.pivot).multiply(-2),
      }))
    const ds = open.consolidate({ prefix: 'relative-family' })
    const { css } = emit(() => ds.class({ color: ds.t.relative }))

    expect(css).toContain('rgb(from var(--relative-family-base)')
    expect(css).toContain('var(--relative-family-pivot)')
    expect(css).not.toContain('[object Object]')
  })
})
