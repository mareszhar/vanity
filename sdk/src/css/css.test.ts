/**
 * The runtime evidence dimension: system binding, class identity, and the diagnostics
 * contract — exactly one per mistake, naming the offending key and the fix
 * ([patterns.md §10]).
 */

import type { VanityColorTokenHandle } from '../index'
import { definePrism, definePrismSystem, emit } from '@test'
import { describe, expect, it } from 'vitest'
import { check, defineTokens, legibleOn, oklch, VanityError } from '../index'
import { createFixtureSystem } from '../test-support/current'
import { getTokenModule } from '../tokens/builder'
import { resolveTokenModule } from '../tokens/resolve'

function expectVanityError(run: () => unknown, code: string, message: RegExp): VanityError {
  let caught: unknown

  try {
    run()
  }
  catch (error) {
    caught = error
  }

  expect(caught).toBeInstanceOf(VanityError)
  const vanityError = caught as VanityError
  expect(vanityError.code).toBe(code)
  expect(vanityError.message).toMatch(message)
  return vanityError
}

describe('createSystem', () => {
  it('finalizes the defined graph as canonical token handles', () => {
    const { returned: t } = emit(() => definePrism())
    expect(t.color.brand.$name).toBe('--vanity-color-brand')
  })

  it('binds inline tokens and hands t back — one file, one call', () => {
    const { returned: system } = emit(() => createFixtureSystem({
      tokens: { color: { brand: '#635bff' } },
      prefix: 'prism',
    }))

    expect(`${system.t.color.brand}`).toBe('var(--prism-color-brand)')
    expect(system.t.color.brand.$val).toBe('#635bff')
  })

  it('forwards checks to an inline token module', () => {
    expectVanityError(
      () => emit(() => {
        const module = defineTokens({
          color: { ink: oklch(0.5, 0, 0), canvas: oklch(0.55, 0, 0) },
        })
        return resolveTokenModule(getTokenModule(module)!, {
          checks: (tokens) => {
            const colors = tokens as unknown as {
              readonly color: {
                readonly ink: VanityColorTokenHandle
                readonly canvas: VanityColorTokenHandle
              }
            }
            return [check.textContrast(colors.color.ink, colors.color.canvas)]
          },
        })
      }),
      'VANITY_TOKENS_CONTRAST',
      /fails APCA/,
    )
  })

  it('refuses a condition name that collides with a CSS property, at definition', () => {
    expectVanityError(
      () => emit(() => createFixtureSystem({
        conditions: { color: '&[data-color]' } as never,
      })),
      'VANITY_SYSTEM_CONDITION_COLLISION',
      /the condition 'color' collides with the CSS property 'color'/,
    )
  })

  it('refuses a condition that is neither a selector nor an at-rule', () => {
    expectVanityError(
      () => emit(() => createFixtureSystem({
        conditions: { open: 'not a selector !' },
      })),
      'VANITY_SYSTEM_INVALID_CONDITION',
      /neither a valid selector nor an at-rule/,
    )
  })

  it('a same-named user condition overrides its base condition', () => {
    const { css } = emit(() => {
      const system = createFixtureSystem({
        conditions: { hover: '&:hover, &[data-hover]' },
      })
      system.class({ hover: { opacity: 0.9 } }, 'probe')
    })

    expect(css).toContain('[data-hover]')
  })

  it('baseConditions: false opts out entirely', () => {
    expectVanityError(
      () => emit(() => {
        const system = createFixtureSystem({ baseConditions: false })
        system.class({ hover: { opacity: 0.9 } } as never)
      }),
      'VANITY_CSS_UNKNOWN_PROPERTY',
      /hover is neither a CSS property nor a condition of this system/,
    )
  })
})

