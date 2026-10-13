import { describe, expect, it } from 'vitest'
import { angle, createSystem, length, number, percent, time, VanityRuntimeError } from '../index'
import { substrate } from '../substrate'
import { getSystemContract } from '../system/contract'

function system(type: string, config: object) {
  return substrate.modules.runInFileScope({ filePath: 'fixture/range.ts' }, () => createSystem().addTokens(h => ({ role: (h.tdef as any)[type]({ mutable: true, ...config }) })).consolidate())
}

describe('mutable token ranges', () => {
  it('enforces inclusive bounds and exact units through setters and server projections', () => {
    const rows = [
      ['number', number(0.5), [0, 1], [0, 1], [-0.1, 1.1, 'calc(0.5)', 'var(--n)']],
      ['integer', 1, [0, 2], [0, 2], [0.5, 3]],
      ['percentage', percent(50), [0, 100], [0, 100, '50%'], [-1, '101%']],
      ['length', length.px(48), ['0px', '96px'], ['0px', '96px', '1in', '2.54cm', '25.4mm', '101.6Q', '72pt', '6pc'], ['96.000000000000000001px', '1rem', 'calc(48px)', 'var(--x)']],
      ['length', length.rem(1), ['0rem', '2rem'], ['0rem', '2rem'], ['1em', '16px']],
      ['time', time.ms(500), ['0ms', '1000ms'], ['1s', '1000ms'], ['1000.000000000000000001ms']],
      ['angle', angle.rad(1), ['0rad', '2rad'], ['0rad', '2rad', '1.000000000000000001rad'], ['2.000000000000000001rad', '1deg']],
      ['angle', angle.deg(180), ['0deg', '360deg'], ['1turn', '400grad'], ['1rad', '360.000000000000000001deg']],
    ] as const
    for (const [type, val, range, accepted, rejected] of rows) {
      const ds = system(type, { val, range })
      for (const input of accepted) {
        const snapshot = ds.snapshotFrom(rt => (rt.t.role as any).$set(input))
        expect(snapshot.overrides[0]?.val, `${type}: ${input}`).toBe(input)
        expect(Object.values(ds.runtimeProps(snapshot).$system!.style)).toContain(String(input))
      }
      for (const input of rejected) {
        expect(() => ds.snapshotFrom(rt => (rt.t.role as any).$set(input)), `${type}: ${input}`).toThrow(VanityRuntimeError)
        const seed = ds.snapshotFrom(() => {})
        const result = ds.reconcileRuntimeSnapshot({ ...seed, overrides: [{ token: ['role'], address: { kind: 'base' }, val: String(input) }] })
        expect(result.diagnostics, `SSR ${type}: ${input}`).not.toEqual([])
        expect(Object.values(ds.runtimeProps(result.snapshot).$system!.style)).not.toContain(String(input))
      }
    }
  })

  it('checks validator output and fallback, not only the original input', () => {
    const schema = { '~standard': { version: 1, vendor: 'range', validate: (input: number) => ({ value: input * 2 }) } }
    const ds = system('number', { val: number(0.5), range: [0, 1], validate: { id: 'double', schema, runtime: 'always' } })
    expect(ds.snapshotFrom(rt => (rt.t.role as any).$set(0.5)).overrides[0]?.val).toBe(0.5)
    expect(() => ds.snapshotFrom(rt => (rt.t.role as any).$set(0.75))).toThrow(/range/)
    const fallback = system('number', { val: number(0.5), range: [0, 1], validate: { id: 'fallback', schema: { '~standard': { version: 1, vendor: 'range', validate: () => ({ issues: [{ message: 'reject' }] }) } }, runtime: 'always', onInvalid: 'fallback', fallback: 2 } })
    expect(() => fallback.snapshotFrom(rt => (rt.t.role as any).$set(0.5))).toThrow(/range/)
  })

  it('rejects unsupported, nonmutable, unordered and incomparable bounds at definition', () => {
    for (const [type, config] of [
      ['length', { val: length.px(1), mutable: false, range: ['0px', '2px'] }],
      ['color', { val: 'red', range: ['red', 'blue'] }],
      ['length', { val: length.px(1), range: ['0px', '2rem'] }],
      ['length', { val: length.px(1), range: ['0%', '100%'] }],
      ['number', { val: number(1), range: [2, 0] }],
      ['integer', { val: 1, range: [0, 1.5] }],
    ] as const)
      expect(() => system(type, config)).toThrow(/range/)
  })

  it('puts ranges only in the runtime schema identity without rewriting CSS', () => {
    const before = getSystemContract(system('number', { val: number(0.5), range: [0, 1] }))!.portable
    const after = getSystemContract(system('number', { val: number(0.5), range: [0, 2] }))!.portable
    expect(after.identities.runtime).not.toBe(before.identities.runtime)
    expect(after.runtime.system).not.toBe(before.runtime.system)
    expect(after.identities.css).toBe(before.identities.css)
    expect(after.identities.compatibility).toBe(before.identities.compatibility)
  })
})
