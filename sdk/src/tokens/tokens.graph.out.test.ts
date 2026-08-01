import { hail } from '@mszr/vanity/presets'
import { emit } from '@test'
import { createEngine, VanityError } from '@test/legacy'
import { describe, expect, it } from 'vitest'
import { collectInspection } from '../internal/inspect'
import { createSystem } from '../system/openSystem'

describe('token-graph output', () => {
  it('emits only declared public properties and living standards expressions', () => {
    const de = createEngine()
    const { css } = emit(() => de.createSystem({
      tokens: de.defineTokens({
        color: {
          brand: de.oklch(0.58, 0.2, 285),
          compileOnly: de.token({ val: de.oklch(0.4, 0.1, 120), reference: 'val', emit: false }),
        },
        future: de.token.length(),
      }).derive(({ color }) => ({
        color: {
          brandSoft: de.alpha(color.brand, 0.12),
          compileOnlySoft: de.alpha(color.compileOnly, 0.2),
        },
      })),
      prefix: 'app',
    }))

    expect(css).toContain('--app-color-brand: oklch(0.58 0.2 285);')
    expect(css).toContain('--app-color-brand-soft: oklch(from var(--app-color-brand) l c h / 0.12);')
    expect(css).toContain('--app-color-compile-only-soft: oklch(0.4 0.1 120 / 0.2);')
    expect(css).not.toContain('--app-color-compile-only:')
    expect(css).not.toContain('--app-future:')
    expect(css).not.toContain('undefined')
  })

  it('derives live legibleOn fallbacks from authored defaults without coupling them to a scheme', () => {
    const open = createSystem().addPlugin(hail({ color: { elevation: true } }))
    const palette = open.defineTokens({
      color: {
        hue: open.tdef.number({ val: 275, mutable: true, register: { inherits: true } }),
        whole: open.tdef.color({ val: open.oklch(0.6, 0.15, 275), mutable: true }),
        liveBrand: open.tdef.color({ val: open.oklch(0.58, 0.2, 285), mutable: true }),
      },
    })
      .add(({ color }) => ({
        color: {
          channeled: open.oklch(0.6, 0.15, color.hue),
          elevated: open.oklchx.from(color.liveBrand, { e: 0.2 }),
        },
      }))
      .add(({ color }) => ({
        color: {
          onWhole: open.legibleOn(color.whole),
          onChanneled: open.legibleOn(color.channeled),
          onElevated: open.legibleOn(color.elevated),
        },
      }))

    const ds = open.addTokens(palette).consolidate({ prefix: 'app' })
    const { result: { css } } = collectInspection(() =>
      emit(() => {
        void ds.class
        return ds
      }))

    expect(css).toMatch(/--app-color-on-whole:\s*(?:black|white);/)
    expect(css).toMatch(/--app-color-on-channeled:\s*(?:black|white);/)
    expect(css).toMatch(/--app-color-on-elevated:\s*(?:black|white|light-dark\(black, white\)|light-dark\(white, black\));/)
    expect(css).toContain('--app-color-channeled: oklch(0.6 0.15 var(--app-color-hue))')
    expect(css).toContain('--app-color-elevated: oklch(from')
    expect(css).not.toContain('contrast-color(')
    expect(css).toContain('var(--app-color-live-brand)')
  })

  it('returns a structured diagnostic when a live target has no authored representative', () => {
    const de = createEngine()
    const tokens = de.defineTokens({
      color: {
        onExternal: de.legibleOn(de.oklch(0.6, 0.15, { var: 'var(--external-hue)' })),
      },
    })

    try {
      emit(() => de.createSystem({ tokens }))
      throw new Error('expected the token graph to reject the external live channel')
    }
    catch (error) {
      expect(error).toBeInstanceOf(VanityError)
      const diagnostic = (error as VanityError).diagnostics[0]
      expect(diagnostic).toMatchObject({
        code: 'VANITY_TOKENS_INVALID_COLOR',
        path: ['color', 'onExternal'],
        fix: { message: 'give it a color value, or reference a color token' },
      })
      expect(diagnostic.message).toContain('no authored default value')
    }
  })
})
