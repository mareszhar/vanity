import { describe, expectTypeOf, it } from 'vitest'
import { check, createSystem } from '../index'

describe('typed system checks', () => {
  it('infers a compiled legibleOn token as a color for pairing checks', () => {
    const open = createSystem()
    const tokens = open.defineTokens({ bg: open.color('white') }).add(m => ({ text: open.legibleOn(m.bg) }))
    open.addTokens(tokens).addChecks((t) => {
      expectTypeOf(t.text.$type).toEqualTypeOf<'color'>()
      return [check.textContrast(t.text, t.bg)]
    })
  })

  it('exposes the accumulated token shape without claiming a final prefix', () => {
    const open = createSystem().addTokens(h => ({ color: { text: h.color('black'), bg: h.color('white') } }))
    const checked = open.addChecks((t) => {
      expectTypeOf(t.color.text.$type).toEqualTypeOf<'color'>()
      expectTypeOf(t.color.text.$name).toEqualTypeOf<`--${string}-color-text`>()
      // @ts-expect-error — the callback cannot reference an absent role
      void t.color.absent
      return [check.textContrast(t.color.text, t.color.bg).aa()]
    })
    expectTypeOf(checked.t.color.text.$type).toEqualTypeOf<'color'>()
    expectTypeOf(checked.t.color.text.$phase).toEqualTypeOf<'logical'>()
    const ds = checked.consolidate({ prefix: 'app' })
    // @ts-expect-error — checks attach before consolidation
    void ds.addChecks
    // @ts-expect-error — consolidate has no checks option
    void open.consolidate({ checks: () => [] })
  })
})
