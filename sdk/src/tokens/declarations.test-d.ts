import { createSystem, propertyAliases } from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

const ds = createSystem()
  .addPlugin(propertyAliases({ bg: 'background' }))
  .addConditions({ hover: '&:hover' })
  .addTokens({
    text: {
      body: {
        fontSize: '1rem',
        lineHeight: 1.5,
        hover: { color: 'purple' },
      },
    },
    surface: { bg: 'canvas' },
  })
  .consolidate({ prefix: 'app' })

describe('token $dec types', () => {
  it('preserves exact keys and handles in declaration bundles', () => {
    expectTypeOf(ds.t.text.body.$dec.fontSize).toEqualTypeOf<typeof ds.t.text.body.fontSize>()
    expectTypeOf(ds.t.text.body.$dec.lineHeight).toEqualTypeOf<typeof ds.t.text.body.lineHeight>()
    expectTypeOf(ds.t.text.body.$dec.hover.color).toEqualTypeOf<typeof ds.t.text.body.hover.color>()
    expectTypeOf(ds.t.surface.$dec.bg).toEqualTypeOf<typeof ds.t.surface.bg>()
  })

  it('makes namespace misuse explain itself in the type', () => {
    expectTypeOf(ds.t.text.$dec.color).toHaveProperty(
      '$dec cannot apply body: navigate to a leaf bundle, or register/use the child as a condition',
    )
  })
})
