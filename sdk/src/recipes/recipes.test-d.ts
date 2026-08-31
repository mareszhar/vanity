/**
 * The type-shape evidence dimension: the call-site law — strict on literals, permissive on
 * widened props ([spec-recipes.md §4]) — `VanityProps` inference, compound
 * `when` typing, part-scoped condition keys, and published-port typing.
 */

import type { VanityPort, VanityProps } from '../test-support/characterization'
import { describe, expectTypeOf, it } from 'vitest'
import { createSystem } from '../test-support/characterization'

// Never evaluated — the typecheck evidence dimension only reads types.
function system() {
  return createSystem({
    tokens: { color: { brand: '#635bff' }, space: { sm: '8px', md: '16px' } },
    conditions: { open: '&[data-state="open"]' },
  })
}

function button() {
  const { recipe, port, t } = system()
  const paddingX = port(t.space.md)

  return recipe({
    ports: { paddingX },
    base: { display: 'inline-flex', paddingInline: paddingX },
    variants: {
      intent: {
        brand: { background: t.color.brand },
        ghost: { background: 'transparent' },
      },
      size: {
        sm: { paddingInline: t.space.sm },
        md: {},
      },
    },
    toggles: {
      pill: { borderRadius: '999px' },
    },
    compound: [
      { when: { intent: 'ghost', size: 'sm' }, style: { padding: 0 } },
    ],
    defaults: { intent: 'brand', size: 'md' },
  })
}

describe('the call site', () => {
  it('resolves to a class string; literals stay strict', () => {
    const b = button()

    expectTypeOf(b()).toEqualTypeOf<string>()
    expectTypeOf(b({ intent: 'ghost', size: 'sm', pill: true })).toEqualTypeOf<string>()

    // @ts-expect-error — a typo'd key dies at the cursor
    void b({ intnet: 'brand' })
    // @ts-expect-error — an undeclared value dies at the cursor
    void b({ intent: 'brnd' })
    // @ts-expect-error — a toggle takes a boolean
    void b({ pill: 'yes' })
  })

  it('a wider props object just works — no pick, no wrapper', () => {
    const b = button()
    const props: VanityProps<typeof b> & { disabled?: boolean, href?: string } = {
      intent: 'ghost',
      disabled: true,
    }

    void b(props)
  })

  it('VanityProps collapses to the plain optional object', () => {
    const b = button()
    void b

    expectTypeOf<VanityProps<typeof b>>().toEqualTypeOf<{
      intent?: 'brand' | 'ghost'
      size?: 'sm' | 'md'
      pill?: boolean
    }>()
  })

  it('publishes the variant map, toggles, and ports, typed', () => {
    const b = button()

    expectTypeOf(b.variants).toEqualTypeOf<{
      readonly intent: readonly ('brand' | 'ghost')[]
      readonly size: readonly ('sm' | 'md')[]
    }>()
    expectTypeOf(b.toggles).toEqualTypeOf<readonly 'pill'[]>()
    expectTypeOf(b.ports.paddingX).toExtend<VanityPort<any, any>>()
    // @ts-expect-error — unpublished ports don't exist on the handle
    void b.ports.gap
  })
})

describe('the options object', () => {
  it('compound when and defaults are typed against the declared space', () => {
    const { recipe } = system()

    void recipe({
      variants: { size: { sm: {}, md: {} } },
      // @ts-expect-error — 'xl' is not a declared size
      compound: [{ when: { size: 'xl' }, style: {} }],
    })

    void recipe({
      variants: { size: { sm: {}, md: {} } },
      // @ts-expect-error — unknown axis in defaults
      defaults: { sizes: 'sm' },
    })
  })

  it('arms are full vanity rules — unknown properties die at the key', () => {
    const { recipe } = system()

    void recipe({
      variants: {
        intent: {
          // @ts-expect-error — 'paddin' is not a property, condition, or selector
          brand: { paddin: 8 },
        },
      },
    })
  })

  it('a recipe lives in one layer — no layer key inside arms', () => {
    const { recipe } = system()

    // @ts-expect-error — layer applies to the whole recipe
    void recipe({ base: { layer: 'overrides' } })
    void recipe.layer('overrides')({ base: { margin: 0 } })
    // @ts-expect-error — an undeclared layer dies at the key
    void recipe.layer('overides')({ base: { margin: 0 } })
  })
})

describe('anatomy', () => {
  function dialog() {
    const { anatomy, t } = system()

    return anatomy({
      parts: ['root', 'backdrop', 'content'],
      base: {
        backdrop: { position: 'fixed' },
        content: {
          'borderRadius': t.space.sm,
          'root:open': { borderStartStartRadius: 0 },
        },
      },
      variants: {
        size: {
          sm: { content: { maxInlineSize: '28rem' } },
          lg: { content: { maxInlineSize: '52rem' } },
        },
      },
      defaults: { size: 'sm' },
    })
  }

  it('a call returns the typed record of part classes', () => {
    const d = dialog()

    expectTypeOf(d({ size: 'lg' })).toEqualTypeOf<Record<'root' | 'backdrop' | 'content', string>>()
    expectTypeOf(d.parts.content).toEqualTypeOf<string>()
    // @ts-expect-error — undeclared parts don't exist on the result
    void d({}).title
  })

  it('part names are typed everywhere', () => {
    const { anatomy } = system()

    void anatomy({
      parts: ['root', 'content'],
      base: {
        // @ts-expect-error — 'contnet' is not a declared part
        contnet: { padding: 8 },
      },
    })

    void anatomy({
      parts: ['root', 'content'],
      base: {
        // @ts-expect-error — 'roto' is not a declared part
        content: { 'roto:open': { padding: 0 } },
      },
    })
  })

  it('VanityProps works on anatomies identically', () => {
    const d = dialog()
    void d

    expectTypeOf<VanityProps<typeof d>>().toEqualTypeOf<{ size?: 'sm' | 'lg' }>()
  })
})
