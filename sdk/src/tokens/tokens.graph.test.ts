import { restoreToken } from '@mszr/vanity/runtime'
import { emit } from '@test'
import { createEngine, defineCssSupportTarget, VanityError } from '@test/legacy'
import { describe, expect, it } from 'vitest'

describe('token-graph traits and handles', () => {
  it('makes shorthand reactive by default and keeps the explicit folded lane', () => {
    const de = createEngine()
    const module = de.defineTokens({
      color: {
        brand: de.oklch(0.58, 0.2, 285),
        constant: de.token({
          val: de.oklch(0.4, 0.1, 120),
          reference: 'val',
          emit: false,
        }),
      },
    }).derive(({ color }) => ({
      color: {
        brandSoft: de.alpha(color.brand, 0.12),
        constantSoft: de.alpha(color.constant, 0.2),
      },
    }))

    const { css, returned: ds } = emit(() => de.createSystem({ tokens: module, prefix: 'app' }))

    expect(ds.t.color.brand.$reference).toBe('var')
    expect(ds.t.color.brand.$emit).toBe(true)
    expect(String(ds.t.color.brand)).toBe('var(--app-color-brand)')
    expect(ds.t.color.brand.$val).toBe('oklch(0.58 0.2 285)')
    expect(ds.t.color.brand.$var('currentColor')).toBe('var(--app-color-brand, currentColor)')
    expect(css).toContain('--app-color-brand-soft: oklch(from var(--app-color-brand) l c h / 0.12);')

    expect(ds.t.color.constant.$reference).toBe('val')
    expect(ds.t.color.constant.$emit).toBe(false)
    expect(String(ds.t.color.constant)).toBe('oklch(0.4 0.1 120)')
    expect(css).not.toContain('--app-color-constant:')
    expect(css).toContain('--app-color-constant-soft: oklch(0.4 0.1 120 / 0.2);')
  })

  it('represents no-default bases and exact authored branches without sentinels', () => {
    const de = createEngine().axes(({ axis, data }) => ({
      scheme: axis({ modes: { dark: data('scheme', 'dark'), contrast: data('scheme', 'contrast') } }),
      density: axis({ modes: { compact: data('density', 'compact') } }),
    }))
    const { css, returned: ds } = emit(() => de.createSystem({
      tokens: de.defineTokens({
        fill: null,
        semantic: {
          $description: 'Group metadata does not reserve ordinary keys',
          val: 'value-token',
          axes: 'axes-token',
          emit: 'emit-token',
        },
        color: {
          future: de.token.color({
            mutable: true,
            register: { inherits: true, initialVal: de.oklch(0.5, 0, 0) },
          }),
          accent: de.token({
            val: de.oklch(0.58, 0.2, 285),
            mutable: true,
            description: 'Interactive accent',
            metadata: { owner: 'brand' },
            register: { inherits: true },
            validate: { id: 'brand-color' },
            axes: {
              scheme: {
                dark: null,
                contrast: de.oklch(0.72, 0.14, 285),
              },
            },
            cases: [{
              when: { scheme: 'dark', density: 'compact' },
              val: de.oklch(0.76, 0.12, 285),
            }],
          }),
        },
      }),
    }))

    expect(ds.t.fill.$val).toBeUndefined()
    expect(ds.t.semantic.val.$val).toBe('value-token')
    expect(ds.t.semantic.axes.$val).toBe('axes-token')
    expect(ds.t.semantic.emit.$val).toBe('emit-token')
    expect(ds.t.fill.$name).toBe('--vanity-fill')
    expect(ds.t.color.future.$type).toBe('color')
    expect(ds.t.color.future.$val).toBeUndefined()
    expect(ds.t.color.future.$mutable).toBe(true)
    expect(ds.t.color.accent.$description).toBe('Interactive accent')
    expect(ds.t.color.accent.$metadata).toEqual({ owner: 'brand' })
    expect(ds.t.color.accent.$register).toEqual({ inherits: true })
    expect(ds.t.color.accent.$validate).toEqual({ id: 'brand-color' })
    expect(ds.t.color.accent.$mutable).toBe(true)
    expect(ds.t.color.accent.$axes.scheme.dark.$val).toBeUndefined()
    expect(ds.t.color.accent.$axes.scheme.contrast.$val).toBe('oklch(0.72 0.14 285)')
    expect(ds.t.color.accent.$case({ density: 'compact', scheme: 'dark' }).$val)
      .toBe('oklch(0.76 0.12 285)')
    expect(() => (ds.t.color.accent as any).$case({ scheme: 'light', density: 'compact' }))
      .toThrow(/no authored case/)
    expect(css).not.toContain('--vanity-fill:')
    expect(css).toMatch(/--vanity-color-future:\s*var\(--vanity-v-[a-z0-9]+\)/)
  })

  it('diagnoses trait conflicts at the configured field', () => {
    const de = createEngine().axes(({ axis, data }) => ({
      scheme: axis({ modes: { dark: data('scheme', 'dark') } }),
    }))
    expect(() => de.token({ val: 'red', mutable: true, reference: 'val' } as any))
      .toThrow(/token\.reference cannot be 'val'/)
    expect(() => de.token({ val: 'red', axes: { scheme: { dark: 'black' } }, emit: false } as any))
      .toThrow(/token\.emit cannot be false/)
    expect(() => de.token({ val: 'red', reference: 'var', emit: false } as any))
      .toThrow(/known nonemitted value/)
  })

  it('projects modules and arbitrary resolved selections with final names', () => {
    const de = createEngine()
    const colors = de.defineTokens({ color: { brand: de.oklch(0.58, 0.2, 285) } })
      .derive(({ color }) => ({ color: { soft: de.alpha(color.brand, 0.12) } }))
    const space = de.defineTokens({ space: { sm: de.length.rem(0.5) } })
    const { returned: ds } = emit(() => de.createSystem({
      tokens: de.defineTokens().compose(colors).compose(space),
      prefix: 'prism',
    }))

    expect(ds.tokensOf(colors)).toEqual({ color: { brand: ds.t.color.brand, soft: ds.t.color.soft } })
    expect(ds.namesOf(colors)).toEqual({
      color: { brand: '--prism-color-brand', soft: '--prism-color-soft' },
    })
    expect(ds.varsOf(colors)).toEqual({
      color: { brand: 'var(--prism-color-brand)', soft: 'var(--prism-color-soft)' },
    })
    expect(ds.namesOf({ color: ds.t.color, space: ds.t.space })).toEqual({
      color: { brand: '--prism-color-brand', soft: '--prism-color-soft' },
      space: { sm: '--prism-space-sm' },
    })

    const foreign = de.defineTokens({ icon: { size: de.length.rem(1) } })
    expect(() => ds.tokensOf(foreign)).toThrowError(VanityError)
  })

  it('applies engine token defaults once to shorthand and omitted config fields', () => {
    const de = createEngine({ tokens: { reference: 'val', emit: false } })
    const { css, returned: ds } = emit(() => de.createSystem({
      tokens: {
        space: {
          sm: de.length.rem(0.5),
          md: de.token({ val: de.length.rem(1) }),
        },
      },
    }))

    expect(ds.t.space.sm.$reference).toBe('val')
    expect(ds.t.space.md.$reference).toBe('val')
    expect(String(ds.t.space.sm)).toBe('0.5rem')
    expect(css).not.toContain('--vanity-space-sm')
    expect(css).not.toContain('--vanity-space-md')
  })

  it('never raises the configured browser-support floor silently', () => {
    const de = createEngine({
      support: defineCssSupportTarget({ id: 'without-relative-color', features: ['color-level-4', 'custom-properties'] }),
    })
    const tokens = de.defineTokens({ color: { brand: de.oklch(0.58, 0.2, 285) } })
      .derive(({ color }) => ({ color: { soft: de.alpha(color.brand, 0.12) } }))

    expect(() => emit(() => de.createSystem({ tokens }))).toThrow(/relative-color.*without-relative-color/)
    expect(() => emit(() => de.createSystem({ tokens }))).toThrow(/reference: 'val'/)
  })

  it('restores the same handle and branch semantics on the app plane', () => {
    const restored = restoreToken({
      name: '--app-color-accent',
      path: 'color.accent',
      mode: 'derived',
      reference: 'val',
      emit: false,
      mutable: true,
      type: 'color',
      value: 'oklch(0.6 0.2 285)',
      description: 'Accent',
      metadata: { owner: 'brand' },
      axes: { scheme: { dark: { value: 'oklch(0.7 0.15 285)' } } },
      cases: [{ when: { scheme: 'dark', density: 'compact' }, value: 'oklch(0.75 0.12 285)' }],
    })

    expect(String(restored)).toBe('oklch(0.6 0.2 285)')
    expect(restored.$var()).toBe('var(--app-color-accent)')
    expect(restored.$description).toBe('Accent')
    expect(restored.$metadata).toEqual({ owner: 'brand' })
    expect(restored.$axes.scheme!.dark!.$val).toBe('oklch(0.7 0.15 285)')
    expect(restored.$case({ density: 'compact', scheme: 'dark' }).$val).toBe('oklch(0.75 0.12 285)')
  })
})
