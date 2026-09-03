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
