/**
 * The runtime evidence dimension: recipe/anatomy resolution — props in, classes out,
 * unknown keys ignored, defaults filling gaps — and the diagnostics contract:
 * exactly one per mistake, at the offending key, naming the fix
 * ([patterns.md §10], [spec-recipes.md]).
 */

import { VanityError } from '@mszr/vanity'
import { definePrismSystem, emit } from '@test'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

/** The spec button ([spec-recipes.md §1]) over the Prism system. */
function specButton() {
  const system = definePrismSystem()
  const { recipe, t } = system

  const button = recipe({
    base: { display: 'inline-flex', gap: t.space.xs, borderRadius: t.radius.sm },
    variants: {
      intent: {
        brand: { background: t.color.brand, color: t.color.onBrand, hover: { background: t.color.brandHover } },
        ghost: { background: 'transparent', color: t.color.ink, hover: { background: t.color.brandSoft } },
        danger: { background: 'crimson', color: 'white' },
      },
      size: {
        sm: { paddingInline: t.space.sm, minBlockSize: 32 },
        md: { paddingInline: t.space.md, minBlockSize: 40 },
      },
    },
    toggles: {
      pill: { borderRadius: t.radius.pill },
    },
    compound: [
      { when: { intent: 'ghost', size: 'sm' }, style: { paddingInline: t.space.xs } },
    ],
    defaults: { intent: 'brand', size: 'md' },
  }, 'button')

  return { button, system }
}

describe('recipe resolution', () => {
  it('no arguments yields the defaults', () => {
    const { returned: button } = emit(() => specButton().button)

    // `size: md` folds into base (sm covers it); `intent: brand` cannot fold
    // (danger declares no hover arm), so the default case wears its class.
    expect(button()).toBe(`${button} ${button({ intent: 'brand' }).split(' ')[1]}`)
    expect(button()).toContain('button__')
    expect(button()).toContain('button_intent_brand__')
  })

  it('resolves variants, toggles, and compound entries to precompiled classes', () => {
    const { returned: button } = emit(() => specButton().button)

    const resolved = button({ intent: 'ghost', size: 'sm', pill: true })

    expect(resolved).toContain('button_intent_ghost__')
    expect(resolved).toContain('button_size_sm__')
    expect(resolved).toContain('button_pill__')
    expect(resolved).toContain('button_compound_0__')
  })

  it('compound entries match resolved values, defaults included', () => {
    const { returned: button } = emit(() => specButton().button)

    // size defaults to md — the ghost+sm compound must not fire.
    expect(button({ intent: 'ghost' })).not.toContain('button_compound_0__')
    expect(button({ intent: 'ghost', size: 'sm' })).toContain('button_compound_0__')
  })

  it('a wider props object just works — unknown keys are ignored', () => {
    const { returned: button } = emit(() => specButton().button)

    const props = { intent: 'ghost', disabled: true, href: '/x', onClick: () => {} }

    expect(button(props as never)).toBe(button({ intent: 'ghost' }))
  })

  it('publishes the typed variant map, toggles, and defaults', () => {
    const { returned: button } = emit(() => specButton().button)

    expect(button.variants).toEqual({ intent: ['brand', 'ghost', 'danger'], size: ['sm', 'md'] })
    expect(button.toggles).toEqual(['pill'])
    expect(button.defaults).toEqual({ intent: 'brand', size: 'md' })
  })

  it('interpolates as its base class — every instance wears it', () => {
    const { returned: button } = emit(() => specButton().button)

    expect(`${button}`).toBe(button().split(' ')[0])
  })
})

describe('published ports', () => {
  it('rides the recipe: one import gives classes and the style API', () => {
    const { returned } = emit(() => {
      const { recipe, port, t } = definePrismSystem()
      const paddingX = port(t.space.md, { label: 'paddingX' })

      const button = recipe({
        ports: { paddingX },
        base: { paddingInline: paddingX },
      }, 'button')

      return { button, paddingX }
    })

    expect(returned.button.ports.paddingX).toBe(returned.paddingX)
    expect(returned.button.ports.paddingX.dec('24px')).toEqual({
      [returned.paddingX.name]: '24px',
    })
  })

  it('a static set inside a consumer rule compiles away entirely', () => {
    const { css: emitted, returned } = emit(() => {
      const system = definePrismSystem()
      const paddingX = system.port('16px', { label: 'paddingX' })
      const button = system.recipe({ ports: { paddingX }, base: { paddingInline: paddingX } }, 'button')

      return system.class({ display: 'flex', ...button.ports.paddingX.dec(system.t.space.lg) }, 'toolbar')
    })

    expect(typeof returned).toBe('string')
    expect(emitted).toMatch(/--vanity-paddingX__[\w-]+: var\(--vanity-space-lg\)/)
  })

  it('publication takes port handles only', () => {
    expectVanityError(
      () => emit(() => {
        const { recipe } = definePrismSystem()
        recipe({ ports: { gap: '8px' } } as never)
      }),
      'VANITY_RECIPE_INVALID_KEY',
      /ports\.gap is not a port/,
    )
  })
})

