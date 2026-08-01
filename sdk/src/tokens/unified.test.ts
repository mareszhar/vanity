import {
  colorSchemes,
  condition,
  container,
  createSystem,
  data,
  defineTokens,
  exportDesignTokens,
  importDesignTokens,
  media,
  moduleRoot,
  scope,
  selector,
  supports,
  systemRoot,
  thisMode,
} from '@mszr/vanity'
import { describe, expect, it } from 'vitest'

describe('unified token builder', () => {
  it('supports all four additive forms, portable handoff, nested mounting, and rebinding refs', () => {
    const portable = defineTokens({ seed: 'red' })
    const palette = portable
      .add('alias', portable.refs.seed)
      .add('accent', tokens => tokens.alias)
      .add(tokens => ({ contrast: tokens.seed }))
    const nested = createSystem()
      .defineTokens({
        color: palette,
        space: { sm: '4px' },
      })
      .add('radius', '6px')
    const ds = createSystem().addTokens(nested).consolidate({ prefix: 'unified' })

    expect(ds.t.color.seed.$val).toBe('red')
    expect(ds.t.color.alias.$val).toBe('var(--unified-color-seed)')
    expect(ds.t.color.accent.$val).toBe('var(--unified-color-alias)')
    expect(ds.t.color.contrast.$val).toBe('var(--unified-color-seed)')
    expect(ds.t.radius.$name).toBe('--unified-radius')
  })

  it('rebinds expressions authored from lazy refs, not only direct aliases', () => {
    const open = createSystem()
    const palette = open.defineTokens({
      brand: open.oklch(0.6, 0.15, 264),
    })
    const complete = palette.add('soft', open.alpha(palette.refs.brand, 0.2))
    const ds = open.addTokens(open.defineTokens({
      first: complete,
      second: complete,
    })).consolidate({ prefix: 'lazy-expression' })

    expect(ds.t.first.soft.$val).toContain('var(--lazy-expression-first-brand)')
    expect(ds.t.second.soft.$val).toContain('var(--lazy-expression-second-brand)')
    expect(ds.t.first.soft.$val).not.toContain('--module-brand')
  })

  it('keeps the top-level builder portable and the $ namespace fenced', () => {
    const open = createSystem()

    expect(() => defineTokens({
      invalid: open.tdef({ val: 'red' }),
    } as any)).toThrow(/cannot use system-bound tdef/)
    expect(() => defineTokens().add('invalid', {
      val: 'red',
      mutable: true,
    } as any)).toThrow(/plain values and callbacks/)
    expect(() => open.defineTokens({
      $root: '#legacy',
    } as any)).toThrow(/cannot begin with '\$'/)
  })

  it('authors raw named config, tdef reservations, axis methods, and group $axes', () => {
    const open = createSystem().addAxis('scheme', colorSchemes({ locality: 'root' }))
    const module = open.defineTokens({
      color: {
        brand: open.tdef({ val: 'red', mutable: true }).scheme({
          light: 'tomato',
          dark: 'maroon',
        }),
        canvas: open.tdef.color({ mutable: true }),
        dynamic: open.tdef({
          val: 'red',
          axes: {
            scheme: mode => mode === 'dark' ? 'maroon' : 'tomato',
          },
        }),
        derived: open.tdef({ val: 'red' })
          .scheme({ light: 'pink' })
          .scheme({ dark: modes => modes.light }),
        $axes: {
          scheme: mode => ({
            canvas: mode === 'dark' ? '#111' : '#fff',
          }),
        },
      },
    }).add('focus', { val: 'blue', description: 'Focus color' })
    const ds = open.addTokens(module).consolidate({ prefix: 'axis-token' })

    expect(ds.t.color.brand.$axes.scheme.light.$val).toBe('tomato')
    expect(ds.t.color.brand.$axes.scheme.dark.$val).toBe('maroon')
    expect(ds.t.color.canvas.$axes.scheme.light.$val).toBe('#fff')
    expect(ds.t.color.canvas.$axes.scheme.dark.$val).toBe('#111')
    expect(ds.t.color.dynamic.$axes.scheme.dark.$val).toBe('maroon')
    expect(ds.t.color.derived.$axes.scheme.dark.$val).toBe('pink')
    expect(ds.t.focus.$description).toBe('Focus color')
  })

  it('keeps unconditional base values distinct from nominal axis defaults', () => {
    const open = createSystem().addAxis('state', {
      modes: {
        rest: '&',
        active: data('state', 'active'),
      },
      default: 'rest',
    })
    const ds = open.addTokens(open.defineTokens({
      inferred: open.tdef({
        axes: {
          state: {
            rest: 'gray',
            active: 'red',
          },
        },
      }),
      filled: open.tdef({
        val: 'blue',
        axes: {
          state: {
            active: 'navy',
          },
        },
      }),
      distinct: open.tdef({
        val: 'transparent',
        axes: {
          state: {
            rest: 'white',
            active: 'black',
          },
        },
      }),
    })).consolidate({ prefix: 'base-default' })

    expect(ds.t.inferred.$val).toBe('gray')
    expect(ds.t.inferred.$axes.state.rest.$val).toBe('gray')
    expect(ds.t.filled.$axes.state.rest.$val).toBe('blue')
    expect(ds.t.distinct.$val).toBe('transparent')
    expect(ds.t.distinct.$axes.state.rest.$val).toBe('white')
  })

  it('requires an explicit base when independent axis defaults disagree', () => {
    const open = createSystem()
      .addAxis('scheme', colorSchemes())
      .addAxis('density', {
        modes: {
          cozy: '&',
          compact: data('density', 'compact'),
        },
        default: 'cozy',
      })

    expect(() => open.addTokens(open.defineTokens({
      ambiguous: open.tdef({
        axes: {
          scheme: { light: 'white', dark: 'black' },
          density: { cozy: 'gray', compact: 'silver' },
        },
      }),
    })).consolidate({ prefix: 'ambiguous-defaults' })).toThrow(
      /explicit val.*different default-mode candidates/,
    )
  })

  it('augments empty base/branch slots and preserves shape through overwrites', () => {
    const open = createSystem().addAxis('density', {
      modes: {
        cozy: '&',
        compact: data('density', 'compact'),
      },
      default: 'cozy',
    })
    const staged = open.addTokens(open.defineTokens({
      optional: open.tdef.color({ mutable: true }),
      control: open.tdef({
        val: '12px',
        mutable: true,
        axes: {
          density: {
            compact: null,
          },
        },
      }),
    }))
      .augmentTokens({
        optional: token => token.val('rebeccapurple'),
        control: token => token.density({ compact: '8px' }),
      })
      .overwriteTokens({
        control: token => token.val('14px'),
      })
    const ds = staged.consolidate({ prefix: 'patch-slots' })

    expect(ds.t.optional.$val).toBe('rebeccapurple')
    expect(ds.t.optional.$type).toBe('color')
    expect(ds.t.control.$val).toBe('14px')
    expect(ds.t.control.$axes.density.compact.$val).toBe('8px')
    expect(ds.t.control.$mutable).toBe(true)
  })

  it('preserves authored unified modules through DTCG projection', () => {
    const open = createSystem().addAxis('scheme', colorSchemes({ locality: 'root' }))
    const module = open.defineTokens({
      color: {
        brand: open.tdef({
          val: 'red',
          mutable: true,
          description: 'Portable brand',
          axes: { scheme: { dark: 'maroon' } },
        }),
      },
    }).add('alias', refs => refs.color.brand)
    const ds = open.addTokens(module).consolidate({ prefix: 'dtcg-unified' })
    const document = exportDesignTokens(ds, { mode: 'authored' }) as any

    expect(document.$extensions['com.mszr.vanity']).toMatchObject({
      mode: 'authored',
      tokens: {
        'color.brand': {
          description: 'Portable brand',
          mutable: true,
        },
        'alias': {
          val: expect.objectContaining({
            dependencies: [
              expect.objectContaining({ path: 'color.brand' }),
            ],
          }),
        },
      },
    })

    const restored = importDesignTokens(document, { system: open })
    const roundTrip = open.addTokens(restored).consolidate({ prefix: 'dtcg-restored' })
    const restoredBrand = (roundTrip.t as any).color.brand
    expect(restoredBrand.$val).toBe('red')
    expect(restoredBrand.$axes.scheme.dark.$val).toBe('maroon')
    expect(restoredBrand.$mutable).toBe(true)
  })
})