describe('class() diagnostics', () => {
  it('accepts CSS-wide keywords for shorthand properties', () => {
    const { css } = emit(() => {
      const { class: style } = definePrismSystem()
      style({ font: 'inherit', animation: 'revert-layer' }, 'wide-keywords')
    })

    expect(css).toContain('font: inherit;')
    expect(css).toContain('animation: revert-layer;')
  })

  it('an invalid value is one diagnostic naming the property and the reason', () => {
    const error = expectVanityError(
      () => emit(() => {
        const { class: style } = definePrismSystem()
        style({ borderRadius: '8pxx' })
      }),
      'VANITY_CSS_INVALID_VALUE',
      /borderRadius: '8pxx' does not parse as a border-radius value/,
    )

    expect(error.diagnostics).toHaveLength(1)
  })

  it('an unknown property that slipped past the types dies at build with the fix', () => {
    expectVanityError(
      () => emit(() => {
        const { class: style } = definePrismSystem()
        style({ paddin: '8px' } as never)
      }),
      'VANITY_CSS_UNKNOWN_PROPERTY',
      /paddin is not a CSS property — did you mean 'padding'\?/,
    )
  })

  it('an unknown condition in a property-first map suggests the near miss', () => {
    expectVanityError(
      () => emit(() => {
        const { class: style } = definePrismSystem()
        style({ color: { hovr: 'red' } } as never)
      }),
      'VANITY_CSS_UNKNOWN_CONDITION',
      /color\.hovr is not a condition of this system — did you mean 'hover'\?/,
    )
  })

  it('an unknown layer suggests the declared order', () => {
    expectVanityError(
      () => emit(() => {
        const { class: style } = definePrismSystem()
        style.layer('overides' as never)({})
      }),
      'VANITY_SYSTEM_UNKNOWN_LAYER',
      /'overides' is not a layer of this system — did you mean 'overrides'\?/,
    )
  })

  it('legibleOn in a rule position redirects to the graph', () => {
    expectVanityError(
      () => emit(() => {
        const { class: style, t } = definePrismSystem()
        style({ color: legibleOn(t.color.brand) as never })
      }),
      'VANITY_CSS_INVALID_VALUE',
      /legibleOn, which is graph knowledge/,
    )
  })

  it('color helpers serialize in rule positions, folding static endpoints', () => {
    const { css } = emit(() => {
      const system = definePrismSystem()
      system.class({
        background: system.alpha(system.oklch(0.6, 0.1, 285), 0.5),
        outlineColor: system.alpha(system.t.color.brand, 0.42),
      }, 'helper')
    })

    expect(css).toContain('background: oklch(0.6 0.1 285 / 0.5);')
    expect(css).toContain('outline-color: oklch(from var(--vanity-color-brand) l c h / 0.42);')
  })

  it('a condition key holding a plain value is refused with the shape', () => {
    expectVanityError(
      () => emit(() => {
        const { class: style } = definePrismSystem()
        style({ hover: 'red' } as never)
      }),
      'VANITY_CSS_INVALID_KEY',
      /hover is a condition, so it takes a nested rule/,
    )
  })

  it('nested layer keys are refused — a style lives in one layer', () => {
    expectVanityError(
      () => emit(() => {
        const { class: style } = definePrismSystem()
        style({ hover: { layer: 'overrides' } } as never)
      }),
      'VANITY_CSS_INVALID_KEY',
      /layer placement is emitter configuration/,
    )
  })

  it('two nested container conditions are refused honestly', () => {
    expectVanityError(
      () => emit(() => {
        const { class: style } = definePrismSystem()
        style({ cardWide: { '@container page (min-width: 800px)': { padding: 0 } } })
      }),
      'VANITY_CSS_INVALID_KEY',
      /nests two container conditions/,
    )
  })

  it('@keyframes as a key redirects to keyframes()', () => {
    expectVanityError(
      () => emit(() => {
        const { class: style } = definePrismSystem()
        style({ '@keyframes spin': { from: { rotate: '0deg' } } } as never)
      }),
      'VANITY_CSS_INVALID_KEY',
      /an animation is a value/,
    )
  })
})

describe('keyframes diagnostics', () => {
  it('a condition inside a step is refused at the key', () => {
    expectVanityError(
      () => emit(() => {
        const { keyframes } = definePrismSystem()
        keyframes({ from: { hover: { opacity: 0 } } } as never)
      }),
      'VANITY_CSS_INVALID_KEY',
      /from\.hover — conditions and selectors are meaningless inside a keyframe step/,
    )
  })

  it('a non-step time is refused', () => {
    expectVanityError(
      () => emit(() => {
        const { keyframes } = definePrismSystem()
        keyframes({ hover: { opacity: 0 } } as never)
      }),
      'VANITY_CSS_INVALID_KEY',
      /'hover' is not a keyframe step/,
    )
  })
})

describe('raw diagnostics', () => {
  it('a block that does not parse names the failure', () => {
    expectVanityError(
      () => emit(() => {
        const { raw } = definePrismSystem()
        return raw`h2 { color: junk( }`
      }),
      'VANITY_CSS_INVALID_RAW',
      /this raw block does not parse/,
    )
  })

  it('an empty declaration inside raw is an invalid value, not a silent drop', () => {
    expectVanityError(
      () => emit(() => {
        const { raw } = definePrismSystem()
        return raw`h2 { margin-block: }`
      }),
      'VANITY_CSS_INVALID_VALUE',
      /margin-block/,
    )
  })

  it('typos inside raw die like typos anywhere', () => {
    expectVanityError(
      () => emit(() => {
        const { raw } = definePrismSystem()
        return raw`a { text-underline-offst: 2px; }`
      }),
      'VANITY_CSS_UNKNOWN_PROPERTY',
      /text-underline-offst is not a CSS property — did you mean 'text-underline-offset'\?/,
    )
  })

  it('@keyframes inside raw redirects to keyframes()', () => {
    expectVanityError(
      () => emit(() => {
        const { raw } = definePrismSystem()
        return raw`@keyframes spin { from { opacity: 0 } }`
      }),
      'VANITY_CSS_INVALID_RAW',
      /an animation is a value/,
    )
  })
})

describe('rules() diagnostics', () => {
  it('a selector that does not parse is refused', () => {
    expectVanityError(
      () => emit(() => {
        const { rules } = definePrismSystem()
        rules({ 'html >': { margin: 0 } })
      }),
      'VANITY_CSS_INVALID_SELECTOR',
      /'html >' does not parse/,
    )
  })
})
