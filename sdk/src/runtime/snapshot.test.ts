import { describe, expect, it } from 'vitest'
import { createSystem, defineCssValue, length, number, rgb } from '../index'
import { substrate } from '../substrate'

function target() {
  const values = new Map<string, string>()
  return {
    values,
    style: {
      setProperty(name: string, value: string) { values.set(name, value) },
      removeProperty(name: string) {
        const previous = values.get(name) ?? ''
        values.delete(name)
        return previous
      },
      getPropertyValue(name: string) { return values.get(name) ?? '' },
    },
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return null },
    matches() { return true },
  }
}

function system(schema: object, config: object = {}, type = 'number') {
  return substrate.modules.runInFileScope({ filePath: 'fixture/snapshot.ts' }, () => createSystem().addTokens(h => ({
    role: (h.tdef as any)[type]({ val: type === 'length' ? length.px(12) : number(0.5), mutable: true, validate: { id: 'snapshot', schema, runtime: 'always', ...config } }),
    source: length.px(8),
  })).consolidate())
}

describe('canonical runtime snapshots', () => {
  it('records inputs and validates once at each write boundary, retaining transforming output inside its range', () => {
    const inputs: unknown[] = []
    const schema = { '~standard': { version: 1, vendor: 'snapshot', validate(input: number) {
      inputs.push(input)
      return { value: input * 2 }
    } } }
    const ds = substrate.modules.runInFileScope({ filePath: 'fixture/snapshot.ts' }, () => createSystem().addTokens(h => ({
      role: h.tdef({ val: number(0.5), mutable: true, range: [0, 1], validate: { id: 'snapshot', schema: schema as any, runtime: 'always' } }),
    })).consolidate())
    const root = target()
    const rt = ds.runtime({ within: root })
    rt.t.role.$set(0.5)
    expect(inputs).toEqual([0.5])
    expect([...root.values.values()]).toEqual(['1'])
    const snapshot = JSON.parse(JSON.stringify(rt.snapshot()))
    expect(snapshot).toMatchObject({ version: 2, overrides: [{ val: 0.5 }] })
    inputs.length = 0
    rt.refreshRoots()
    rt.bindRoot('$system', root)
    rt.inspect()
    expect(inputs).toEqual([])
    expect([...root.values.values()]).toEqual(['1'])
    expect(Object.values(ds.runtimeProps(snapshot).$system!.style)).toEqual(['1'])
    expect(inputs).toEqual([0.5])
    inputs.length = 0
    const hydratedRoot = target()
    const hydrated = ds.runtime({ within: hydratedRoot })
    hydrated.hydrate(snapshot)
    expect(inputs).toEqual([0.5])
    expect([...hydratedRoot.values.values()]).toEqual(['1'])
    expect(hydrated.snapshot()).toEqual(snapshot)
    inputs.length = 0
    const initialRoot = target()
    ds.runtime({ within: initialRoot, initial: snapshot })
    expect(inputs).toEqual([0.5])
    expect([...initialRoot.values.values()]).toEqual(['1'])
    inputs.length = 0
    expect(ds.snapshotFrom(seed => seed.transaction(tx => tx.t.role.$set(0.5)))).toEqual(snapshot)
    expect(inputs).toEqual([0.5])
  })

  it('replays parser inputs whose outputs are not valid schema inputs', () => {
    const schema = { '~standard': { version: 1, vendor: 'snapshot', validate: (input: unknown) => typeof input === 'string' && /^\d+px$/.test(input) ? { value: Number.parseInt(input) } : { issues: [{ message: 'pixel text required' }] } } }
    const ds = system(schema)
    const snapshot = ds.snapshotFrom(rt => (rt.t.role as any).$set('12px'))
    expect(snapshot.overrides[0]?.val).toBe('12px')
    expect(Object.values(ds.runtimeProps(JSON.parse(JSON.stringify(snapshot))).$system!.style)).toEqual(['12'])
    expect(ds.reconcileRuntimeSnapshot(snapshot).diagnostics).toEqual([])
  })

  it('normalizes vanity values, extension values and token handles before validation and records that same text', () => {
    const seen: unknown[] = []
    const ds = system({ '~standard': { version: 1, vendor: 'snapshot', validate(input: unknown) {
      seen.push(input)
      return typeof input === 'string' ? { value: input } : { issues: [{ message: 'CSS text required' }] }
    } } }, {}, 'length')
    const extension = defineCssValue({ type: 'length', extension: { id: 'snapshot/extension', version: 1 }, create: (px: number) => ({ serialize: () => `${px}px` }) })
    for (const input of [length.px(12), extension(14), ds.t.source]) {
      seen.length = 0
      const snapshot = ds.snapshotFrom(rt => (rt.t.role as any).$set(input))
      expect(seen).toEqual([String(input)])
      expect(snapshot.overrides[0]?.val).toBe(String(input))
      expect(Object.values(ds.runtimeProps(JSON.parse(JSON.stringify(snapshot))).$system!.style)).toEqual([String(input)])
      expect(seen).toEqual([String(input), String(input)])
    }
    seen.length = 0
    expect(() => ds.snapshotFrom(rt => (rt.t.role as any).$set(rgb(255, 0, 0)))).toThrow(/expected <length>.*<color>/)
    expect(seen).toEqual([])
  })

  it('preserves string and number inputs and canonicalizes negative zero', () => {
    const seen: unknown[] = []
    const ds = system({ '~standard': { version: 1, vendor: 'snapshot', validate(input: unknown) {
      seen.push(input)
      return { value: input }
    } } })
    for (const input of [-0, 0.5, '0.5']) {
      seen.length = 0
      const snapshot = ds.snapshotFrom(rt => (rt.t.role as any).$set(input))
      expect(seen).toEqual([Object.is(input, -0) ? 0 : input])
      expect(snapshot.overrides[0]?.val).toBe(Object.is(input, -0) ? 0 : input)
      ds.runtimeProps(JSON.parse(JSON.stringify(snapshot)))
      expect(seen).toEqual([Object.is(input, -0) ? 0 : input, Object.is(input, -0) ? 0 : input])
    }
  })

  it('does not record omitted writes and replays a rejected input to its fallback', () => {
    const schema = { '~standard': { version: 1, vendor: 'snapshot', validate: () => ({ issues: [{ message: 'reject' }] }) } }
    const omitted = system(schema, { onInvalid: 'omit' })
    expect(omitted.snapshotFrom(rt => (rt.t.role as any).$set(0.5)).overrides).toEqual([])
    const fallback = system(schema, { onInvalid: 'fallback', fallback: 0.75 })
    const snapshot = fallback.snapshotFrom(rt => (rt.t.role as any).$set(0.5))
    expect(snapshot.overrides[0]?.val).toBe(0.5)
    expect(Object.values(fallback.runtimeProps(JSON.parse(JSON.stringify(snapshot))).$system!.style)).toEqual(['0.75'])
  })

  it('rejects version 1 with a named diagnostic and falls back to defaults', () => {
    const ds = system({ '~standard': { version: 1, vendor: 'snapshot', validate: (input: unknown) => ({ value: input }) } })
    const old = { ...ds.snapshotFrom(() => {}), version: 1, overrides: [{ token: ['role'], address: { kind: 'base' }, val: '0.75' }] }
    const result = ds.reconcileRuntimeSnapshot(old)
    expect(result.snapshot).toMatchObject({ version: 2, overrides: [], modes: {} })
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'VANITY_RUNTIME_SCHEMA_MISMATCH', message: expect.stringMatching(/version 1.*version 2/) }))
    expect(ds.runtimeProps(old).$system!.style).toEqual({})
    const root = target()
    const rt = ds.runtime({ within: root, initial: old })
    expect(root.values.size).toBe(0)
    ;(rt.t.role as any).$set(0.5)
    rt.hydrate(old)
    expect(root.values.size).toBe(0)
    expect(rt.diagnostics.some(diagnostic => diagnostic.message.includes('version 1'))).toBe(true)
  })
})
