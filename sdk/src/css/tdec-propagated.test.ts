import { colorSchemes, createSystem, data, rawValue } from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'

function axes() {
  return createSystem()
    .addAxis('density', { modes: { cozy: data('density', 'cozy'), compact: data('density', 'compact') }, default: 'cozy' })
    .addAxis('tone', { modes: { warm: data('tone', 'warm'), cool: data('tone', 'cool') }, default: 'warm' })
}

describe('propagated declaration boundaries', () => {
  it('refuses a folded case that an unconditional subtree declaration would hide', () => {
    const open = axes()
    const ds = open.addTokens(open.defineTokens().add('seed', open.color('#fff'))
      .add(m => ({ on: open.tdef({
        val: open.legibleOn(m.seed, { contrast: 0 }),
        cases: [{ when: { density: 'compact', tone: 'cool' }, val: open.color('black') }],
      }) }))).consolidate({ prefix: 'cases' })
    expect(() => emit(() => ds.tdec.propagated({ seed: '#000' }))).toThrow(/VANITY_TOKENS_INVALID_OVERRIDE.*case/s)
    expect(() => emit(() => ds.tdec.propagated({ seed: '#eee' }))).not.toThrow()
    expect(() => emit(() => ds.tdec.propagated({ seed: '#000', on: 'red' }))).not.toThrow()
  })

  it('checks axis intersections even when single-axis folds are unchanged', () => {
    const make = (seed: number) => {
      const open = axes()
      return open.addTokens(open.defineTokens()
        .add('seed', seed)
        .add('a', { val: 0, axes: { density: { compact: 1 } } })
        .add('b', { val: 0, axes: { tone: { cool: 1 } } })
        .add(m => ({ bg: open.oklch(open.calc(m.seed).multiply(m.a).multiply(m.b), 0, 0) }))
        .add(m => ({ on: open.legibleOn(m.bg, { contrast: 0 }) })))
        .consolidate({ prefix: 'intersection' })
    }
    const ds = make(0.2)
    expect(() => emit(() => ds.tdec.propagated({ seed: 0.9 }))).toThrow(/VANITY_TOKENS_INVALID_OVERRIDE.*(?:case|combination)/s)
    // The base pick stays white, but the intersection's black pick must be replaced.
    const uniform = make(0.9)
    expect(emit(() => uniform.tdec.propagated({ seed: 0 })).returned).toMatchObject({ '--intersection-on': 'white' })
  })

  it('does not automatically publish non-emitted folded intermediates', () => {
    const open = createSystem()
    const ds = open.addTokens(open.defineTokens()
      .add('seed', { val: open.oklch(0.6, 0.15, 265), reference: 'val' })
      .add(m => ({ hidden: open.tdef({ val: open.oklch.from(m.seed, { l: 0.4 }), reference: 'val', emit: false }) }))
      .add(m => ({ shown: open.oklch.from(m.hidden, { l: 0.7 }) })))
      .consolidate({ prefix: 'private' })
    expect(emit(() => ds.tdec.propagated({ seed: open.oklch(0.6, 0.2, 25) })).returned).toEqual({
      '--private-seed': 'oklch(0.6 0.2 25)',
      '--private-shown': 'oklch(0.7 0.2 25)',
    })
  })

  it('protects runtime-mutable folded dependents too', () => {
    const open = createSystem()
    const ds = open.addTokens(open.defineTokens().add('seed', open.color('#fff'))
      .add(m => ({ on: open.tdef({ val: open.legibleOn(m.seed), mutable: true }) })))
      .consolidate({ prefix: 'runtime' })
    expect(() => emit(() => ds.tdec.propagated({ seed: '#000' }))).toThrow(/VANITY_TOKENS_INVALID_OVERRIDE.*runtime-mutable/s)
    expect(() => emit(() => ds.tdec.propagated({ seed: '#000', on: 'red' }))).not.toThrow()
  })

  it('protects non-inheriting dependents from misleading subtree propagation', () => {
    const open = createSystem()
    const ds = open.addTokens(open.defineTokens().add('seed', open.color('#fff'))
      .add(m => ({ on: open.tdef({ val: open.legibleOn(m.seed), register: { syntax: '<color>', inherits: false, initialVal: '#000' } }) })))
      .consolidate({ prefix: 'registered' })
    expect(() => emit(() => ds.tdec.propagated({ seed: '#000' }))).toThrow(/VANITY_TOKENS_INVALID_OVERRIDE.*inherits: false/s)
  })

  it('protects non-inheriting live dependents too', () => {
    const open = createSystem()
    const ds = open.addTokens(open.defineTokens().add('seed', open.color('#fff'))
      .add(m => ({ wash: open.tdef({ val: open.alpha(m.seed, 0.5), register: { syntax: '<color>', inherits: false, initialVal: '#000' } }) })))
      .consolidate({ prefix: 'registered-live' })
    expect(() => emit(() => ds.tdec.propagated({ seed: '#000' }))).toThrow(/VANITY_TOKENS_INVALID_OVERRIDE.*inherits: false/s)
  })

  it('preserves root-local scheme selection instead of moving it into the subtree', () => {
    const open = createSystem().addAxis('scheme', colorSchemes({ locality: 'root' }))
    const ds = open.addTokens(open.defineTokens().add('seed', open.oklch(0.6, 0.15, 265))
      .add(m => ({ surface: open.tdef.color({ axes: { scheme: {
        light: open.oklch.from(m.seed, { l: 0.9 }),
        dark: open.oklch.from(m.seed, { l: 0.3 }),
      } } }) }))).consolidate({ prefix: 'root-scheme' })
    expect(() => emit(() => ds.tdec.propagated({ seed: 'red' }))).toThrow(/VANITY_TOKENS_INVALID_OVERRIDE.*scheme/s)
    expect(() => emit(() => ds.tdec.propagated({ seed: 'red', surface: 'pink' }))).not.toThrow()
  })

  it('accepts numeric token handles as compatible substitutions', () => {
    const open = createSystem()
    const ds = open.addTokens(open.defineTokens().add('seed', 265).add('other', 25)
      .add(m => ({ bg: open.oklch(0.62, 0.15, m.seed) }))
      .add(m => ({ on: open.legibleOn(m.bg) })))
      .consolidate({ prefix: 'handles' })
    expect(emit(() => ds.tdec.propagated({ seed: ds.t.other })).returned).toMatchObject({
      '--handles-seed': 'var(--handles-other)',
      '--handles-bg': 'oklch(0.62 0.15 var(--handles-seed))',
    })
  })

  it('parses actual CSS references, including Unicode and escapes, excluding quoted strings and comments', () => {
    const open = createSystem()
    const ds = open.addTokens({
      seed: 2,
      live: rawValue.number(String.raw`calc(v\61 r(--café-seed) * 2)`),
      quoted: rawValue.string('"var(--café-seed)"'),
      comment: rawValue.number('3 /* var(--café-seed) */'),
    }).consolidate({ prefix: 'café' })
    expect(emit(() => ds.tdec.propagated({ seed: 3 })).returned).toEqual({
      '--café-seed': '3',
      '--café-live': String.raw`calc(v\61 r(--café-seed) * 2)`,
    })
  })
})
