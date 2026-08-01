/**
 * The type plane for the Vue overlay: `usePorts` accepts fragments and thunks
 * only, and `useAnatomy` returns the typed record with the call-site law
 * intact — strict on literals, permissive on widened props
 * ([spec-recipes.md §4]).
 */

import type { VanityProps } from '@mszr/vanity'
import type { ComputedRef, CSSProperties, ExtractPropTypes } from 'vue'
import { propsOf, useAnatomy, usePorts } from '@mszr/vanity/vue'
import { definePrismSystem } from '@test'
import { describe, expectTypeOf, it } from 'vitest'

type IsAny<T> = 0 extends (1 & T) ? true : false

const propsOfMustNotBeAny: false = false as IsAny<typeof propsOf>
void propsOfMustNotBeAny

// The type plane never executes — these calls are shapes, not effects.
const { port, anatomy } = definePrismSystem()
const fraction = port(0)

const dialog = anatomy({
  parts: ['root', 'content'],
  base: { content: { padding: 8 } },
  variants: {
    size: {
      sm: { content: { maxWidth: '28rem' } },
      lg: { content: { maxWidth: '52rem' } },
    },
  },
  defaults: { size: 'sm' },
})

describe('usePorts', () => {
  it('binds fragments or a thunk to a computed style object', () => {
    expectTypeOf(usePorts(fraction.dec(0.5))).toEqualTypeOf<ComputedRef<CSSProperties>>()
    expectTypeOf(usePorts(() => [fraction.dec(0.5)])).toEqualTypeOf<ComputedRef<CSSProperties>>()
  })

  it('rejects a non-fragment source', () => {
    // @ts-expect-error — a number is not a port fragment
    void usePorts(5)
    // @ts-expect-error — a setter itself must be called
    void usePorts(fraction.set)
  })
})

describe('propsOf', () => {
  it('defineProps extracts the recipe props back out — no drift possible', () => {
    const options = propsOf(dialog)
    expectTypeOf<ExtractPropTypes<typeof options>['size']>().toEqualTypeOf<'sm' | 'lg' | undefined>()
    void options
  })

  it('rejects a source without the variant space', () => {
    // @ts-expect-error — a plain class string is not a recipe or anatomy
    void propsOf('a-class')
  })

  it('namespaces multi-component props from object keys', () => {
    const _options = propsOf.group({ dialog, modal: propsOf(dialog) })
    expectTypeOf<ExtractPropTypes<typeof _options>['dialog-size']>().toEqualTypeOf<'sm' | 'lg' | undefined>()
    expectTypeOf<ExtractPropTypes<typeof _options>['modal-size']>().toEqualTypeOf<'sm' | 'lg' | undefined>()
  })
})

describe('useAnatomy', () => {
  it('returns the typed record of part classes', () => {
    const d = useAnatomy(dialog, { size: 'sm' })
    expectTypeOf(d.value).toEqualTypeOf<Record<'root' | 'content', string>>()
  })

  it('literals stay strict; widened props flow through', () => {
    // @ts-expect-error — not a declared size
    void useAnatomy(dialog, { size: 'smm' })

    const props = {} as VanityProps<typeof dialog> & { disabled?: boolean }
    void useAnatomy(dialog, props)
  })

  it('accepts a getter and no props at all', () => {
    void useAnatomy(dialog, () => ({ size: 'lg' as const }))
    void useAnatomy(dialog)
  })
})
