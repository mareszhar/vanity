import {
  channel,
  createSystem,
  defineAxes,
  defineConditions,
  defineConstructor,
  defineConsts,
  definePlugin,
  definePolicies,
  defineRules,
  defineTokens,
  defineUtils,
  media,
} from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it, vi } from 'vitest'

describe('symmetric authoring', () => {
  it('mounts detached modules, arrays, callbacks, and singular contributions', () => {
    const conditions = defineConditions({ compact: '&[data-density=compact]' })
      .add('wide', media({ width: { '>=': '60rem' } }))
    const axes = defineAxes({ density: ['comfortable', 'compact'] })
    const consts = defineConsts({ base: 4 }).add(m => ({
      doubled: m.base * 2,
    }))
    const utilities = defineUtils({ mx: { circle: () => 'circle' } })
      .add({ mx: { badge: () => 'badge' } })
    const policies = definePolicies({
      constructors: { length: { unitless: 'rem' as const } },
    })
    const tokensA = defineTokens({ space: { sm: 1 } })
    const tokensB = defineTokens({ space: { lg: 4 } })

    const open = createSystem()
      .addPolicies(policies)
      .addConditions(conditions)
      .addAxes([axes])
      .addConsts(consts)
      .addConst('derived', ds => ds.consts.doubled + 1)
      .addUtils(utilities)
      .addUtils({ mx: { square: () => 'square' } })
      .addTokens([tokensA, tokensB])
      .addToken('accent', ds => ds.oklch(0.66, 0.18, 28))

    expect(open.consts.derived).toBe(9)
    expect(open.mx.circle()).toBe('circle')
    expect(open.mx.badge()).toBe('badge')
    expect(open.mx.square()).toBe('square')
    expect(open.serialize(open.length(2))).toBe('2rem')
    expect(open.t.space.sm.$path).toBe('space.sm')
    expect(open.t.space.lg.$path).toBe('space.lg')
  })

  it('guards augment intent and accepts partial overwrite patches', () => {
    const base = createSystem().addAxis('scheme', ['light', 'dark'])
    const augmented = base.augmentAxis('scheme', {
      modes: { system: '&[data-scheme=system]' },
    })
    const overwritten = augmented.overwriteAxis('scheme', {
      modes: { dark: '&[data-scheme=night]' },
      description: 'application color scheme',
    })

    expect(Object.keys(overwritten.axes.scheme.modes)).toEqual(['light', 'dark', 'system'])
    expect(overwritten.axes.scheme.description).toBe('application color scheme')
    expect(() => base.augmentAxis('scheme', {
      modes: { dark: '&[data-scheme=night]' },
    })).toThrow(/use overwriteAxis/)
  })

  it('treats patch module arrays as sequential plural patches', () => {
    const tokenPatch = defineTokens({ accent: 'blue' })
    const axisPatch = defineAxes({
      scheme: { modes: { system: '&[data-scheme=system]' } },
    })
    const rulePatch = defineRules({
      base: { css: { html: { color: 'blue' } } },
    })
    const ds = createSystem()
      .addAxis('scheme', ['light', 'dark'])
      .addTokens({ accent: 'red' })
      .addRule('base', { css: { html: { color: 'red' } } })
      .augmentAxes([axisPatch])
      .overwriteTokens([tokenPatch])
      .overwriteRules([rulePatch])
      .consolidate()

    expect(new Set(Object.keys(ds.axes.scheme.modes))).toEqual(new Set(['light', 'dark', 'system']))
    const { css } = emit(() => ds.class({ color: ds.t.accent }))
    expect(css).toContain('--vanity-accent: blue')
    expect(css).toMatch(/html\s*\{\s*color: blue;/)
  })

  it('installs callable constructor families with arbitrary typed members', () => {
    const family = defineConstructor('tone', {
      call: (base: string) => createSystem().color(base),
      from: (base: string) => createSystem().oklch.from(base, { c: channel.multiply(0.5) }),
      vivid: (base: string) => createSystem().oklch.from(base, { c: channel.multiply(1.2) }),
    })
    const ds = createSystem().addConstructors(family).consolidate()

    expect(ds.serialize(ds.tone('red'))).toMatch(/^oklch\(/)
    expect(ds.serialize(ds.tone.from('red'))).toContain('oklch(')
    expect(ds.serialize(ds.tone.vivid('red'))).toContain('oklch(')
  })

  it('rebinds open-token captures in locked constructors and utilities', () => {
    const withControl = createSystem().addTokens({
      control: createSystem().tdef.number({ val: 0.5, mutable: true }),
    })
    const open = withControl
      .addConstructor('scaled', {
        call: (factor: number) => withControl.calc(withControl.t.control).multiply(factor),
        half: () => withControl.calc(withControl.t.control).multiply(0.5),
        color: () => withControl.oklch(withControl.t.control, 0.1, 30),
      })
      .addUtil('scaledUtility', (factor: number) =>
        withControl.calc(withControl.t.control).multiply(factor))
    const ds = open.consolidate({ prefix: 'bound' })

    expect(ds.serialize(ds.scaled(2))).toBe('calc(var(--bound-control) * 2)')
    expect(ds.serialize(ds.scaled.half())).toBe('calc(var(--bound-control) * 0.5)')
    expect(ds.serialize(ds.scaled.color())).toBe('oklch(var(--bound-control) 0.1 30)')
    expect(ds.serialize(ds.scaledUtility(3))).toBe('calc(var(--bound-control) * 3)')
    const { css } = emit(() => ds.class({
      background: ds.scaled.color(),
      opacity: ds.scaled(2),
      zIndex: ds.scaledUtility(3),
    }))
    expect(css).toContain('background: oklch(var(--bound-control) 0.1 30)')
    expect(css).toContain('opacity: calc(var(--bound-control) * 2)')
    expect(css).toContain('z-index: calc(var(--bound-control) * 3)')
  })

  it('emits ordered named system rule groups once and exposes them to introspection', () => {
    const groups = defineRules({
      base: {
        description: 'document baseline',
        layer: 'reset',
        css: { 'html, body': { margin: 0 } },
      },
    }).add('scheme', {
      layer: 'reset',
      order: 10,
      css: { ':root': { colorScheme: 'light dark' } },
    })
    const ds = createSystem()
      .addRules(groups)
      .overwriteRule('scheme', {
        css: { ':root': { colorScheme: 'only light' } },
      })
      .consolidate()

    expect(ds.introspect().ruleGroups.base).toMatchObject({
      name: 'base',
      description: 'document baseline',
      layer: 'reset',
    })
    const { css } = emit(() => {
      ds.class({ color: 'red' })
      ds.class({ color: 'blue' })
    })
    expect(css.match(/html, body/g)).toHaveLength(1)
    expect(css.match(/color-scheme: only light/g)).toHaveLength(1)
  })

  it('nudges only genuinely long singular chains at consolidation', () => {
    let open: any = createSystem()
    for (let index = 0; index < 41; index++)
      open = open.addConst(`c${index}`, index)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    open.consolidate()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('VANITY_SYSTEM_SINGULAR_ADD_THRESHOLD'))
    warn.mockRestore()
  })

  it('lets a plugin own an exact literal axis and preserves additive collision law', () => {
    const density = definePlugin({
      id: 'org.vanity.test.density-axis',
      version: 1,
      setup: ds => ds.addAxis('density', ['comfortable', 'compact']),
    })
    const open = createSystem().addPlugin(density)
    expect(Object.keys(open.axes.density.modes)).toEqual(['comfortable', 'compact'])
    expect(() => createSystem()
      .addAxis('density', ['host'])
      .addPlugin(density as any)).toThrow(/already defined|already/)
  })
})
