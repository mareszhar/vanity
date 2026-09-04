import { VANITY_CSS_CAPABILITIES } from '@mszr/vanity/capabilities'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import {
  alpha,
  angle,
  calc,
  clamp,
  color,
  createCssValueSerializer,
  number as cssNumber,
  customProperty,
  defineCssOperation,
  defineCssSupportTarget,
  defineCssValue,
  defineTokens,
  hwb,
  length,
  max,
  min,
  mix,
  oklch,
  percent,
  rawValue,
} from '../index'
import { resolvePolicies } from '../system/policies'
import { createFixtureSystem } from '../test-support/system'
import { getTokenModule } from '../tokens/builder'
import { resolveTokenModule } from '../tokens/resolve'
import { defaultValueKernel } from './defaults'
import { serializeValueWithContext } from './kernel'
import { getNode, VANITY_DEFAULT_CSS_SUPPORT } from './protocol'

function serialize(value: import('./types').VanitySelfValue): string {
  return serializeValueWithContext({
    values: defaultValueKernel,
    policies: resolvePolicies({ support: VANITY_DEFAULT_CSS_SUPPORT }),
  }, value)
}

describe('the shared CSS value IR', () => {
  it('constructs the minimum unit families without making raw CSS verbose', () => {
    expect(length.px(8).css).toBe('8px')
    expect(length(8).css).toBe('8px')
    expect(length.rem(1.25).css).toBe('1.25rem')
    expect(angle.turn(0.5).css).toBe('0.5turn')
    expect(percent(58).css).toBe('58%')
    expect(cssNumber(-0).css).toBe('0')
  })

  it('preserves typed future syntax and rejects only broad token-safety failures', () => {
    expect(rawValue.length('anchor-size(width)').css).toBe('anchor-size(width)')
    expect(rawValue.color('future-color(from #123 magic)').css).toBe('future-color(from #123 magic)')
    expect(rawValue.unknown('future(/* ) */ value)').css).toBe('future(/* ) */ value)')
    expect(() => rawValue.length('anchor-size(width')).toThrow(/unmatched/)
    expect(() => rawValue.unknown('future(/*')).toThrow(/unterminated comment/)
    expect(() => rawValue.unknown('')).toThrow(/cannot be empty/)

    const raw = getNode(rawValue.length('anchor-size(width)'))
    expect(raw).toMatchObject({ kind: 'raw', type: 'length', source: { helper: 'rawValue.length' } })
    expect(raw.fold?.({ serialize: {} as never })).toEqual({ kind: 'preserve', reason: 'raw-or-unknown' })
  })

  it('models external custom properties as typed, fallback-aware dependencies', () => {
    const gap = customProperty('--library-gap', { type: 'length' })
    const reference = gap.$var(length.rem(1))

    expect(gap.$name).toBe('--library-gap')
    expect(reference.css).toBe('var(--library-gap, 1rem)')
    expect(getNode(reference)).toMatchObject({
      kind: 'var',
      type: 'length',
      dependencies: [{ kind: 'custom-property', name: '--library-gap', type: 'length' }],
    })
    expect(() => gap.$var(angle.deg(2) as never)).toThrow(/<angle>.*<length>/)
    expect(() => customProperty('--')).toThrow(/valid CSS custom-property name/)
    expect(customProperty('--1').$name).toBe('--1')
    expect(customProperty('--mystery\\?').$name).toBe('--mystery\\?')
    expect(() => customProperty('--mystery?' as `--${string}`)).toThrow(/valid CSS custom-property name/)
  })

  it('accepts typed expressions in individual color channels', () => {
    const chroma = customProperty('--brand-chroma', { type: 'number' })
    const value = oklch(percent(58), chroma.$var(cssNumber(0.2)), angle.deg(285), 0.5)

    expect(serialize(value)).toBe('oklch(58% var(--brand-chroma, 0.2) 285deg / 0.5)')
    expect(serialize(hwb(45, 'none', percent(20)))).toBe('hwb(45 none 20%)')
    expect(() => (oklch as any)(length.px(10), 0.2, 285)).toThrow(/<length>.*numeric color component/)
    expect(() => (oklch as any)(0.5, 0.2, percent(50))).toThrow(/<percentage>.*hue color component/)

    const { returned: tokens } = emit(() => resolveTokenModule(getTokenModule(defineTokens({
      channel: { lightness: 0.6, chroma: 0.18, hue: 285 },
    }))!))
    const resolved = tokens as any
    expect(serialize(oklch(resolved.channel.lightness, resolved.channel.chroma, resolved.channel.hue)))
      .toBe('oklch(var(--vanity-channel-lightness) var(--vanity-channel-chroma) var(--vanity-channel-hue))')
  })

  it('keeps interpolation space and hue policy only on interpolation results', () => {
    const mixed = mix('#f00', '#00f', 0.35).in('oklch', { hue: 'longer' })
    expect(serialize(mixed)).toMatch(/^color-mix\(in oklch longer hue, oklch\(.+\), oklch\(.+\) 35%\)$/)
    expect('in' in oklch(0.5, 0.2, 30)).toBe(false)
    expect(() => (mix('#f00', '#00f', 0.5) as any).in('srgb', { hue: 'shorter' })).toThrow(/no hue interpolation path/)
  })

  it('propagates CSS dimensions across comparisons and typed arithmetic', () => {
    expect(min('10px').css).toBe('min(10px)')
    expect(max('10px', '5%').dimension).toBe('length-percentage')
    expect(clamp('1rem', '5vw', '8rem').dimension).toBe('length')
    expect(calc('10px').multiply('2px').css).toBe('calc(10px * 2px)')
    expect(calc('10px').divide('2px').dimension).toBe('number')
    expect(() => (min as any)('1s', '2px')).toThrow(/time and length/)
  })

  it('folds closed numeric subtrees without erasing a live reference', () => {
    const live = customProperty('--live-scale', { type: 'number' }).$var(cssNumber(0.5))
    const closed = calc(1).subtract(calc(0.3).add(0.4)).multiply(2)
    const serialized = serialize(calc(live).add(closed))

    expect(serialized).toBe('calc(var(--live-scale, 0.5) + 0.6)')
    expect(serialized).not.toContain('calc(0.3 + 0.4)')
    expect(serialized).not.toContain('[object Object]')
  })

  it('diagnoses feature requirements against an explicit project target', () => {
    const restricted = defineCssSupportTarget({ id: 'no-calc', features: [] })
    expect('add' in restricted.features).toBe(false)
    const serialize = createCssValueSerializer(restricted).serialize
    expect(() => serialize(calc('1rem').add('2px'))).toThrow(/calc-basic.*no-calc.*fallback/)

    const colorOnly = createCssValueSerializer(defineCssSupportTarget({
      id: 'color-without-relative-syntax',
      features: ['color-level-4', 'custom-properties'],
    })).serialize
    expect(colorOnly(alpha(oklch(0.5, 0.2, 20), 0.5))).toBe('oklch(0.5 0.2 20 / 0.5)')
    const channel = customProperty('--live-lightness', { type: 'number' }).$var()
    expect(() => colorOnly(alpha(oklch(channel, 0.2, 20), 0.5))).toThrow(/relative-color.*color-without-relative-syntax/)
    expect(() => colorOnly(color('display-p3-linear', 0.1, 0.2, 0.3))).toThrow(/color-level-5/)
  })

  it('dogfoods public lowering and opaque extension contracts', () => {
    const doublePx = defineCssValue({
      type: 'length',
      create(value: number) {
        return length.px(value * 2)
      },
    })
    expect(doublePx(4).css).toBe('8px')

    const editorial = defineCssOperation({
      inputs: ['length', 'number'],
      output: 'length',
      extension: { id: 'com.example.editorial', version: 1 },
      serialize(context, measure, ratio) {
        return `editorial-measure(${context.serialize(measure)}, ${context.serialize(ratio)})`
      },
    })
    expect(editorial(length.rem(40), cssNumber(1.2)).css).toBe('editorial-measure(40rem, 1.2)')

    const invalid = defineCssValue({
      type: 'length',
      create() {
        return { serialize: () => 'opaque()' }
      },
    })
    expect(() => invalid()).toThrow(/anonymous.*opaque serialization/)
  })

  it('publishes capability and maturity facts as data', () => {
    expect(VANITY_CSS_CAPABILITIES.oklch).toMatchObject({ maturity: 'stable', requirements: ['color-level-4'] })
    expect(VANITY_CSS_CAPABILITIES.contrastColor).toMatchObject({ maturity: 'experimental', fold: 'fallback-plus-enhancement' })
  })

  it('uses one value protocol across tokens, rules, ports, atoms, and keyframes', () => {
    const { css, returned } = emit(() => {
      const system = createFixtureSystem({ tokens: { space: { control: length.rem(2) } } })
      const runtimeGap = system.port(length.px(12))
      const className = system.class(
        { padding: length.rem(2), margin: calc(length.px(8)).add(length.px(4)) },
        'valueRule',
      )
      const animation = system.keyframes(
        { from: { padding: length.px(0) }, to: { padding: length.px(8) } },
        'valueAnimation',
      )
      const atoms = system.atoms({ properties: { gap: { compact: length.px(8) } } }, 'valueAtoms')
      return {
        animation,
        atomClass: atoms({ gap: 'compact' }),
        className,
        runtimeGap,
        token: system.t.space.control,
      }
    })

    expect(returned.token.$val).toBe('2rem')
    expect(returned.runtimeGap.defaultValue).toBe('12px')
    expect(returned.runtimeGap.dec('16px')).toEqual({ [returned.runtimeGap.name]: '16px' })
    expect(returned.className).toMatch(/valueRule__/)
    expect(returned.animation).toMatch(/valueAnimation__/)
    expect(returned.atomClass).toMatch(/valueAtoms_gap_compact__/)
    expect(css).toContain('padding: 2rem')
    expect(css).toContain('margin: calc(8px + 4px)')
    expect(css).toContain('padding: 8px')
    expect(css).toContain('gap: 8px')
  })
})
