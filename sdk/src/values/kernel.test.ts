import { describe, expect, it } from 'vitest'
import { defineCssValue } from '../values/extensions'
import {
  createValueKernel,
  extendValueKernel,
  isValueKernelCompatible,
  serializeValueWithContext,
} from './kernel'
import { VANITY_DEFAULT_CSS_SUPPORT } from './protocol'
import { length } from './units'

describe('the value kernel', () => {
  it('uses deterministic capability identity instead of object identity', () => {
    const first = createValueKernel({ length })
    const duplicate = createValueKernel({ length })
    const changed = createValueKernel({ length, editorial: () => length.px(1) })

    expect(first).not.toBe(duplicate)
    expect(first.signature).toBe(duplicate.signature)
    expect(isValueKernelCompatible(first, duplicate)).toBe(true)
    expect(isValueKernelCompatible(first, changed)).toBe(false)
  })

  it('rejects constructor collisions and duplicate extension identities locally', () => {
    const kernel = createValueKernel({ length })
    expect(() => extendValueKernel(kernel, { id: 'com.example.editorial', version: 1 }, { length: {} })).toThrow(/already exists/)
    const extended = extendValueKernel(kernel, { id: 'com.example.editorial', version: 1 }, { editorial: {} })
    expect(() => extendValueKernel(extended, { id: 'com.example.editorial', version: 1 }, { other: {} })).toThrow(/already installed/)
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

    const bare = createValueKernel({})
    const context = {
      values: bare,
      support: VANITY_DEFAULT_CSS_SUPPORT,
      policies: {},
    }
    expect(() => serializeValueWithContext(context, measure)).toThrow(/requires extension com.example.measure@1/)
    const installed = extendValueKernel(bare, identity, { editorial: {} })
    expect(serializeValueWithContext({ ...context, values: installed }, measure)).toBe('measure(4)')
  })
})