describe('condition AST and public axes', () => {
  it('lowers algebra, ranges, scopes, and anchors without a private string dialect', () => {
    const algebra = selector('&:hover')
      .or('&:focus-visible')
      .and(media({ width: { '>=': '600px', '<': '1200px' } }))
      .and(supports('(display: grid)'))
    const scoped = scope('.card').to('.card-media').and('& > img')

    expect(algebra.arms).toHaveLength(2)
    expect(algebra.arms[0]).toMatchObject({
      media: '(600px <= width < 1200px)',
      supports: '(display: grid)',
    })
    expect(scoped.arms[0]).toMatchObject({
      scopes: ['(.card) to (.card-media)'],
      selector: '& > img',
    })
    expect(data('state', 'open').compiled).toBe('[data-state=\'open\']')
    expect(condition('&:active').not().arms[0]?.selector).toBe('&:not(:active)')
    expect(systemRoot.ast).toEqual({ kind: 'anchor', anchor: 'system-root' })
    expect(moduleRoot.ast).toEqual({ kind: 'anchor', anchor: 'module-root' })
    expect(thisMode.ast).toEqual({ kind: 'anchor', anchor: 'this-mode' })
  })

  it('negates native condition kinds, deduplicates arms, and bounds expansion', () => {
    expect(selector('&:hover').not().arms[0]?.selector).toBe('&:not(:hover)')
    expect(media('(hover: hover)').not().arms[0]?.media).toBe('not (hover: hover)')
    expect(supports('(display: grid)').not().arms[0]?.supports).toBe('not (display: grid)')
    expect(container('card', '(width > 10px)').not().arms[0]?.container)
      .toBe('card not (width > 10px)')
    expect(selector('&:hover').or('&:hover').arms).toHaveLength(1)
    expect(() => scope('.card').not()).toThrow(/@scope conditions cannot be negated/)
    expect(() => media({ orientation: { '>': 'portrait' } } as any)).toThrow(
      /not a range-capable/,
    )

    const pair = selector('&.a').or('&.b')
    let expanded = pair
    for (let index = 0; index < 5; index++)
      expanded = expanded.and(pair)
    expect(expanded.arms).toHaveLength(64)
    expect(() => expanded.and(pair)).toThrow(/supported maximum is 64/)
  })

  it('accepts direct and callback axes and finalizes one exhaustive order', () => {
    const open = createSystem()
      .addConditions({ wide: media({ minWidth: '60rem' }) })
      .addAxis('density', {
        modes: {
          compact: data('density', 'compact'),
          cozy: '&',
        },
        default: 'cozy',
      })
      .addAxis('viewport', ds => ({
        modes: {
          narrow: '&',
          wide: ds.conditions.wide,
        },
        default: 'narrow',
      }))
      .addTokens({
        space: {
          control: '12px',
        },
      })
    const ds = open.consolidate({
      prefix: 'ordered',
      axisOrder: ['viewport', 'density'],
    })

    expect(ds.introspect().runtime.axisOrder).toEqual(['viewport', 'density'])
    expect(ds.introspect().conditions.wide.ast).toEqual({
      kind: 'media',
      query: '(min-width: 60rem)',
    })
  })
})
