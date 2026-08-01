import { createSystem, fromEntries, mapRecord } from '@mszr/vanity'
import { describe, expectTypeOf, it } from 'vitest'

const open = createSystem()
const ds = open
  .addTokens({ color: { brand: open.tdef({ val: 'red' }) } })
  .addConditions({ hover: '&:hover' })
  .consolidate()

describe('target styling types', () => {
  it('keeps fragments, arrays, omission, token declarations, and helpers exact', () => {
    const fragment = ds.fragment({ display: 'flex', hover: { color: 'red' } })
    expectTypeOf(ds.class([fragment, false, ds.omit, { color: 'blue' }])).toEqualTypeOf<string>()
    expectTypeOf(ds.tdec({ color: { brand: 'rebeccapurple' } }))
      .toMatchTypeOf<Record<`--${string}`, string | number>>()

    // @ts-expect-error — token declaration trees retain exact token paths
    ds.tdec({ color: { missing: 'red' } })
    // @ts-expect-error — layer names retain the consolidated order
    ds.class.layer('missing')({ color: 'red' })
    // @ts-expect-error — pre-release target has no legacy class-emitter alias
    void ds.css
    // @ts-expect-error — selector maps use the output-named rules emitter
    void ds.globalCss
    // @ts-expect-error — token subtree declarations use tdec
    void ds.tokenOverride
    // @ts-expect-error — atoms are an emitter, not a definition registry
    void ds.defineAtoms

    const built = fromEntries([['sm', 4], ['md', 8]] as const)
    expectTypeOf(built.sm).toEqualTypeOf<4>()
    expectTypeOf(built.md).toEqualTypeOf<8>()
    const mapped = mapRecord(built, value => `${value}px`)
    expectTypeOf(mapped).toHaveProperty('sm')
    expectTypeOf(mapped).toHaveProperty('md')
  })
})
