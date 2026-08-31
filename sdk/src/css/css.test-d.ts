/**
 * The type-shape evidence dimension: system inference — inline tokens bind, condition and
 * layer names flow as literals, both nesting directions type, and every
 * unknown key dies at the cursor ([patterns.md §2]).
 */

import type { VanityColorTokenHandle } from '@test/legacy'
import { createEngine } from '@test/legacy'
import { describe, expectTypeOf, it } from 'vitest'

const de = createEngine()

// Never evaluated — the typecheck evidence dimension only reads types.
function system() {
  return de.createSystem({
    tokens: {
      color: { brand: de.token({ val: de.oklch(0.58, 0.2, 285), mutable: true }) },
      space: { md: '16px' },
    },
    conditions: {
      open: '&[data-state="open"]',
      md: de.media('(min-width: 768px)'),
    },
  })
}

describe('createSystem inference', () => {
  it('inline tokens bind and come back typed', () => {
    const { t } = system()

    expectTypeOf(t.color.brand).toExtend<VanityColorTokenHandle>()
    expectTypeOf(t.space.md.$val).toEqualTypeOf<'16px'>()
  })

  it('a defineTokens result passes through untouched', () => {
    const module = de.defineTokens({ radius: { sm: '4px' } })
    const bound = de.createSystem({ tokens: module, prefix: 'prism' })

    expectTypeOf(bound.tokensOf(module).radius).toEqualTypeOf<typeof bound.t.radius>()
    expectTypeOf(bound.t.radius.sm.$name).toEqualTypeOf<'--prism-radius-sm'>()
  })

  it('a condition name colliding with a CSS property is refused at the key', () => {
    void de.createSystem({
      tokens: {},
      // @ts-expect-error — 'color' is a CSS property; bare keys must never blur
      conditions: { color: '&[data-color]' },
    })
  })

  it('the bound token override accepts overrides for the bound graph only', () => {
    const { tokenOverride } = system()

    tokenOverride({ color: { brand: de.oklch(0.4, 0.1, 100) } })
    // @ts-expect-error — unknown tokens die at the cursor
    tokenOverride({ color: { brandy: '#fff' } })
  })
})

describe('css() typing', () => {
  it('accepts the spec card: both directions, selectors, at-rules, layers', () => {
    const { css, t } = system()

    void css({
      'padding': t.space.md,
      'background': t.color.brand,
      'open': { motionOk: { animationDuration: '200ms' } },
      'md': { padding: 8 },
      'color': { base: 'black', hover: t.color.brand },
      '&:has(> img:first-child)': { paddingTop: 0 },
      '@supports (view-transition-name: none)': { viewTransitionName: 'card' },
      '@starting-style': { opacity: 0 },
      '--track-size': 8,
    })
  })

  it('unknown properties, conditions, and layers die at the offending key', () => {
    const { css } = system()

    // @ts-expect-error — unknown property
    void css({ paddin: 8 })
    // @ts-expect-error — unknown condition as a bare key
    void css({ hovr: { padding: 8 } })
    // @ts-expect-error — unknown condition inside a property-first map
    void css({ color: { hovr: 'red' } })
    // @ts-expect-error — undeclared layer
    void css.layer('overides')({})
    // @ts-expect-error — a value that is not CSS
    void css({ padding: { nested: { deeper: 8 } } })
  })

  it('interpolated class references type as computed selector keys', () => {
    const { css } = system()
    const button = css({ display: 'inline-flex' })

    void css({
      display: 'flex',
      [`${button} + ${button}`]: { marginInlineStart: 0 },
      [`& ${button}`]: { borderRadius: 0 },
    })
  })

  it('base conditions are typed in; opting out removes them', () => {
    const withBase = system()
    void withBase.css({ hover: { opacity: 0.9 }, dark: { borderColor: 'white' } })

    const bare = de.createSystem({ tokens: {}, baseConditions: false })
    // @ts-expect-error — no base conditions to speak of
    void bare.css({ hover: { opacity: 0.9 } })
  })

  it('custom layers replace the default order in the layer key', () => {
    const custom = de.createSystem({ tokens: {}, layerOrder: ['base', 'app'] })

    void custom.css.layer('app')({})
    // @ts-expect-error — 'overrides' is not declared by this system
    void custom.css.layer('overrides')({})
  })
})

describe('keyframes typing', () => {
  it('steps are declaration-only; conditions are refused at the key', () => {
    const { keyframes } = system()

    void keyframes({ 'from': { opacity: 0 }, '50%': { opacity: 0.5 }, 'to': { opacity: 1 } })

    // @ts-expect-error — a condition inside a step is meaningless
    void keyframes({ from: { hover: { opacity: 0 } } })
    // @ts-expect-error — steps are times, not states
    void keyframes({ hover: { opacity: 0 } })
  })
})
