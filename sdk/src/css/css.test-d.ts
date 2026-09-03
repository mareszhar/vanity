/**
 * The type-shape evidence dimension: system inference — inline tokens bind, condition and
 * layer names flow as literals, both nesting directions type, and every
 * unknown key dies at the cursor ([patterns.md §2]).
 */

import type { VanityColorTokenHandle } from '@mszr/vanity'
import { createSystem, defineTokens, media, oklch } from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

// Never evaluated — the typecheck evidence dimension only reads types.
function system() {
  const open = createSystem()
    .addConditions({
      open: '&[data-state="open"]',
      md: media('(min-width: 768px)'),
    })
  return open.addTokens({
    color: { brand: open.tdef({ val: oklch(0.58, 0.2, 285), mutable: true }) },
    space: { md: '16px' },
  }).consolidate()
}

describe('createSystem inference', () => {
  it('inline tokens bind and come back typed', () => {
    const { t } = system()

    expectTypeOf(t.color.brand).toExtend<VanityColorTokenHandle>()
    expectTypeOf(t.space.md.$val).toEqualTypeOf<'16px'>()
  })

  it('a defineTokens result passes through untouched', () => {
    const module = defineTokens({ radius: { sm: '4px' } })
    const bound = createSystem().addTokens(module).consolidate({ prefix: 'prism' })

    expectTypeOf(bound.tokensOf(module).radius).toEqualTypeOf<typeof bound.t.radius>()
    expectTypeOf(bound.t.radius.sm.$name).toEqualTypeOf<'--prism-radius-sm'>()
  })

  it('a condition name colliding with a CSS property is refused at the key', () => {
    void createSystem().addConditions({ color: '&[data-color]' })
  })
})

describe('class() typing', () => {
  it('accepts the spec card: both directions, selectors, at-rules, layers', () => {
    const { class: style, t } = system()

    void style({
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
    const { class: style } = system()

    // @ts-expect-error — unknown property
    void style({ paddin: 8 })
    // @ts-expect-error — unknown condition as a bare key
    void style({ hovr: { padding: 8 } })
    // @ts-expect-error — unknown condition inside a property-first map
    void style({ color: { hovr: 'red' } })
    // @ts-expect-error — undeclared layer
    void style.layer('overides')({})
    // @ts-expect-error — a value that is not CSS
    void style({ padding: { nested: { deeper: 8 } } })
  })

  it('interpolated class references type as computed selector keys', () => {
    const { class: style } = system()
    const button = style({ display: 'inline-flex' })

    void style({
      display: 'flex',
      [`${button} + ${button}`]: { marginInlineStart: 0 },
      [`& ${button}`]: { borderRadius: 0 },
    })
  })

  it('base conditions are typed in; opting out removes them', () => {
    const withBase = system()
    void withBase.class({ hover: { opacity: 0.9 }, dark: { borderColor: 'white' } })

    const bare = createSystem().consolidate({ baseConditions: false })
    // @ts-expect-error — no base conditions to speak of
    void bare.class({ hover: { opacity: 0.9 } })
  })

  it('custom layers replace the default order in the layer key', () => {
    const custom = createSystem().consolidate({ layerOrder: ['base', 'app'] as const })

    void custom.class.layer('app')({})
    // @ts-expect-error — 'overrides' is not declared by this system
    void custom.class.layer('overrides')({})
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
