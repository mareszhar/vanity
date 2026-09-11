/**
 * Minimal cases derived from normative CSSWG grammar and the WPTs linked by
 * those specs. These are provenance anchors, not a forked CSS parser.
 *
 * - CSS Color 4 §§4.4, 5, 7–10 and color-computed-lab.html
 *   https://www.w3.org/TR/css-color-4/
 * - CSS Color 5 §§3, 9, 11 and color-mix-percents-01/02.html
 *   https://www.w3.org/TR/css-color-5/
 * - CSS Values 4 §10.2 comparison functions
 *   https://www.w3.org/TR/css-values-4/#comp-func
 */

import type { VanityAuthoredColor, VanityColorish, VanityPolarColorSpace } from '../tokens/types'
import { converter, parse as parseCssColor } from 'culori'
import { describe, expect, it } from 'vitest'
import {
  alpha,
  angle,
  clamp,
  color,
  colorMix,
  createSystem,
  number as cssNumber,
  customProperty,
  hsl,
  hwb,
  lab,
  lch,
  length,
  max,
  min,
  oklab,
  oklch,
  percent,
  rgb,
} from '../index'
import { resolvePolicies } from '../system/policies'
import {
  COLOR_RELATIVE_CHANNEL_FOLD_GAMUTS,
  COLOR_RELATIVE_CHANNEL_FOLD_RANGES,
  COLOR_RELATIVE_CHANNEL_FOLD_SCALES,
  COLOR_SRGB_GAMUT_EPSILON,
} from '../tokens/math'
import { defaultValueKernel } from './defaults'
import { serializeValueWithContext } from './kernel'
import { VANITY_DEFAULT_CSS_SUPPORT } from './protocol'

function serialize(value: import('./types').VanitySelfValue): string {
  return serializeValueWithContext({
    values: defaultValueKernel,
    policies: resolvePolicies({ support: VANITY_DEFAULT_CSS_SUPPORT }),
  }, value)
}

function readFoldedChannel(
  css: string,
  space: keyof typeof COLOR_RELATIVE_CHANNEL_FOLD_SCALES,
  channel: 'l' | 'c' | 'h' | 's',
): number {
  const parsed = parseCssColor(css)
  if (!parsed)
    throw new Error(`could not parse folded ${space} color: ${css}`)
  const converted = converter(space)(parsed) as unknown as Readonly<Record<string, number | undefined>>
  const value = converted[channel]
  if (value === undefined)
    throw new Error(`folded ${space} color has no ${channel} channel: ${css}`)
  return value
}

type ColorFoldGamut = 'in' | 'out'

/** One representative in/out pair for every static color space accepted here. */
const COLOR_FOLD_ORIGINS = {
  'srgb': {
    in: color('rgb(10 20 30)'),
    out: color('rgb(300 -10 30)'),
  },
  'hsl': {
    in: color('hsl(200 50% 50%)'),
    out: color('hsl(200 150% 50%)'),
  },
  'hwb': {
    in: color('hwb(200 20% 30%)'),
    out: color('hwb(200 -20% -10%)'),
  },
  'lab': {
    in: color('lab(50 20 30)'),
    out: color('lab(60 90 70)'),
  },
  'lch': {
    in: color('lch(50 20 30)'),
    out: color('lch(50 150 30)'),
  },
  'oklab': {
    in: color('oklab(0.5 0.1 0.1)'),
    out: color('oklab(0.7 0.35 0.3)'),
  },
  'oklch': {
    in: color('oklch(0.5 0.1 30)'),
    out: color('oklch(0.7 0.35 30)'),
  },
  'display-p3': {
    in: color('display-p3', 0.5, 0.1, 0.1),
    out: color('display-p3', 1, 0, 0),
  },
  'srgb-linear': {
    in: color('srgb-linear', 0.5, 0.5, 0.5),
    out: color('srgb-linear', 1.2, -0.1, 0.1),
  },
  'a98-rgb': {
    in: color('a98-rgb', 0.5, 0.5, 0.5),
    out: color('a98-rgb', 1, 0, 0),
  },
  'prophoto-rgb': {
    in: color('prophoto-rgb', 0.5, 0.5, 0.5),
    out: color('prophoto-rgb', 1, 0, 0),
  },
  'rec2020': {
    in: color('rec2020', 0.5, 0.5, 0.5),
    out: color('rec2020', 0.9, 0.1, 0.1),
  },
  'xyz-d65': {
    in: color('xyz-d65', 0.5, 0.5, 0.5),
    out: color('xyz-d65', 1.2, -0.1, 0.1),
  },
} satisfies Readonly<Record<string, Readonly<Record<ColorFoldGamut, VanityColorish>>>>

