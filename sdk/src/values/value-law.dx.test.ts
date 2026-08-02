import { cursor } from '@mszr/selenita'
import { vanityProject } from '@test'
import { describe, expect, it } from 'vitest'

const project = vanityProject()

describe('the value law in editor tooling', () => {
  it('completes channel chains and localizes incompatible channel values', () => {
    const result = project.query`
      import { createSystem } from '@mszr/vanity'
      const first = createSystem().addTokens(current => ({
        pivot: current.tdef.number({ val: 0.5, mutable: true }),
        brand: 'rebeccapurple',
      }))
      const shifted = first.oklch.from(first.t.brand, {
        l: first.channel.subtract(first.t.pivot).${cursor('channel')}multiply(-1000),
      })
      first.oklch(first.t.brand, 0.2, 280)
      void shifted
    `

    expect(result.at('channel').completions).toContainCompletions([
      'add',
      'subtract',
      'multiply',
      'divide',
    ])
    expect(result.errors).toHaveErrorCount(1)
    expect(result.errors).toHaveError(/brand|VanityNumericColorChannel|assignable/)
  })

  it('accepts compatible handles without a var() detour and keeps exact results', () => {
    const result = project.query`
      import { createEngine } from '@test/legacy'
      const de = createEngine()
      const ds = de.createSystem({
        tokens: {
          channel: { l: de.number(0.6), c: de.number(0.18), h: de.angle.deg(285) },
          space: { sm: de.length.rem(0.5), md: de.length.rem(1) },
        },
      })
      const color = ds.oklch(ds.t.channel.l, ds.t.channel.c, ds.t.channel.h)
      const negative = ds.calc(ds.t.space.md).negate()
      const bounded = ds.${cursor('clamp')}clamp(ds.t.space.sm, ds.t.space.md, ds.length.rem(4))
      ds.css({ color, marginInline: negative, padding: ds.t.space.md })
      void bounded
    `

    expect(result.errors).toHaveErrorCount(0)
    expect(result.at('clamp').hover).toContain('clamp')
  })
})
