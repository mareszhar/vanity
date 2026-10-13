import type { VanityTokenValidation } from './types'
import { describe, expect, it } from 'vitest'
import { check, createSystem, number as cssNumber, data } from '../index'
import { getSystemContract } from '../system/contract'

const rejectHigh = { '~standard': { version: 1 as const, vendor: 'sampling', validate: (input: unknown) => Number(input) > 0.5 ? { issues: [{ message: 'high seed' }] } : { value: input } } }

function pair(kind = 'moving', validation?: VanityTokenValidation) {
  const open = createSystem()
  const config = { val: 0, mutable: true as const, range: [0, 1] as const, ...(validation ? { validate: validation } : {}) }
  let tokens = open.defineTokens({ seed: kind === 'integer' ? open.tdef.integer(config) : open.tdef.number({ ...config, val: cssNumber(0) }) }).add(m => ({
    text: kind === 'integer' ? open.oklch(m.seed, 0, 0) : open.oklch(open.calc(m.seed).multiply(0.95).add(0.05) as never, 0, 0),
    bg: kind === 'static' ? open.color('white') : kind === 'held' ? open.oklch(m.seed, 0, 0) : kind === 'integer' ? open.oklch(open.calc(1).subtract(m.seed) as never, 0, 0) : open.oklch(open.calc(m.seed).multiply(0.15).add(0.85) as never, 0, 0),
  }))
  if (kind === 'held')
    tokens = tokens.add(m => ({ held: open.legibleOn(m.bg) })) as any
  return open.addTokens(tokens).addChecks((t: any) => [check.textContrast(kind === 'held' ? t.held : t.text, t.bg).aa()]).consolidate()
}

describe('reachable contrast samples', () => {
  it('holds each environment’s compiled foreground rather than a fresh sample pick', () => {
    const open = createSystem().addAxis('skin', { modes: { calm: '&', crisp: data('skin', 'crisp') }, default: 'calm' })
    const tokens = open.defineTokens({ seed: open.tdef.number({ val: cssNumber(0), mutable: true, range: [0, 1] }) }).add(m => ({ bg: open.tdef.color({ val: open.oklch(m.seed, 0, 0), axes: { skin: { crisp: 'white' } } }) })).add(m => ({ text: open.legibleOn(m.bg) }))
    const ds = open.addTokens(tokens).addChecks(t => [check.textContrast(t.text, t.bg).lc(0)]).consolidate()
    const records = getSystemContract(ds)!.portable.checks!
    expect(records.filter(r => r.environment?.skin === 'calm').map(r => r.measured)).toEqual([0, 0])
    expect(records.filter(r => r.environment?.skin === 'crisp').map(r => r.measured)).toEqual([106, 106])
  })

  it.each(['moving', 'static', 'held'])('checks %s under the same runtime state and keeps compiled foreground picks', (kind) => {
    expect(() => pair(kind)).toThrow(/VANITY_TOKENS_CONTRAST.*sampled.*seed.*1/)
  })

  it('samples only integer states, excluding the impossible failing midpoint', () => {
    const ds = pair('integer')
    expect(getSystemContract(ds)!.portable.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidence: expect.objectContaining({ level: 'sampled' }), samples: 2, worst: { seed: 0 } }),
    ]))
  })

  it('names the production profile when a dev validator excludes its failing state only in development', () => {
    expect(() => pair('moving', { id: 'high', schema: rejectHigh, runtime: 'dev' })).toThrow(/sampled \(production\)/)
  })

  it.each(['throw', 'omit'] as const)('excludes rejected %s inputs instead of measuring impossible colors', (onInvalid) => {
    const strict = { '~standard': { version: 1 as const, vendor: 'sampling', validate: (input: unknown) => Number(input) > 0.25 ? { issues: [{ message: 'high seed' }] } : { value: input } } }
    const ds = pair('moving', { id: 'strict', schema: strict, runtime: 'always', onInvalid })
    expect(getSystemContract(ds)!.portable.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ samples: 9, evidence: expect.objectContaining({ level: 'sampled' }) }),
    ]))
  })

  it('checks a reachable fallback rather than the rejected input', () => {
    expect(() => pair('moving', { id: 'high', schema: rejectHigh, runtime: 'always', onInvalid: 'fallback', fallback: 1 })).toThrow(/sampled.*seed.*1/)
  })

  it.each(['unavailable', 'async'])('limits evidence for an %s validator without failing the build', (kind) => {
    const ds = pair('moving', { id: kind, runtime: 'always', ...(kind === 'async' ? { schema: { '~standard': { version: 1 as const, vendor: 'sampling', validate: (v: unknown) => Promise.resolve({ value: v }) } } } : {}) })
    expect(getSystemContract(ds)!.portable.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidence: expect.objectContaining({ level: 'sampled', parameters: expect.objectContaining({ limit: 'validator not evaluated' }) }) }),
    ]))
  })

  it('uses transformed output and enforces its range through the runtime acceptance path', () => {
    const schema = { '~standard': { version: 1 as const, vendor: 'sampling', validate: () => ({ value: 0 }) } }
    const ds = pair('moving', { id: 'zero', schema, runtime: 'always' })
    expect(getSystemContract(ds)!.portable.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ samples: 33, worst: { seed: 0 }, measured: 13.2 }),
    ]))
  })

  it('reports one result when dev and production reach the same states', () => {
    const open = createSystem()
    const schema = { '~standard': { version: 1 as const, vendor: 'sampling', validate: (value: unknown) => ({ value }) } }
    const tokens = open.defineTokens({ seed: open.tdef.number({ val: cssNumber(0), mutable: true, range: [0, 1], validate: { id: 'same', schema, runtime: 'dev' } }) }).add(m => ({ text: open.oklch(m.seed, 0, 0), bg: open.color('white') }))
    const ds = open.addTokens(tokens).addChecks(t => [check.textContrast(t.text, t.bg).lc(0)]).consolidate()
    expect(getSystemContract(ds)!.portable.checks).toHaveLength(2)
    expect(getSystemContract(ds)!.portable.checks!.every(r => r.profile === 'both')).toBe(true)
  })

  it('rejects out-of-range validator output before measuring it', () => {
    const schema = { '~standard': { version: 1 as const, vendor: 'sampling', validate: (value: unknown) => ({ value: Number(value) > 0.25 ? 2 : value }) } }
    const ds = pair('moving', { id: 'range-output', schema, runtime: 'always' })
    expect(getSystemContract(ds)!.portable.checks![0]!.samples).toBe(9)
  })

  it('still fails a fully evaluated state when another sample has an async validator', () => {
    const schema = { '~standard': { version: 1 as const, vendor: 'sampling', validate: (value: unknown) => Number(value) === 1 ? Promise.resolve({ value }) : { value } } }
    expect(() => pair('moving', { id: 'partial', schema, runtime: 'always' })).toThrow(/sampled.*0\.96875/)
  })

  it('samples the union of independent foreground and background inputs', () => {
    const open = createSystem()
    const tokens = open.defineTokens({ fg: open.tdef.number({ val: cssNumber(0), mutable: true, range: [0, 1] }), bg: open.tdef.number({ val: cssNumber(1), mutable: true, range: [0, 1] }) }).add(m => ({ text: open.oklch(m.fg, 0, 0), background: open.oklch(m.bg, 0, 0) }))
    expect(() => open.addTokens(tokens).addChecks(t => [check.textContrast(t.text, t.background).aa()]).consolidate()).toThrow(/sampled.*"fg":0,"bg":0/)
  })
})