const COLOR_FOLD_OPERATION_SPACES = Object.keys(COLOR_RELATIVE_CHANNEL_FOLD_GAMUTS) as VanityPolarColorSpace[]

const COLOR_FOLD_OPERATIONS: Readonly<Record<VanityPolarColorSpace, (input: VanityColorish) => VanityAuthoredColor>> = {
  hsl: input => hsl.rotate(input, 30),
  hwb: input => hwb.rotate(input, 30),
  lch: input => lch.rotate(input, 30),
  oklch: input => oklch.rotate(input, 30),
}

/** The conformance table is generated from the complete origin/target domain. */
const COLOR_FOLD_MATRIX = Object.entries(COLOR_FOLD_ORIGINS).flatMap(([originSpace, origins]) =>
  COLOR_FOLD_OPERATION_SPACES.flatMap(operationSpace =>
    originSpace === operationSpace
      ? []
      : (['in', 'out'] as const).map(gamut => ({
          gamut,
          operationSpace,
          originSpace,
          value: origins[gamut],
        }))),
)

function isInSrgbGamut(css: string): boolean {
  const parsed = parseCssColor(css)
  if (!parsed)
    throw new Error(`could not parse color used for gamut classification: ${css}`)
  const converted = converter('rgb')(parsed) as unknown as Readonly<Record<'r' | 'g' | 'b', number | undefined>>
  return (['r', 'g', 'b'] as const).every((channel) => {
    const value = converted[channel]
    return value !== undefined
      && Number.isFinite(value)
      && value >= -COLOR_SRGB_GAMUT_EPSILON
      && value <= 1 + COLOR_SRGB_GAMUT_EPSILON
  })
}

function expectFoldedChannelsInRange(css: string, space: VanityPolarColorSpace): void {
  const parsed = parseCssColor(css)
  if (!parsed)
    throw new Error(`could not parse folded ${space} color: ${css}`)
  const converted = converter(space)(parsed) as unknown as Readonly<Record<string, number | undefined>>
  for (const [channel, range] of Object.entries(COLOR_RELATIVE_CHANNEL_FOLD_RANGES[space])) {
    const value = converted[channel]
    if (value === undefined)
      throw new Error(`folded ${space} color has no ${channel} channel: ${css}`)
    const cssValue = ['s', 'l', 'w', 'b'].includes(channel) ? value * 100 : value
    expect(cssValue, `${space}.${channel} folded range`).toBeGreaterThanOrEqual(range[0])
    expect(cssValue, `${space}.${channel} folded range`).toBeLessThanOrEqual(range[1])
  }
}

