import type { HailOptions } from '@mszr/vanity/presets'
import { createSystem } from '@mszr/vanity'
import { hail } from '@mszr/vanity/presets'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'

describe('hail', () => {
  it('installs a zero-output static constructor layer by default', () => {
    const ds = createSystem().addPlugin(hail()).consolidate({ prefix: 'hail' })

    expect(ds.serialize(ds.oklchx(0.62, 0.18, 282))).toBe('oklch(0.62 0.18 282)')
    expect(ds.serialize(ds.size(2))).toBe('16')
    expect(ds.serialize(ds.size(2, 'px'))).toBe('16px')
    expect(ds.serialize(ds.size(2, 'rem'))).toBe('1rem')
    expect(ds.serialize(ds.contrastOf('oklch(0.5 0.1 30)')))
      .toBe('oklch(from oklch(0.5 0.1 30) calc((l - 0.65) * -1000) 0.04 h)')
    expect(ds.mx.circle('2rem')).toEqual({
      inlineSize: '2rem',
      blockSize: '2rem',
      borderRadius: '50%',
    })

    const { css } = emit(() => ds.class({
      color: ds.oklchx(0.62, 0.18, 282),
      inlineSize: ds.size(2, 'px'),
    }, 'static-hail'))
    expect(css).not.toContain('--hail-hail-control')
    expect(css).toContain('inline-size: 16px')
  })

  it('normalizes configured ranges and composes exact/span/native relative modes', () => {
    const ds = createSystem().addPlugin(hail({
      color: { ranges: { l: [0.1, 0.9], c: [0, 0.4], h: [300, 20], alpha: [0.2, 1] } },
    })).consolidate({ prefix: 'hail' })

    expect(ds.serialize(ds.oklchx(0.5, 0.5, 0.5, 0.5)))
      .toBe('oklch(0.5 0.2 340 / 0.6)')
    expect(ds.serialize(ds.oklchx(ds.exact(0.7), ds.exact(0.12), ds.exact(35))))
      .toBe('oklch(0.7 0.12 35)')
    expect(ds.serialize(ds.oklchx.from('oklch(0.5 0.2 30)', {
      c: ds.span(0.25),
      h: ds.channel.add(12),
      alpha: ds.exact(0.8),
    }))).toBe('oklch(0.5 0.3 42 / 0.8)')
    expect(ds.serialize(ds.oklchx.from('oklch(0.5 0.2 30)', { c: ds.span(0.25) })))
      .toBe('oklch(0.5 0.3 30)')
  })

  it('covers every color family and preserves percentage units for live HSL/HWB ranges', () => {
    const ds = createSystem().addPlugin(hail({
      color: {
        ranges: { l: [10, 90], c: [0, 0.4], h: [300, 20], s: [20, 80], w: [0, 60], b: [0, 40] },
      },
      controls: { default: 'static', overrides: { s: 'mutable', w: 'token' } },
    })).consolidate({ prefix: 'hail' })

    const values = [
      ds.rgbx(10, 20, 30),
      ds.hslx(0.5, 0.5, 0.5),
      ds.hwbx(0.5, 0.5, 0.5),
      ds.labx(0.5, 0.5, 0.5),
      ds.lchx(0.5, 0.5, 0.5),
      ds.oklabx(0.5, 0.5, 0.5),
      ds.oklchx(0.5, 0.5, 0.5),
      ds.colorx('display-p3', 0.1, 0.2, 0.3),
      ds.colorx('display-p3', [0.1, 0.2, 0.3], { alpha: 0.8 }),
      ds.hslx.from('red', { s: ds.span(0.1) }),
      ds.hwbx.from('red', { w: ds.span(0.1) }),
      ds.labx.from('red', { a: ds.span(0.1) }),
      ds.lchx.from('red', { c: ds.span(0.1) }),
      ds.oklabx.from('red', { b: ds.span(0.1) }),
      ds.colorx.from('red', { space: 'display-p3', channels: [0.2] }),
    ]
    expect(values.map(value => ds.serialize(value))).toHaveLength(values.length)
    expect(ds.serialize(ds.hslx(0.5, 0.5, 0.5))).toContain(' * 1%')
    expect(ds.serialize(ds.hwbx(0.5, 0.5, 0.5))).toContain(' * 1%')
  })

  it('emits only controls selected as token or mutable', () => {
    const ds = createSystem().addPlugin(hail({
      color: { ranges: { c: [0, 0.4] } },
      controls: { default: 'static', overrides: { c: 'mutable', base: 'token' } },
    })).consolidate({ prefix: 'hail' })

    const { css } = emit(() => ds.class({
      color: ds.oklchx(0.6, 0.5, 280),
      padding: ds.size(2, 'px'),
    }, 'controls'))
    expect(css).toContain('--hail-hail-control-base: 8')
    expect(css).toContain('--hail-hail-control-ranges-c-min: var(')
    expect(css).toContain('--hail-hail-control-ranges-c-max: var(')
    expect(css).toContain('@property --hail-hail-control-ranges-c-min')
    expect(css).not.toContain('--hail-hail-control-ranges-l-min')
  })

  it('adds scheme-live elevation only when enabled', () => {
    const ds = createSystem().addPlugin(hail({
      color: { elevation: true, ranges: { l: [0.1, 0.9] } },
    })).consolidate({ prefix: 'hail' })

    const value = ds.serialize(ds.oklchx.inE(0.25, 0.1, 280))
    expect(value).toContain('var(--hail-hail-most-elevated-l)')
    expect(new Set(Object.keys(ds.axes.scheme.modes))).toEqual(new Set(['light', 'dark']))
  })

  it('installs exact token/rule preset selections and reports dependencies', () => {
    const open = createSystem().addPlugin(hail({
      presets: {
        mode: 'opt-in',
        listed: ['palette', 'roles', 'sizes', 'breakpoints', 'icons', 'reset', 'theming'],
      },
    }))
    const ds = open.consolidate({ prefix: 'hail' })
    expect(ds.t.color.palette.accent.$path).toBe('color.palette.accent')
    expect(ds.t.text.body.$dec).toMatchObject({
      fontSize: expect.anything(),
      lineHeight: expect.anything(),
      fontWeight: expect.anything(),
    })
    expect(ds.introspect().ruleGroups).toHaveProperty('hailReset')
    expect(ds.introspect().ruleGroups).toHaveProperty('hailTheming')
    expect(ds.introspect().ruleGroups).not.toHaveProperty('hailMotion')
    expect(ds.introspect().plugins).toHaveProperty('org.vanity.hail')
    expect(ds.introspect().constructors.oklchx.owner).toEqual({
      kind: 'plugin',
      id: 'plugin:org.vanity.hail',
    })

    expect(() => hail({
      presets: { mode: 'opt-in', listed: ['roles'] },
    })).not.toThrow()
    expect(() => createSystem().addPlugin(hail({
      presets: { mode: 'opt-in', listed: ['roles'] },
    }))).toThrow(/roles.*requires.*palette/)
  })

  it('keeps every preset independently selectable and implements exact opt-out', () => {
    const tokenPresets = {
      palette: 'color.palette.accent',
      sizes: 'size.1p',
      breakpoints: 'breakpoint.compact',
      icons: 'icon.size',
    } as const
    for (const name of ['palette', 'sizes', 'breakpoints', 'icons'] as const) {
      const ds = createSystem().addPlugin(hail({
        presets: { mode: 'opt-in', listed: [name] },
      })).consolidate({ prefix: `hail-${name}` })
      expect(ds.introspect().tokens).toHaveProperty(tokenPresets[name])
    }

    const rulePresets = {
      reset: 'hailReset',
      motion: 'hailMotion',
    } as const
    for (const name of ['reset', 'motion'] as const) {
      const ds = createSystem().addPlugin(hail({
        presets: { mode: 'opt-in', listed: [name] },
      })).consolidate({ prefix: `hail-${name}` })
      expect(ds.introspect().ruleGroups).toHaveProperty(rulePresets[name])
      if (name === 'motion') {
        const { css } = emit(() => ds.class({ color: 'currentcolor' }, 'motion-evidence'))
        expect(css).toContain('@media (prefers-reduced-motion: reduce)')
        expect(css).toContain('animation-duration: 0.01ms')
      }
    }

    const withoutMotion = createSystem().addPlugin(hail({
      presets: { mode: 'opt-out', listed: ['motion'] },
    })).consolidate({ prefix: 'hail-opt-out' })
    expect(withoutMotion.introspect().ruleGroups).not.toHaveProperty('hailMotion')
    expect(withoutMotion.introspect().ruleGroups).toHaveProperty('hailReset')
    expect(withoutMotion.introspect().ruleGroups).toHaveProperty('hailTheming')
    expect(withoutMotion.t.color).toHaveProperty('palette')
    expect(withoutMotion.t.color).toHaveProperty('brand')
  })

  it('reuses a compatible host scheme axis and rejects an incompatible one', () => {
    const open = createSystem()
      .addAxis('scheme', ['light', 'dark'])
      .addPlugin(hail({ color: { elevation: true } }))
    expect(Object.keys(open.axes)).toEqual(['scheme'])
    expect(open.consolidate().serialize(open.oklchx.inE(0.2, 0.1, 30)))
      .toContain('var(--vanity-hail-most-elevated-l)')

    expect(() => createSystem()
      .addAxis('scheme', ['day', 'night'])
      .addPlugin(hail({ color: { elevation: true } })))
      .toThrow(/scheme\.light.*missing/)
  })

  it('validates option invariants with precise Hail diagnostics', () => {
    expect(() => createSystem().addPlugin(hail({ color: { ranges: { h: [20, 20] } } })))
      .toThrow(/ranges\.h.*distinct/)
    expect(() => createSystem().addPlugin(hail({ color: { ranges: { l: [1, 0] } } })))
      .toThrow(/ranges\.l.*ordered/)
    expect(() => createSystem().addPlugin(hail({
      color: { markers: { span: 'same', exact: 'same' } },
    } as HailOptions)))
      .toThrow(/cannot share/)
    expect(() => createSystem().addPlugin(hail({ color: { markers: { span: 'size' } } })))
      .toThrow(/collides/)
  })
})