describe('anatomy resolution', () => {
  function specDialog() {
    const system = definePrismSystem()
    const { anatomy, t } = system

    return anatomy({
      parts: ['root', 'backdrop', 'content', 'title'],
      base: {
        backdrop: { position: 'fixed', inset: 0 },
        content: {
          'borderRadius': t.radius.md,
          'root:open': { borderStartStartRadius: 0 },
        },
        title: { fontWeight: 600 },
      },
      variants: {
        size: {
          sm: { content: { maxInlineSize: '28rem' } },
          lg: { content: { maxInlineSize: '52rem' } },
        },
      },
      defaults: { size: 'sm' },
    }, 'dialog')
  }

  it('a call returns a typed record of part classes — every declared part present', () => {
    const { returned: dialog } = emit(() => specDialog())

    const d = dialog({ size: 'lg' })

    expect(Object.keys(d)).toEqual(['root', 'backdrop', 'content', 'title'])
    expect(d.content).toContain('dialog_content__')
    expect(d.content).toContain('dialog_size_lg_content__')
    expect(d.root).toContain('dialog_root__')
  })

  it('parts carries each part\'s stable class for cross-file references', () => {
    const { returned: dialog } = emit(() => specDialog())

    expect(dialog.parts.content).toContain('dialog_content__')
    expect(dialog({ size: 'lg' }).content.startsWith(dialog.parts.content)).toBe(true)
  })
})

describe('diagnostics', () => {
  it('a layer key inside an arm is refused — a recipe lives in one layer', () => {
    expectVanityError(
      () => emit(() => {
        const { recipe } = definePrismSystem()
        recipe({ variants: { size: { sm: { layer: 'overrides' } } } } as never)
      }),
      'VANITY_RECIPE_INVALID_KEY',
      /variants\.size\.sm\.layer — a recipe lives in one layer/,
    )
  })

  it('a typo inside an arm names the full path', () => {
    expectVanityError(
      () => emit(() => {
        const { recipe } = definePrismSystem()
        recipe({ variants: { intent: { brand: { paddin: 8 } } } } as never)
      }),
      'VANITY_CSS_UNKNOWN_PROPERTY',
      /variants\.intent\.brand\.paddin — paddin is not a CSS property — did you mean 'padding'\?/,
    )
  })

  it('an impossible compound combination names the valid set', () => {
    const error = expectVanityError(
      () => emit(() => {
        const { recipe } = definePrismSystem()
        recipe({
          variants: { size: { sm: {}, md: {} } },
          compound: [{ when: { size: 'xl' }, style: { padding: 0 } }],
        } as never)
      }),
      'VANITY_RECIPE_UNKNOWN_VALUE',
      /compound\.0\.when\.size is "xl", which size does not declare — valid values: sm, md/,
    )

    expect(error.diagnostics).toHaveLength(1)
  })

  it('an unknown axis in defaults suggests the near miss', () => {
    expectVanityError(
      () => emit(() => {
        const { recipe } = definePrismSystem()
        recipe({
          variants: { intent: { brand: {} } },
          defaults: { intnet: 'brand' },
        } as never)
      }),
      'VANITY_RECIPE_UNKNOWN_VARIANT',
      /defaults\.intnet names no declared variant or toggle — did you mean 'intent'\?/,
    )
  })

  it('an undeclared part errors at the key with the declared set', () => {
    expectVanityError(
      () => emit(() => {
        const { anatomy } = definePrismSystem()
        anatomy({
          parts: ['root', 'content'],
          base: { contnet: { padding: 8 } },
        } as never)
      }),
      'VANITY_ANATOMY_UNKNOWN_PART',
      /base\.contnet is not a declared part — this anatomy has: root, content — did you mean 'content'\?/,
    )
  })

  it('a part-scoped condition over an unknown part names the parts', () => {
    expectVanityError(
      () => emit(() => {
        const { anatomy } = definePrismSystem()
        anatomy({
          parts: ['root', 'content'],
          base: { content: { 'roto:open': { padding: 0 } } },
        } as never)
      }),
      'VANITY_ANATOMY_UNKNOWN_PART',
      /'roto:open' scopes to 'roto', which is not a declared part.*did you mean 'root:open'\?/,
    )
  })

  it('a part-scoped condition with no element state is refused with the reason', () => {
    expectVanityError(
      () => emit(() => {
        const { anatomy } = definePrismSystem()
        anatomy({
          parts: ['root', 'content'],
          base: { content: { 'root:md': { padding: 0 } } },
        } as never)
      }),
      'VANITY_ANATOMY_INVALID_CONDITION',
      /'root:md' — 'md' holds no element state/,
    )
  })

  it('an anatomy without parts states the shape', () => {
    expectVanityError(
      () => emit(() => {
        const { anatomy } = definePrismSystem()
        anatomy({ parts: [] } as never)
      }),
      'VANITY_ANATOMY_UNKNOWN_PART',
      /an anatomy declares its parts as a non-empty array/,
    )
  })
})

describe('the untyped edge', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('an undeclared value warns once with the valid set and falls back to the default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { returned: button } = emit(() => specButton().button)

    const resolved = button({ intent: 'brnd' } as never)

    expect(resolved).toBe(button())
    button({ intent: 'brnd' } as never)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('[vanity] button: intent got "brnd" — valid values: brand, ghost, danger')
  })
})
