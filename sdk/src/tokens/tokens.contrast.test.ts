import type { VanityColorExpr } from './color'
import { describe, expect, it } from 'vitest'
import { colorSchemes, createSystem, VanityError } from '../index'
import { getTokenGraph } from './module'

function seeds(lightness: number, mutable: boolean) {
  const open = createSystem()
  const module = open.defineTokens()
    .add('base', { val: open.oklch(lightness, 0.15, 265), mutable })
    .add('level', { val: lightness, mutable })
    .add('hue', { val: 265, mutable })
    .add('zero', { val: 0, mutable })
    .add('weight', { val: open.percent(50), mutable })
  return { open, module }
}

type Seeds = ReturnType<typeof seeds>
type Refs = Seeds['module']['refs']
type Target = (open: Seeds['open'], refs: Refs, lightness: number) => ReturnType<Seeds['open']['oklch']> | ReturnType<Seeds['open']['legibleOn']> | Refs['base']

// Adding a color expression family requires evidence at its graph boundary.
const targets = {
  oklch: (open, _refs, l) => open.oklch(l, 0.15, 265),
  parse: (open, _refs, l) => open.color(`oklch(${l} 0.15 265)`),
  ref: (_open, refs) => refs.base,
  value: (open, refs) => open.oklch(refs.level, 0.15, refs.hue),
  alpha: (open, refs) => open.alpha(refs.base, 1),
  adjust: (open, refs) => open.oklch.darken(refs.base, 0),
  channels: (open, refs) => open.oklch.from(refs.base, { l: refs.level }),
  relative: (open, refs) => open.rgb.from(refs.base, { r: open.channel.add(refs.zero) }),
  mix: (open, refs) => open.colorMix([[refs.base, refs.weight], [refs.base, refs.weight]]).in('oklab'),
  scheme: (open, refs) => open.lightDark(refs.base, refs.base),
  contrast: (open, refs) => open.legibleOn(refs.base),
} satisfies Record<VanityColorExpr['kind'], Target>

function build(target: Target, lightness: number, mutable: boolean) {
  const { open, module } = seeds(lightness, mutable)
  return open.addTokens(module
    .add((refs) => {
      const bg = target(open, refs, lightness)
      return { bg, on: open.legibleOn(bg) }
    }))
    .consolidate({ prefix: 'contrast' })
}

describe('legibleOn authored contrast', () => {
  it.each(Object.entries(targets).filter(([kind]) => kind !== 'relative').flatMap(([kind, target]) => [
    { kind, target, mutable: false },
    { kind, target, mutable: true },
  ]))('checks $kind with mutable=$mutable at the authored value', ({ target, mutable }) => {
    expect(() => build(target, 0.58, mutable)).not.toThrow()
    try {
      build(target, 0.72, mutable)
      throw new Error('expected an illegible authored pairing to fail')
    }
    catch (error) {
      expect(error).toBeInstanceOf(VanityError)
      expect((error as VanityError).diagnostics.some(diagnostic => diagnostic.code === 'VANITY_TOKENS_CONTRAST')).toBe(true)
    }
  })

  it.each(Object.entries(targets))('classifies %s dependencies without folding away their CSS references', (kind, target) => {
    for (const mutable of [false, true]) {
      const { open, module } = seeds(0.58, mutable)
      const makeTarget: Target = target
      const ds = open.addTokens(module.add(refs => ({ bg: makeTarget(open, refs, 0.58) })))
        .consolidate({ prefix: 'contrast' })
      const graph = getTokenGraph(ds.t)!
      const result = graph.results.get('bg')!
      expect(result.traits.volatile).toBe(mutable && kind !== 'oklch' && kind !== 'parse')
      expect(result.traits.conditional).toBe(kind === 'scheme')
      if (['value', 'channels', 'relative', 'mix'].includes(kind))
        expect(result.emitted).toContain('var(--contrast-')
    }
  })

  it('keeps an actionable diagnostic for unsupported relative-color folds', () => {
    expect(() => build(targets.relative, 0.58, false)).toThrow(/rgb\(from …\).*cannot be folded/)
  })

  it('uses authored mix percentages when measuring the representative', () => {
    const open = createSystem()
    const module = open.defineTokens().add('weight', open.percent(0)).add(refs => ({ bg: open.colorMix([['white', refs.weight], [open.oklch(0.72, 0.15, 265), 100]]).in('oklab') })).add(refs => ({ on: open.legibleOn(refs.bg) }))
    expect(() => open.addTokens(module).consolidate({ prefix: 'weighted' })).toThrow(/VANITY_TOKENS_CONTRAST/)
  })

  it('follows immutable numeric derivations transitively', () => {
    const open = createSystem()
    const module = open.defineTokens().add('seed', 265).add(refs => ({ hue: open.calc(refs.seed).add(0) })).add(refs => ({ bg: open.oklch(0.72, 0.15, refs.hue) })).add(refs => ({ on: open.legibleOn(refs.bg) }))
    expect(() => open.addTokens(module).consolidate({ prefix: 'derived' })).toThrow(/VANITY_TOKENS_CONTRAST/)
  })

  it('checks every authored axis mode, including mutable defaults', () => {
    const open = createSystem().addAxis('scheme', colorSchemes())
    const module = open.defineTokens({
      bg: open.tdef.color({
        mutable: true,
        axes: { scheme: { light: 'white', dark: open.oklch(0.72, 0.15, 265) } },
      }),
    }).add(refs => ({ on: open.legibleOn(refs.bg) }))
    expect(() => open.addTokens(module).consolidate({ prefix: 'modes' })).toThrow(/VANITY_TOKENS_CONTRAST/)
  })
})
