import { describe, expect, it } from 'vitest'
import { protectRelativeColorSyntax } from './postcss'

describe('nuxt PostCSS compatibility', () => {
  it('disables only the unsafe calc transform in Nuxt defaults', () => {
    const postcss = { plugins: { autoprefixer: {}, cssnano: {} } }

    protectRelativeColorSyntax(postcss)

    expect(postcss.plugins.cssnano).toEqual({
      preset: ['default', { calc: false }],
    })
    expect(postcss.plugins.autoprefixer).toEqual({})
  })

  it('normalises boolean and named default presets', () => {
    const booleanConfig: { plugins: Record<string, unknown> } = {
      plugins: { cssnano: true },
    }
    const namedConfig = {
      plugins: { cssnano: { preset: 'default', svgo: false } },
    }

    protectRelativeColorSyntax(booleanConfig)
    protectRelativeColorSyntax(namedConfig)

    expect(booleanConfig.plugins.cssnano).toEqual({
      preset: ['default', { calc: false }],
    })
    expect(namedConfig.plugins.cssnano).toEqual({
      preset: ['default', { calc: false }],
      svgo: false,
    })
  })

  it('preserves default-preset options while overriding unsafe calc parsing', () => {
    const postcss = {
      plugins: {
        cssnano: {
          preset: ['default', { calc: { precision: 3 }, normalizeWhitespace: false }],
        },
      },
    }

    protectRelativeColorSyntax(postcss)

    expect(postcss.plugins.cssnano.preset).toEqual([
      'default',
      { calc: false, normalizeWhitespace: false },
    ])
  })

  it('leaves disabled and custom presets under user control', () => {
    const disabled = { plugins: { cssnano: false } }
    const custom = { plugins: { cssnano: { preset: 'advanced' } } }

    protectRelativeColorSyntax(disabled)
    protectRelativeColorSyntax(custom)

    expect(disabled.plugins.cssnano).toBe(false)
    expect(custom.plugins.cssnano.preset).toBe('advanced')
  })
})
