import {
  createSystem,
  definePlugin,
  defineTokens,
  hsl,
  length,
  oklch,
} from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it, vi } from 'vitest'

describe('policy as system law', () => {
  it('uses one recursive add/overwrite law for known and custom policy groups', () => {
    const open = createSystem({
      tokens: { reference: 'var' },
      custom: { nested: { first: 1 } },
      list: [1, 2],
    })

    const added = open.addPolicies({
      tokens: { emit: false },
      custom: { other: 2 },
    })
    expect(added.policies).toMatchObject({
      tokens: { reference: 'var', emit: false },
      custom: { nested: { first: 1 }, other: 2 },
    })
    expect(() => open.addPolicies({ custom: { nested: { first: 2 } } })).toThrow(/custom\.nested\.first/)
    expect(() => open.addPolicies({ list: [3] })).toThrow(/list/)

    const overwritten = open.overwritePolicies({
      tokens: { emit: false },
      custom: { nested: { first: 2 } },
      list: [3],
    })
    expect(overwritten.policies).toMatchObject({
      tokens: { reference: 'var', emit: false },
      custom: { nested: { first: 2 } },
      list: [3],
    })
  })

  it('rejects unknown keys inside closed policy groups', () => {
    expect(() => createSystem({ tokens: { reference: 'var', typo: true } } as never)).toThrow(/unknown tokens policy/)
    expect(() => createSystem({
      constructors: { length: { restrict: { level: 'forbid', typo: true } } },
    } as never)).toThrow(/unknown key 'typo'/)
    expect(() => createSystem({ color: { typo: 'oklch' } } as never)).toThrow(/unknown color policy/)
    expect(() => createSystem({ color: { mixSpace: 'invalid-space' } } as never)).toThrow(/color\.mixSpace/)
    expect(() => createSystem({ color: { adjustSpace: 'srgb' } } as never)).toThrow(/color\.adjustSpace/)
  })

  it('binds colorMix defaults through the owning system and preserves explicit .in()', () => {
    const configured = createSystem({ color: { mixSpace: 'oklab' } })

    expect(configured.policies.color).toEqual({ mixSpace: 'oklab' })
    expect(configured.serialize(configured.colorMix(['red', 'blue'])))
      .toMatch(/^oklch\(/)
    expect(configured.serialize(configured.colorMix(['red', 'blue']).in('srgb')))
      .toBe('color-mix(in srgb, red, blue)')
  })

  it('binds bare color adjustments through the owning system and keeps explicit namespaces authoritative', () => {
    const configured = createSystem({ color: { adjustSpace: 'hsl' } })

    expect(configured.policies.color).toEqual({ adjustSpace: 'hsl' })
    expect(configured.serialize(configured.lighten('red', 0.1)))
      .toBe('hsl(0 100% 50.1%)')
    expect(configured.serialize(configured.alpha(configured.hsl(200, 50, 50), 0.2)))
      .toBe('hsl(200 50% 50% / 0.2)')
    expect(configured.serialize(configured.hsl.lighten('red', 0.1)))
      .toBe('hsl(0 100% 50.1%)')
    expect(configured.serialize(configured.oklch.lighten('red', 0.1)))
      .toMatch(/^oklch\(/)

    const unconfigured = createSystem()
    expect(unconfigured.serialize(unconfigured.alpha('blue', 0.2)))
      .toBe('rgb(0 0 255 / 0.2)')
    expect(() => unconfigured.serialize(unconfigured.lighten('red', 0.1)))
      .toThrow(/adjustSpace/)
  })

  it('carries the color adjust and mix policy into every style emitter', () => {
    const ds = createSystem({ color: { adjustSpace: 'hsl', mixSpace: 'oklab' } })
      .addTokens({ color: { brand: oklch(0.63, 0.25, 29), ink: oklch(0.2, 0, 0) } })
      .consolidate({ prefix: 'style' })

    // A static-origin adjustment folds through the configured space at the cursor.
    expect(emit(() => ds.class({ color: ds.lighten('red', 0.1) }, 'static-adjust')).css)
      .toContain('color: hsl(0 100% 50.1%);')

    // The method-chain form over a token reference stays live and still uses the
    // configured space — the case the constructor's own type cannot yet gate.
    expect(emit(() => ds.class({ color: ds.t.color.brand.lighten(0.1) }, 'live-adjust')).css)
      .toContain('color: hsl(from var(--style-color-brand) h s calc(l + 0.1));')

    // colorMix() carries mixSpace into rule position the same way.
    expect(emit(() => ds.class({ color: ds.colorMix([ds.t.color.brand, ds.t.color.ink]) }, 'mix')).css)
      .toContain('color: color-mix(in oklab, var(--style-color-brand), var(--style-color-ink));')

    // The policy reaches rules(), recipe(), anatomy(), and atoms() through the same context.
    const expected = 'color: hsl(from var(--style-color-brand) h s calc(l + 0.1));'
    expect(emit(() => ds.rules({ '.probe': { color: ds.lighten(ds.t.color.brand, 0.1) } })).css)
      .toContain(expected)
    expect(emit(() => ds.recipe({ base: { color: ds.lighten(ds.t.color.brand, 0.1) } }, 'card')).css)
      .toContain(expected)
    expect(emit(() => ds.anatomy({ parts: ['root'], base: { root: { color: ds.lighten(ds.t.color.brand, 0.1) } } }, 'dialog')).css)
      .toContain(expected)
    expect(emit(() => ds.atoms({ properties: { color: { hi: ds.lighten(ds.t.color.brand, 0.1) } } }, 'util')).css)
      .toContain(expected)
  })

  it('keeps the missing-adjust-space diagnostic in rule position when no policy is set', () => {
    const ds = createSystem()
      .addTokens({ color: { brand: oklch(0.63, 0.25, 29) } })
      .consolidate({ prefix: 'nopolicy' })

    // A bare adjustment with no namespace and no policy must fail the same way at
    // a style-emitter cursor as it does through serialize(); an explicit
    // namespace still resolves without a policy.
    expect(() => emit(() => ds.class({ color: ds.t.color.brand.lighten(0.1) }, 'card')))
      .toThrow(/adjustSpace/)
    expect(emit(() => ds.class({ color: ds.oklch.lighten(ds.t.color.brand, 0.1) }, 'ok')).css)
      .toMatch(/color: oklch\(from var\(--nopolicy-color-brand\)/)
  })

  it('resolves portable adaptive lengths at the host border and preserves explicit units', () => {
    const portable = defineTokens({
      space: {
        adaptive: length(8),
        explicit: length.px(8),
      },
    })
    const ds = createSystem({
      constructors: { length: { unitless: 'rem' } },
    }).addTokens(portable).consolidate({ prefix: 'policy' })

    const { css } = emit(() => ds.class({
      padding: ds.t.space.adaptive,
      margin: ds.t.space.explicit,
    }))

    expect(css).toContain('--policy-space-adaptive: 8rem')
    expect(css).toContain('--policy-space-explicit: 8px')
  })

  it('reads adaptive length units only from the constructor policy', () => {
    const tokens = {
      space: { adaptive: length(2) },
    }
    const defaultSystem = createSystem()
      .addTokens(tokens)
      .consolidate({ prefix: 'default-length' })
    const customSystem = createSystem({ length: { unitless: 'em' } })
      .addTokens(tokens)
      .consolidate({ prefix: 'custom-length' })
    const configuredSystem = createSystem({ constructors: { length: { unitless: 'rem' } } })
      .addTokens(tokens)
      .consolidate({ prefix: 'configured-length' })

    expect(emit(() => defaultSystem.class({ padding: defaultSystem.t.space.adaptive })).css)
      .toContain('--default-length-space-adaptive: 2px')
    expect(emit(() => customSystem.class({ padding: customSystem.t.space.adaptive })).css)
      .toContain('--custom-length-space-adaptive: 2px')
    expect(emit(() => configuredSystem.class({ padding: configuredSystem.t.space.adaptive })).css)
      .toContain('--configured-length-space-adaptive: 2rem')

    expect(customSystem.introspect().capabilities.signature).not.toBe(defaultSystem.introspect().capabilities.signature)
    expect(configuredSystem.introspect().capabilities.signature).not.toBe(defaultSystem.introspect().capabilities.signature)
  })

  it('distinguishes prospective and retroactive restriction reach', () => {
    const before = createSystem().addTokens({ prior: oklch(0.6, 0.2, 280) })
    expect(() => before.addPolicies({
      constructors: {
        oklch: { restrict: { level: 'forbid', enforce: 'prospective' } },
      },
    }).consolidate()).not.toThrow()

    expect(() => before.addPolicies({
      constructors: {
        oklch: { restrict: { level: 'forbid', enforce: 'retroactive' } },
      },
    }).consolidate()).toThrow(/VANITY_POLICY_RESTRICTED_CONSTRUCTOR.*prior/s)

    expect(() => createSystem({
      constructors: {
        oklch: {
          restrict: {
            level: 'forbid',
            use: 'oklchx',
            reason: 'the host owns normalized color',
          },
        },
      },
    }).addTokens({ later: oklch(0.6, 0.2, 280) }).consolidate())
      .toThrow(/forbidden constructor 'oklch'.*normalized color/s)
  })

  it('keeps discourage compilable and reports a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    createSystem({
      constructors: {
        hsl: { restrict: { level: 'discourage', use: 'oklch' } },
      },
    }).addTokens({ color: hsl(280, 50, 50) }).consolidate()

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('VANITY_POLICY_RESTRICTED_CONSTRUCTOR'))
    warn.mockRestore()
  })

  it('auto-scopes plugin policy and keeps global policy mutation user-owned', () => {
    const greeter = definePlugin({
      id: 'org.example.greeter',
      version: 1,
      setup: ds => ds.registerPluginPolicy({ greeting: 'hello', enabled: true }),
    })
    const open = createSystem().addPlugin(greeter)

    expect(open.policies.plugins).toEqual({
      'org.example.greeter': { greeting: 'hello', enabled: true },
    })
    expect(open.consolidate().policies.plugins).toEqual(open.policies.plugins)
  })

  it('enforces restrictions on user-defined constructor calls and members', () => {
    const open = createSystem({
      constructors: {
        tone: { restrict: { level: 'forbid', enforce: 'retroactive' } },
      },
    }).addConstructor('tone', {
      call: (value: number) => length.px(value),
      alternate: (value: number) => length.rem(value),
    })

    expect(() => (open as any)
      .addTokens({ direct: (open as any).tone(2) })
      .consolidate()).toThrow(/forbidden constructor 'tone'/)
    expect(() => (open as any)
      .addTokens({ member: (open as any).tone.alternate(2) })
      .consolidate()).toThrow(/forbidden constructor 'tone'/)
  })
})
