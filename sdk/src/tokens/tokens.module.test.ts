import {
  createSystem,
  defineCssSupportTarget,
  length,
  VanityError,
} from '@mszr/vanity'
import { restoreToken } from '@mszr/vanity/runtime'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { substrate } from '../substrate'

function inSystemScope<T>(body: () => T): T {
  return substrate.modules.runInFileScope({
    filePath: 'src/tokens/tokens.module.system.ts',
    packageName: '@vanity/fixture',
  }, body)
}

function emitSystem<T extends { readonly class: unknown }>(system: T): T {
  void system.class
  return system
}

describe('token-module traits and handles', () => {
  it('makes shorthand reactive by default and keeps the explicit folded form', () => {
    const open = createSystem()
    const module = open.defineTokens({
      color: {
        brand: open.oklch(0.58, 0.2, 285),
        constant: open.tdef({
          val: open.oklch(0.4, 0.1, 120),
          reference: 'val',
          emit: false,
        }),
      },
    }).add(m => ({
      color: {
        brandSoft: open.alpha(m.color.brand, 0.12),
        constantSoft: open.alpha(m.color.constant, 0.2),
      },
    }))

    const { css, returned: ds } = emit(() => inSystemScope(() => emitSystem(
      open.addTokens(module).consolidate({ prefix: 'app' }),
    )))

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

  it('projects modules and arbitrary resolved selections with final names', () => {
    const open = createSystem()
    const colors = open.defineTokens({
      color: { brand: open.oklch(0.58, 0.2, 285) },
    }).add(m => ({ color: { soft: open.alpha(m.color.brand, 0.12) } }))
    const space = open.defineTokens({ space: { sm: length.rem(0.5) } })
    const { returned: ds } = emit(() => inSystemScope(() => emitSystem(
      open.addTokens(colors).addTokens(space).consolidate({ prefix: 'prism' }),
    )))

    const projected = ds.tokensOf(colors)
    expect(projected.color.brand).toBe(ds.t.color.brand)
    expect(projected.color.soft).toBe(ds.t.color.soft)
    expect(ds.namesOf(colors)).toEqual({
      color: { brand: '--prism-color-brand', soft: '--prism-color-soft' },
    })
    expect(ds.varsOf(colors)).toEqual({
      color: { brand: 'var(--prism-color-brand)', soft: 'var(--prism-color-soft)' },
    })
    expect(ds.namesOf({
      color: { brand: ds.t.color.brand, soft: ds.t.color.soft },
      space: { sm: ds.t.space.sm },
    })).toEqual({
      color: { brand: '--prism-color-brand', soft: '--prism-color-soft' },
      space: { sm: '--prism-space-sm' },
    })

    const foreign = open.defineTokens({ icon: { size: length.rem(1) } })
    expect(() => ds.tokensOf(foreign)).toThrowError(VanityError)
  })

  it('applies system token defaults once to shorthand and omitted config fields', () => {
    const open = createSystem({ tokens: { reference: 'val', emit: false } })
    const { css, returned: ds } = emit(() => inSystemScope(() => emitSystem(
      open.addTokens({
        space: {
          sm: length.rem(0.5),
          md: open.tdef({ val: length.rem(1) }),
        },
      }).consolidate(),
    )))

    expect(ds.t.space.sm.$reference).toBe('val')
    expect(ds.t.space.md.$reference).toBe('val')
    expect(String(ds.t.space.sm)).toBe('0.5rem')
    expect(css).not.toContain('--vanity-space-sm')
    expect(css).not.toContain('--vanity-space-md')
  })

  it('never raises the configured browser-support floor silently', () => {
    const open = createSystem({
      support: defineCssSupportTarget({
        id: 'without-relative-color',
        features: ['color-level-4', 'custom-properties'],
      }),
    })
    const module = open.defineTokens({
      color: { brand: open.oklch(0.58, 0.2, 285) },
    }).add(m => ({ color: { soft: open.alpha(m.color.brand, 0.12) } }))

    const consolidate = () => emit(() => inSystemScope(() => emitSystem(
      open.addTokens(module).consolidate(),
    )))
    expect(consolidate).toThrow(/relative-color.*without-relative-color/)
    expect(consolidate).toThrow(/reference: 'val'/)
  })

  it('restores the same handle and branch semantics in application code', () => {
    const restored = restoreToken({
      name: '--app-color-accent',
      path: 'color.accent',
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
    expect((restored as any).name).not.toBe('--app-color-accent')
    expect('var' in restored).toBe(false)
    expect('path' in restored).toBe(false)
    expect('reference' in restored).toBe(false)
    expect('mutable' in restored).toBe(false)
    expect('mode' in restored).toBe(false)
    expect(restored.$var()).toBe('var(--app-color-accent)')
    expect(restored.$description).toBe('Accent')
    expect(restored.$metadata).toEqual({ owner: 'brand' })
    expect(restored.$axes.scheme!.dark!.$val).toBe('oklch(0.7 0.15 285)')
    expect(restored.$case({ density: 'compact', scheme: 'dark' }).$val).toBe('oklch(0.75 0.12 285)')
  })
})
