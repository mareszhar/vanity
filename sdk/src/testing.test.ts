import { describe, expect, it } from 'vitest'
import { createSystem } from './index'
import {
  captureEmission,
  emitOf,
  foldOf,
  foldResultOf,
  renderOf,
  rendersLike,
} from './testing'

describe('consumer testing kit', () => {
  it('captures the real token and rule emission pipeline', () => {
    const ds = createSystem()
      .addTokens({ color: { brand: '#635bff' } })
      .consolidate({ prefix: 'fixture' })
    const emission = captureEmission(() => {
      return ds.class({ color: ds.t.color.brand }, 'button')
    })

    expect(emission.value).toContain('button')
    expect(emission.css).toMatch(/--fixture-color-brand:\s*#635bff/)
    expect(emission.css).toMatch(/color:\s*var\(--fixture-color-brand\)/)
    const minimal = createSystem().consolidate()
    expect(emitOf(() => minimal.class({ display: 'grid' }, 'layout')))
      .toMatch(/display:\s*grid/)
  })

  it('exposes both the concise folded value and the complete fold decision', () => {
    const ds = createSystem()
      .addTokens({ space: { md: '16px' } })
      .consolidate()

    expect(foldOf(ds.t.space.md)).toBe('16px')
    expect(foldResultOf(ds.t.space.md)).toEqual({
      status: 'folded',
      val: '16px',
    })
  })

  it('explains when build-time fold evidence is no longer available', () => {
    const restored = Object.assign(
      () => 'var(--restored)',
      { $name: '--restored' },
    )

    expect(() => foldOf(restored as any)).toThrow(/consolidated in this process.*application handle/)
  })

  it('reads and matches exact or patterned computed values', () => {
    const values: Record<string, string> = {
      '--brand': 'oklch(0.6 0.2 264)',
      'color': 'rgb(99, 91, 255)',
    }
    const element = {
      ownerDocument: {
        defaultView: {
          getComputedStyle: () => ({
            getPropertyValue: (property: string) => ` ${values[property] ?? ''} `,
          }),
        },
      },
    }

    expect(renderOf(element, ['--brand', 'color'])).toEqual(values)
    expect(rendersLike(element, {
      '--brand': 'oklch(0.6 0.2 264)',
      'color': /^rgb\(/,
    })(createSystem().consolidate())).toBe(true)
  })

  it('fails selector assertions with a local mounting fix outside a DOM', () => {
    expect(() => rendersLike('#missing', { '--brand': 'red' })({}))
      .toThrow(/without a DOM document/)
  })
})
