import { readFile } from 'node:fs/promises'
import { emit } from '@test'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { assertManifest } from '../cli'
import { angle, check, createSystem, number as cssNumber } from '../index'
import { buildManifest } from '../introspect/manifest'
import { collectInspection } from '../introspect/records'
import { assertPortableSystem, getSystemContract } from '../system/contract'

function fixture(kind: string) {
  const open = createSystem()
  const tokens = kind === 'product'
    ? open.defineTokens({ a: open.tdef.number({ val: 0, mutable: true, range: [0, 1] }), b: open.tdef.number({ val: 0, mutable: true, range: [0, 1] }), c: open.tdef.number({ val: 0, mutable: true, range: [0, 1] }) }).add(m => ({ bg: open.oklch(open.calc(m.a).add(m.b).add(m.c).multiply(0.01).add(0.99) as never, 0, 0), text: 'black' }))
    : open.defineTokens({ seed: kind === 'integer' ? open.tdef.integer({ val: 0, mutable: true, range: [0, 100] }) : kind === 'rad' ? open.tdef.angle({ val: angle.rad(0), mutable: true, range: [angle.rad(0), angle.rad(2 * Math.PI)] }) : open.tdef.number({ val: cssNumber(0), mutable: true }) }).add(m => ({ derived: open.calc(m.seed).multiply(1) })).add(m => ({ bg: open.oklch(0.99, 0.005, kind === 'rad' ? m.seed : m.derived), text: 'black' }))
  return open.addTokens(tokens).addChecks((t: any) => [check.textContrast(t.text, t.bg).aa()]).consolidate()
}

describe('contrast evidence artifacts', () => {
  it('preserves each registered threshold for the same pairing', () => {
    const ds = createSystem().addTokens(h => ({ text: h.color('black'), bg: h.color('white') })).addChecks(t => [check.textContrast(t.text, t.bg).aaa()]).addChecks(t => [check.textContrast(t.text, t.bg).aa()]).consolidate()
    const captured = collectInspection(() => emit(() => ds.class({ color: ds.t.text })))
    const records = Object.values(buildManifest(captured.records, captured.result.css).modules).flatMap(m => m.contrast)
    expect(records).toHaveLength(4)
    expect(records.map(r => [r.scheme, r.min])).toEqual(expect.arrayContaining([
      ['light', 7],
      ['dark', 7],
      ['light', 4.5],
      ['dark', 4.5],
    ]))
  })

  it('retains distinct validation profiles in emitted manifest evidence', () => {
    const open = createSystem()
    const schema = { '~standard': { version: 1 as const, vendor: 'profiles', validate: (value: unknown) => Number(value) > 0.5 ? { issues: [{ message: 'upper half' }] } : { value } } }
    const tokens = open.defineTokens({ seed: open.tdef.number({ val: cssNumber(0), mutable: true, range: [0, 1], validate: { id: 'different', schema, runtime: 'dev' } }) }).add(m => ({ text: open.oklch(m.seed, 0, 0), bg: open.color('white') }))
    const ds = open.addTokens(tokens).addChecks(t => [check.textContrast(t.text, t.bg).lc(0)]).consolidate()
    const captured = collectInspection(() => emit(() => ds.class({ color: ds.t.text })))
    const records = Object.values(buildManifest(captured.records, captured.result.css).modules).flatMap(m => m.contrast)
    expect(records).toHaveLength(4)
    expect(records.map(r => [r.scheme, r.profile, r.samples])).toEqual(expect.arrayContaining([
      ['light', 'development', 17],
      ['light', 'production', 33],
      ['dark', 'development', 17],
      ['dark', 'production', 33],
    ]))
  })

  it.each(['product', 'integer', 'rad', 'no-range'])('round-trips %s evidence through the portable and strict manifest readers', async (kind) => {
    const ds = fixture(kind)
    const portable = getSystemContract(ds)!.portable
    expect(ds.explain((ds.t as any).bg)).toMatchObject({ contrast: expect.arrayContaining([expect.objectContaining({ pairing: 'text on bg', evidence: expect.any(Object) })]) })
    expect(() => assertPortableSystem(JSON.parse(JSON.stringify(portable)))).not.toThrow()
    const captured = collectInspection(() => emit(() => ds.class({ color: (ds.t as any).text })))
    const manifest = buildManifest(captured.records, captured.result.css)
    expect(() => assertManifest(manifest)).not.toThrow()
    const validate = new Ajv2020().compile(JSON.parse(await readFile(new URL('../../manifest.schema.json', import.meta.url), 'utf8')))
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true)
    const record = portable.checks![0]!
    if (kind === 'product') {
      expect(record.samples).toBeLessThanOrEqual(1024)
      expect(record.evidence).toMatchObject({ level: 'sampled', parameters: { reduced: true, fullProduct: 35937 } })
    }
    else if (kind === 'integer') {
      expect(record.samples).toBe(33)
    }
    else if (kind === 'rad') {
      expect(record).toMatchObject({ samples: 73, step: { seed: '5°' } })
    }
    else {
      expect(record).toMatchObject({ evidence: { level: 'environments' }, note: expect.stringContaining('declare a range for seed') })
    }
  })
})
