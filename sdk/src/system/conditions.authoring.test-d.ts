import { aria, data } from '@mszr/vanity'
import { usePorts } from '@mszr/vanity/vue'
import { expectTypeOf, it } from 'vitest'

it('retains the exact selector and accepts conditional falsy ports', () => {
  expectTypeOf(data('selected').self.compiled).toEqualTypeOf<'&[data-selected]' | undefined>()
  expectTypeOf(aria('expanded', 'true').self.compiled).toEqualTypeOf<'&[aria-expanded=\'true\']' | undefined>()
  usePorts(() => ['', 0, 0n, false, null, undefined])
})
