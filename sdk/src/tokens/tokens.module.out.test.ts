import { hail } from '@mszr/vanity/presets'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { createSystem, VanityError } from '../index'
import { collectInspection } from '../introspect/records'
import { substrate } from '../substrate'

describe('token-module output', () => {
  it('emits only declared public properties and living standards expressions', () => {
    const { css } = emit(() => substrate.modules.runInFileScope({
      filePath: 'src/tokens/tokens.module.system.ts',
      packageName: '@vanity/fixture',
    }, () => {
      const open = createSystem()
      const module = open.defineTokens({
        color: {
          brand: open.oklch(0.58, 0.2, 285),
          compileOnly: open.tdef({ val: open.oklch(0.4, 0.1, 120), reference: 'val', emit: false }),
        },
        future: open.tdef.length(),
      }).add(m => ({
        color: {
          brandSoft: open.alpha(m.color.brand, 0.12),
          compileOnlySoft: open.alpha(m.color.compileOnly, 0.2),
        },
      }))
      const system = open.addTokens(module).consolidate({ prefix: 'app' })
      void system.class
      return system
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
    const ds = open.addTokens({
      color: open.defineTokens({
        hue: open.tdef.number({ val: 275, mutable: true, register: true }),
        whole: open.tdef.color({ val: open.oklch(0.6, 0.15, 275), mutable: true }),
        liveBrand: open.tdef.color({ val: open.oklch(0.58, 0.2, 285), mutable: true }),
      })
        .add(m => ({
          channeled: open.oklch(0.6, 0.15, m.hue),
          elevated: open.oklchx.from(m.liveBrand, { e: 0.2 }),
        }))
        .add(m => ({
          onWhole: open.legibleOn(m.whole),
          onChanneled: open.legibleOn(m.channeled),
          onElevated: open.legibleOn(m.elevated),
        })),
    }).consolidate({ prefix: 'app' })
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
    const { open, module } = (() => {
      const system = createSystem()
      return {
        open: system,
        module: system.defineTokens({
          color: {
            onExternal: system.legibleOn(system.oklch(0.6, 0.15, { var: 'var(--external-hue)' })),
          },
        }),
      }
    })()

    try {
      emit(() => substrate.modules.runInFileScope({
        filePath: 'src/tokens/tokens.module.system.ts',
        packageName: '@vanity/fixture',
      }, () => open.addTokens(module).consolidate()))
      throw new Error('expected the token module to reject the external live channel')
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