describe('cSSWG/WPT-derived value grammar', () => {
  it('covers modern color channels, missing components, alpha, and typed refs', () => {
    const channel = customProperty('--channel', { type: 'number' }).$var(cssNumber(0.2))
    expect(serialize(rgb(percent(10), channel, 'none', percent(50))))
      .toBe('rgb(10% var(--channel, 0.2) none / 50%)')
    expect(serialize(hsl(angle.deg(30), percent(40), percent(50), 'none')))
      .toBe('hsl(30deg 40% 50% / none)')
    expect(serialize(hwb(30, 'none', percent(10))))
      .toBe('hwb(30 none 10%)')
    expect(serialize(oklch(percent(42.1), 0.192, angle.deg(328.6), 1)))
      .toBe('oklch(42.1% 0.192 328.6deg)')
  })

  it('covers predefined and custom-profile color() channel counts', () => {
    expect(serialize(color('display-p3-linear', 0.1, 0.2, 0.3)))
      .toBe('color(display-p3-linear 0.1 0.2 0.3)')
    expect(serialize(color('--press-profile', [0.1, 0.2, 0.3, 0.4], { alpha: percent(80) })))
      .toBe('color(--press-profile 0.1 0.2 0.3 0.4 / 80%)')
  })

  it('covers the exact two-item color-mix() grammar and interpolation policy', () => {
    expect(serialize(colorMix(['red', 'blue']).in('oklch')))
      .toBe('color-mix(in oklch, red, blue)')
    expect(serialize(colorMix(['red', ['green', 25]]).in('oklch', { hue: 'longer' })))
      .toBe('color-mix(in oklch longer hue, red, green 25%)')
    expect(serialize(colorMix(['red', 'blue']).in('--brand-profile')))
      .toMatch(/^color-mix\(in --brand-profile, /)
    expect(() => (colorMix(['red', 'blue']).in as any)('lab', { hue: 'shorter' })).toThrow(/no hue interpolation path/)
    expect(() => colorMix(['red'] as any)).toThrow(/exactly two color items/)
    expect(() => colorMix(['red', ['blue', 101]] as any)).toThrow(/between 0 and 100/)
    expect(serialize(color('red').mix('blue', 35).in('oklab')))
      .toMatch(/^oklch\(/)
    expect(() => serialize(colorMix(['red', 'blue']) as any))
      .toThrow(/needs an interpolation space/)

    const percentage = customProperty('--mix-percentage', { type: 'percentage' }).$var(percent(25))
    expect(serialize(colorMix(['red', ['blue', percentage]]).in('srgb')))
      .toBe('color-mix(in srgb, red, blue var(--mix-percentage, 25%))')
    expect(serialize(colorMix([['red', 25], ['blue', 75]]).in('oklab')))
      .toMatch(/^oklch\(/)

    const omitted = serialize(colorMix(['red', ['blue', 25]]).in('oklab'))
    const explicit = serialize(colorMix([['red', 75], ['blue', 25]]).in('oklab'))
    expect(omitted).toBe(explicit)
    expect(serialize(colorMix([['red', 40], ['blue', 40]]).in('oklab')))
      .toBe('color-mix(in oklab, red 40%, blue 40%)')
    expect(() => colorMix([['red', 0], ['blue', 0]])).toThrow(/sum to 0/)
  })

  it('keeps channel-adjust sugar in its named polar color space', () => {
    const source = 'red'

    expect(serialize(hsl.lighten(source, 0.1)))
      .toBe('hsl(0 100% 50.1%)')
    expect(serialize(hsl.saturate(source, 0.1)))
      .toBe('hsl(0 100.1% 50%)')
    expect(serialize(lch.saturate(source, 0.1)))
      .toBe('lch(54.2905 106.9372 40.8577)')
    expect(serialize(hwb.rotate(source, 30)))
      .toBe('hwb(30 0% 0%)')
    expect(serialize(hsl.lighten(hsl(200, 50, 50), 0.1)))
      .toBe('hsl(200 50% 50.1%)')
    expect(serialize(oklch.lighten(color('display-p3', 0.5, 0.1, 0.1), 0.1)))
      .toBe('oklch(0.504 0.161 25.7767)')
    expect(serialize(alpha(hsl(200, 50, 50), 0.2)))
      .toBe('hsl(200 50% 50% / 0.2)')

    expect('alpha' in hwb).toBe(false)
    expect('lighten' in hwb).toBe(false)
    expect('darken' in hwb).toBe(false)
    expect('saturate' in hwb).toBe(false)
    expect('desaturate' in hwb).toBe(false)
    expect('rotate' in hwb).toBe(true)
  })

  it('folds every supported adjustment channel in CSS relative units', () => {
    const open = createSystem()
    const ds = open.addTokens({
      oklchL: open.tdef({ val: open.oklch(0.1, 0, 0) }),
      oklchC: open.tdef({ val: open.oklch(0.5, 0.1, 0) }),
      oklchH: open.tdef({ val: open.oklch(0.5, 0.1, 20) }),
      oklchDarken: open.tdef({ val: open.oklch(0.5, 0.1, 0) }),
      lchL: open.tdef({ val: open.lch(10, 20, 30) }),
      lchC: open.tdef({ val: open.lch(50, 20, 30) }),
      lchH: open.tdef({ val: open.lch(50, 20, 30) }),
      hslL: open.tdef({ val: open.hsl(200, 50, 50) }),
      hslS: open.tdef({ val: open.hsl(200, 50, 50) }),
      hslH: open.tdef({ val: open.hsl(200, 50, 50) }),
      hwbH: open.tdef({ val: open.hwb(200, 20, 30) }),
      crossBlue: open.tdef({ val: open.color('blue') }),
      crossHex: open.tdef({ val: open.color('#3366ff') }),
      crossHsl: open.tdef({ val: open.hsl(200, 50, 50) }),
      crossP3: open.tdef({ val: open.color('display-p3', 1, 0, 0) }),
      crossRgb: open.tdef({ val: open.rgb(10, 20, 30) }),
    })
      .consolidate({ prefix: 'adjustments' })
    const cases = [
      {
        space: 'oklch',
        channel: 'l',
        amount: 0.2,
        operator: '+',
        origin: serialize(oklch(0.1, 0, 0)),
        folded: serialize(oklch.lighten(oklch(0.1, 0, 0), 0.2)),
        live: ds.serialize(ds.oklch.lighten(ds.t.oklchL, 0.2)),
      },
      {
        space: 'oklch',
        channel: 'c',
        amount: 0.2,
        operator: '+',
        origin: serialize(oklch(0.5, 0.1, 0)),
        folded: serialize(oklch.saturate(oklch(0.5, 0.1, 0), 0.2)),
        live: ds.serialize(ds.oklch.saturate(ds.t.oklchC, 0.2)),
      },
      {
        space: 'oklch',
        channel: 'h',
        amount: 30,
        operator: '+',
        origin: serialize(oklch(0.5, 0.1, 20)),
        folded: serialize(oklch.rotate(oklch(0.5, 0.1, 20), 30)),
        live: ds.serialize(ds.oklch.rotate(ds.t.oklchH, 30)),
      },
      {
        space: 'oklch',
        channel: 'l',
        amount: 0.2,
        operator: '-',
        origin: serialize(oklch(0.5, 0.1, 0)),
        folded: serialize(oklch.darken(oklch(0.5, 0.1, 0), 0.2)),
        live: ds.serialize(ds.oklch.darken(ds.t.oklchDarken, 0.2)),
      },
      {
        space: 'lch',
        channel: 'l',
        amount: 0.2,
        operator: '+',
        origin: serialize(lch(10, 20, 30)),
        folded: serialize(lch.lighten(lch(10, 20, 30), 0.2)),
        live: ds.serialize(ds.lch.lighten(ds.t.lchL, 0.2)),
      },
      {
        space: 'lch',
        channel: 'c',
        amount: 0.2,
        operator: '+',
        origin: serialize(lch(50, 20, 30)),
        folded: serialize(lch.saturate(lch(50, 20, 30), 0.2)),
        live: ds.serialize(ds.lch.saturate(ds.t.lchC, 0.2)),
      },
      {
        space: 'lch',
        channel: 'h',
        amount: 40,
        operator: '+',
        origin: serialize(lch(50, 20, 30)),
        folded: serialize(lch.rotate(lch(50, 20, 30), 40)),
        live: ds.serialize(ds.lch.rotate(ds.t.lchH, 40)),
      },
      {
        space: 'hsl',
        channel: 'l',
        amount: 0.1,
        operator: '+',
        origin: serialize(hsl(200, 50, 50)),
        folded: serialize(hsl.lighten(hsl(200, 50, 50), 0.1)),
        live: ds.serialize(ds.hsl.lighten(ds.t.hslL, 0.1)),
      },
      {
        space: 'hsl',
        channel: 's',
        amount: 0.1,
        operator: '+',
        origin: serialize(hsl(200, 50, 50)),
        folded: serialize(hsl.saturate(hsl(200, 50, 50), 0.1)),
        live: ds.serialize(ds.hsl.saturate(ds.t.hslS, 0.1)),
      },
      {
        space: 'hsl',
        channel: 'h',
        amount: 30,
        operator: '+',
        origin: serialize(hsl(200, 50, 50)),
        folded: serialize(hsl.rotate(hsl(200, 50, 50), 30)),
        live: ds.serialize(ds.hsl.rotate(ds.t.hslH, 30)),
      },
      {
        space: 'hsl',
        channel: 's',
        amount: 0.1,
        operator: '-',
        origin: serialize(hsl(200, 50, 50)),
        folded: serialize(hsl.desaturate(hsl(200, 50, 50), 0.1)),
        live: ds.serialize(ds.hsl.desaturate(ds.t.hslS, 0.1)),
      },
      {
        space: 'hwb',
        channel: 'h',
        amount: 30,
        operator: '+',
        origin: serialize(hwb(200, 20, 30)),
        folded: serialize(hwb.rotate(hwb(200, 20, 30), 30)),
        live: ds.serialize(ds.hwb.rotate(ds.t.hwbH, 30)),
      },
      {
        space: 'oklch',
        channel: 'l',
        amount: 0.1,
        operator: '+',
        crossSpace: true,
        origin: serialize(color('blue')),
        folded: serialize(oklch.lighten(color('blue'), 0.1)),
        live: ds.serialize(ds.oklch.lighten(ds.t.crossBlue, 0.1)),
      },
      {
        space: 'oklch',
        channel: 'l',
        amount: 0.1,
        operator: '+',
        crossSpace: true,
        origin: serialize(color('#3366ff')),
        folded: serialize(oklch.lighten(color('#3366ff'), 0.1)),
        live: ds.serialize(ds.oklch.lighten(ds.t.crossHex, 0.1)),
      },
      {
        space: 'oklch',
        channel: 'l',
        amount: 0.1,
        operator: '+',
        crossSpace: true,
        origin: serialize(hsl(200, 50, 50)),
        folded: serialize(oklch.lighten(hsl(200, 50, 50), 0.1)),
        live: ds.serialize(ds.oklch.lighten(ds.t.crossHsl, 0.1)),
      },
      {
        space: 'oklch',
        channel: 'l',
        amount: 0.1,
        operator: '+',
        crossSpace: true,
        origin: serialize(color('display-p3', 1, 0, 0)),
        folded: serialize(oklch.lighten(color('display-p3', 1, 0, 0), 0.1)),
        live: ds.serialize(ds.oklch.lighten(ds.t.crossP3, 0.1)),
      },
      {
        space: 'lch',
        channel: 'c',
        amount: 0.1,
        operator: '+',
        crossSpace: true,
        origin: serialize(rgb(10, 20, 30)),
        folded: serialize(lch.saturate(rgb(10, 20, 30), 0.1)),
        live: ds.serialize(ds.lch.saturate(ds.t.crossRgb, 0.1)),
      },
    ] as const

    for (const adjustment of cases) {
      const scale = COLOR_RELATIVE_CHANNEL_FOLD_SCALES[adjustment.space][adjustment.channel]
      if (scale === undefined)
        throw new Error(`missing fold scale for ${adjustment.space}.${adjustment.channel}`)
      const origin = readFoldedChannel(adjustment.origin, adjustment.space, adjustment.channel)
      const folded = readFoldedChannel(adjustment.folded, adjustment.space, adjustment.channel)
      const cssDelta = adjustment.operator === '+' ? adjustment.amount : -adjustment.amount
      expect((folded - origin) / scale, `${adjustment.space}.${adjustment.channel} fold`)
        .toBeCloseTo(cssDelta, 'crossSpace' in adjustment ? 3 : 10)
      expect(adjustment.folded).not.toMatch(/\.\d{6,}/)
      expect(adjustment.live, `${adjustment.space}.${adjustment.channel} live`).toContain(
        `calc(${adjustment.channel} ${adjustment.operator} `,
      )
    }

    const nested = serialize(hsl.lighten(oklch.lighten(hsl(200, 50, 50), 0.1), 0.1))
    expect(nested).toMatch(/^hsl\(/)
    expect(nested).not.toContain('from ')
    expect(nested).not.toContain('calc(')
  })

  it('folds the complete cross-space adjustment gamut matrix', () => {
    expect(COLOR_FOLD_MATRIX.length).toBeGreaterThan(0)

    for (const cell of COLOR_FOLD_MATRIX) {
      const originCss = serialize(cell.value)
      expect(isInSrgbGamut(originCss), `${cell.originSpace} ${cell.gamut} origin`).toBe(cell.gamut === 'in')

      const css = serialize(COLOR_FOLD_OPERATIONS[cell.operationSpace](cell.value))
      const label = `${cell.originSpace} → ${cell.operationSpace} (${cell.gamut})`
      const bounded = COLOR_RELATIVE_CHANNEL_FOLD_GAMUTS[cell.operationSpace] === 'srgb'
      const shouldStayLive = bounded && cell.gamut === 'out'

      if (shouldStayLive) {
        expect(css, label).toContain(`${cell.operationSpace}(from `)
        expect(css, label).toContain('calc(h + 30)')
      }
      else {
        expect(css, label).not.toContain('(from ')
        expect(css, label).not.toContain('calc(')
        if (bounded)
          expectFoldedChannelsInRange(css, cell.operationSpace)
      }
    }
  })

  it('keeps same-space overflow folded while guarding conversion overflow', () => {
    expect(serialize(hsl.lighten(hsl(200, 50, 99), 10))).toBe('hsl(200 50% 109%)')
    expect(serialize(oklch.lighten(oklch(0.98, 0.1, 200), 0.2))).toBe('oklch(1.18 0.1 200)')

    const crossSpace = serialize(hsl.rotate(color('display-p3', 1, 0, 0), 30))
    expect(crossSpace).toContain('hsl(from ')
    expect(crossSpace).toContain('calc(h + 30)')
  })

  it('uses conventional rgb() when alpha folds a parsed sRGB leaf', () => {
    expect(serialize(alpha('blue', 0.2))).toBe('rgb(0 0 255 / 0.2)')
    expect(serialize(alpha('#ff0000', 0.2))).toBe('rgb(255 0 0 / 0.2)')
    expect(serialize(alpha(rgb(1, 2, 3), 0.2))).toBe('rgb(1 2 3 / 0.2)')
    expect(serialize(alpha(hsl(200, 50, 50), 0.2))).toBe('hsl(200 50% 50% / 0.2)')
    expect(serialize(alpha(hwb(200, 20, 30), 0.2))).toBe('hwb(200 20% 30% / 0.2)')
    expect(serialize(alpha(lab(50, 20, 30), 0.2))).toBe('lab(50 20 30 / 0.2)')
    expect(serialize(alpha(lch(50, 20, 30), 0.2))).toBe('lch(50 20 30 / 0.2)')
    expect(serialize(alpha(oklab(0.5, 0.1, 0.2), 0.2))).toBe('oklab(0.5 0.1 0.2 / 0.2)')
    expect(serialize(alpha(oklch(0.5, 0.1, 30), 0.2))).toBe('oklch(0.5 0.1 30 / 0.2)')
    expect(serialize(alpha(color('display-p3', 1, 0, 0), 0.2)))
      .toBe('color(display-p3 1 0 0 / 0.2)')

    const open = createSystem()
    const ds = open.addTokens({
      seed: open.tdef({ val: open.color('blue') }),
    }).consolidate({ prefix: 'alpha' })
    expect(ds.serialize(ds.alpha(ds.t.seed, 0.2)))
      .toBe('oklch(from var(--alpha-seed) l c h / 0.2)')
    expect(ds.serialize(ds.t.seed.alpha(0.2)))
      .toBe('oklch(from var(--alpha-seed) l c h / 0.2)')
    expect(ds.serialize(ds.hsl.from(ds.t.seed, { alpha: 0.2 })))
      .toBe('hsl(from var(--alpha-seed) h s l / 0.2)')
  })

  it('covers one-or-more min/max and none-sided clamp grammar', () => {
    expect(min(length.rem(2)).css).toBe('min(2rem)')
    expect(max(length.px(20), percent(50)).dimension).toBe('length-percentage')
    expect(clamp(length.px(12), length.vw(10), 'none').css).toBe('clamp(12px, 10vw, none)')
    expect(clamp('none', length.vw(10), length.px(100)).dimension).toBe('length')
  })
})
