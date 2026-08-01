import { describe, expect, it } from 'vitest'
import { defineCssValue, length } from '../test-support/characterization'
import { createEngineKernel } from './engineKernel'

describe('the internal engine kernel', () => {
  it('uses deterministic semantic identity instead of object identity', () => {
    const first = createEngineKernel({}, { policies: { color: { gamut: 'preserve' }, length: { unitless: 'px' } } })
    const duplicate = createEngineKernel({}, { policies: { length: { unitless: 'px' }, color: { gamut: 'preserve' } } })
    const changed = createEngineKernel({}, { policies: { color: { gamut: 'clip' }, length: { unitless: 'px' } } })

    expect(first).not.toBe(duplicate)
    expect(first.signature).toBe(duplicate.signature)
    expect(first.compatibleWith(duplicate)).toBe(true)
    expect(first.compatibleWith(changed)).toBe(false)
  })

  it('rejects constructor collisions and duplicate extension identities locally', () => {
    const kernel = createEngineKernel({ length })
    expect(() => kernel.extend({ id: 'com.example.editorial', version: 1 }, { length: {} })).toThrow(/already exists/)
    const extended = kernel.extend({ id: 'com.example.editorial', version: 1 }, { editorial: {} })
    expect(() => extended.extend({ id: 'com.example.editorial', version: 1 }, { other: {} })).toThrow(/already installed/)
  })

  it('checks opaque value requirements against installed extension semantics', () => {
    const identity = { id: 'com.example.measure', version: 1 } as const
    const measure = defineCssValue({
      type: 'length',
      extension: identity,
      create(value: number) {
        return { serialize: () => `measure(${value})` }
      },
    })(4)

    const bare = createEngineKernel({})
    expect(() => bare.serialize(measure)).toThrow(/requires extension com.example.measure@1/)
    const installed = bare.extend(identity, { editorial: {} })
    expect(installed.serialize(measure)).toBe('measure(4)')
  })

  it('retains nested extension identity and rejects nondeterministic policy identity', () => {
    const identity = { id: 'com.example.measure', version: 1 } as const
    const measure = defineCssValue({
      type: 'length',
      extension: identity,
      create() {
        return { serialize: () => 'measure(4)' }
      },
    })()
    const wrapperIdentity = { id: 'com.example.wrapper', version: 1 } as const
    const wrapper = defineCssValue({
      type: 'length',
      extension: wrapperIdentity,
      create() {
        return { dependencies: [measure], serialize: context => `wrapper(${context.serialize(measure)})` }
      },
    })()

    const wrapperOnly = createEngineKernel({}, { extensions: [wrapperIdentity] })
    expect(() => wrapperOnly.serialize(wrapper)).toThrow(/requires extension com.example.measure@1/)
    expect(() => createEngineKernel({}, { policies: { ratio: Number.NaN } })).toThrow(/non-finite/)
    expect(() => createEngineKernel({}, { policies: { generation: 1n } })).toThrow(/deterministic JSON/)
    expect(() => createEngineKernel({}, { policies: { date: new Date() } })).toThrow(/plain deterministic JSON/)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => createEngineKernel({}, { policies: cyclic })).toThrow(/cycles/)
  })
})
