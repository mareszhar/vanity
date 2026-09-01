import type { VanityPluginSetupSystem } from '@mszr/vanity'
import { createSystem, data, definePlugin, VanityError } from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { assertPortableSystem, systemContractOf } from './contract'

describe('open and locked systems', () => {
  it('consolidates without a style scope or side effects and exposes four identities', () => {
    const base = createSystem()
    const open = base
      .addTokens({
        color: {
          brand: '#635bff',
          optional: base.tdef.color(),
        },
      })
      .augmentTokens({ color: { optional: 'rebeccapurple' } })
      .overwriteTokens({ color: { brand: '#5546e8' } })
      .addConditions({ selected: '&[data-selected]' })
      .addConsts({ density: { compact: 0.875 } })
      .addUtils({ twice: (value: number) => value * 2 })

    const ds = open.consolidate({ prefix: 'app', root: '#app' })
    const contract = ds.introspect()

    expect(contract.format).toBe('vanity.introspection/1')
    expect(contract.prefix).toBe('app')
    expect(Object.keys(contract.tokens)).toEqual(['color.brand', 'color.optional'])
    expect(contract.overwrites.map(entry => entry.target)).toEqual(['tokens', 'tokens'])
    expect(contract.overwrites.map(entry => entry.operation)).toEqual(['augment', 'overwrite'])
    expect(contract.identities.compatibility).toMatch(/^vanity-compatibility-1-/)
    expect(contract.identities.css).toMatch(/^vanity-css-1-/)
    expect(contract.identities.runtime).toMatch(/^vanity-runtime-schema-1-/)
    expect(contract.identities.docs).toMatch(/^vanity-docs-1-/)
    expect(ds.consts).toEqual({ density: { compact: 0.875 } })
    expect(ds.twice(4)).toBe(8)
    expect('addTokens' in ds).toBe(false)
    expect('css' in ds).toBe(false)
    expect('globalCss' in ds).toBe(false)
    expect('tokenOverride' in ds).toBe(false)
  })

  it('emits only when a locked build surface is used', () => {
    const ds = createSystem()
      .addTokens({ color: { brand: '#635bff' } })
      .consolidate({ prefix: 'app' })

    expect(() => ds.introspect()).not.toThrow()
    expect(() => ds.explain(ds.t.color.brand)).not.toThrow()
    expect(ds.namesOf(ds.t.color)).toEqual({ brand: '--app-color-brand' })
    expect(ds.varsOf(ds.t.color)).toEqual({ brand: 'var(--app-color-brand)' })

    const { css } = emit(() => ds.class({ color: ds.t.color.brand }))
    expect(css).toContain('--app-color-brand')
    expect(css).toContain('color: var(--app-color-brand)')
  })

  it('keeps open and locked misuse diagnostics explicit', () => {
    const open = createSystem()
    expect(() => (open as any).class({ color: 'red' })).toThrow(/only after consolidate/)

    const locked = open.consolidate()
    expect(() => (locked as any).addTokens({ color: { brand: 'red' } })).toThrow(/unavailable after consolidate/)
  })

  it('rejects consolidation in a style module with a dedicated diagnostic', () => {
    expect(() => emit(() => createSystem().consolidate())).toThrowError(VanityError)
    try {
      emit(() => createSystem().consolidate())
    }
    catch (error) {
      expect((error as VanityError).diagnostics[0]).toMatchObject({
        code: 'VANITY_SYSTEM_IN_STYLE_MODULE',
        fix: { message: expect.stringContaining('plain system.ts') },
      })
    }
  })

  it('keeps forks isolated', () => {
    const base = createSystem().addTokens({ color: { brand: 'red' } })
    const first = base.addConsts({ channel: 'stable' }).consolidate({ prefix: 'one' })
    const second = base.addConsts({ channel: 'next' }).consolidate({ prefix: 'two' })

    expect(first.consts.channel).toBe('stable')
    expect(second.consts.channel).toBe('next')
    expect(first.t.color.brand.$name).toBe('--one-color-brand')
    expect(second.t.color.brand.$name).toBe('--two-color-brand')
  })

  it('keeps augment, overwrite, and expect semantics explicit across every system facet', () => {
    const origin = createSystem()
    const density = origin.addAxis('density', {
      modes: {
        compact: data('density', 'compact'),
        comfortable: '&',
      },
      default: 'comfortable',
    })
    const replacement = origin.addAxis('density', {
      modes: {
        compact: data('density', 'compact'),
        comfortable: '&',
        spacious: data('density', 'spacious'),
      },
      default: 'comfortable',
    }).axes.density
    const plugin = definePlugin({
      id: 'org.vanity.test.triple',
      version: 1,
      setup: ds => ds.addUtils({ triple: (value: number) => value * 3 }),
    })
    const staged = density
      .addTokens({
        color: {
          brand: 'red',
          optional: density.tdef.color(),
        },
      })
      .augmentTokens({ color: { optional: 'rebeccapurple' } })
      .overwriteTokens({ color: { brand: 'blue' } })
      .addConditions({ selected: '&[data-selected]' })
      .overwriteConditions({ selected: '&[aria-selected=true]' })
      .addConsts({ density: 1 })
      .overwriteConsts({ density: 2 })
      .overwriteAxis('density', replacement)
      .addPlugin(plugin)
      .expectTokens({ color: { brand: true } })
      .expectAxis('density')
      .expectPlugin('org.vanity.test.triple')
    const ds = staged.consolidate({ prefix: 'facets' })

    expect(ds.t.color.brand.$val).toBe('blue')
    expect(ds.t.color.optional.$val).toBe('rebeccapurple')
    expect(ds.conditions.selected).toBe('&[aria-selected=true]')
    expect(ds.consts.density).toBe(2)
    expect(ds.triple(4)).toBe(12)
    expect(ds.introspect().axes.density?.modes).toHaveProperty('spacious')
    expect(ds.introspect().overwrites.map(entry => entry.target)).toEqual([
      'tokens',
      'tokens',
      'conditions',
      'consts',
      'axis',
    ])

    expect(() => staged.addPlugin(plugin)).toThrow(/already installed/)
    expect(() => (origin as any).expectPlugin('missing')).toThrow(/addPlugin/)
    expect(() => (origin as any).expectAxis('missing')).toThrow(/addAxis/)
    expect(() => (origin as any).expectTokens({ missing: true })).toThrow(/add it earlier/)
    expect(() => (staged as any).overwriteConsts({ missing: 1 })).toThrow(/use addConsts/)
    expect(() => (staged as any).overwriteConditions({ missing: '&' })).toThrow(/use addConditions/)
    expect(() =>
      (staged as any).overwriteTokens({ color: { missing: 'red' } }).consolidate(),
    ).toThrow(/unknown token/)
    expect(() =>
      (staged as any).augmentTokens({ color: { brand: 'green' } }).consolidate(),
    ).toThrow(/slot already has a value/)
    expect(() => (density as any).overwriteAxis('density', origin.addAxis('density2', ['only']).axes.density2))
      .toThrow(/cannot remove existing mode/)
  })

  it('keeps many locked forks independent', () => {
    const base = createSystem().addTokens({ color: { brand: 'red' } })
    const forks = Array.from({ length: 32 }, (_, index) =>
      base.addConsts({ fork: index }).consolidate({ prefix: `fork${index}` }))

    expect(new Set(forks.map(fork => fork.t.color.brand.$name)).size).toBe(32)
    expect(forks.map(fork => fork.consts.fork)).toEqual(
      Array.from({ length: 32 }, (_, index) => index),
    )
  })

  it('mounts callable plugins with inferred nested utils, constructors, consts, and stable options identity', () => {
    const plugin = definePlugin({
      id: 'org.vanity.test.extension-surface',
      version: 1,
      setup: (ds, options: { readonly factor: number }) => ds
        .addConsts({ extension: { factor: options.factor } })
        .addUtils({
          math: {
            multiply: (value: number) => value * options.factor,
          },
        })
        .addConstructor('step', {
          call: (value: number) => ds.length.px(value * options.factor),
          from: (value: number) => ds.length.rem(value / options.factor),
        }),
    })
    const sourceOptions = { factor: 2 }
    const configured = plugin(sourceOptions)
    sourceOptions.factor = 7
    const first = createSystem().addPlugin(configured).consolidate()
    const same = createSystem().addPlugin(plugin({ factor: 2 })).consolidate()
    const different = createSystem().addPlugin(plugin({ factor: 3 })).consolidate()

    expect(first.math.multiply(4)).toBe(8)
    expect(Object.isFrozen(sourceOptions)).toBe(false)
    expect(configured.options).toEqual({ factor: 2 })
    expect(Object.isFrozen(configured.options)).toBe(true)
    expect(first.serialize(first.step(3))).toBe('6px')
    expect(first.serialize(first.step.from(4))).toBe('2rem')
    expect(first.consts.extension.factor).toBe(2)
    expect(Object.values(first.introspect().extensions)).toContainEqual(expect.objectContaining({
      name: plugin.id,
      fingerprint: configured.fingerprint,
    }))
    expect(first.introspect().utilities['math.multiply'].owner).toEqual({
      kind: 'plugin',
      id: `plugin:${plugin.id}`,
    })
    expect(first.introspect().constructors.step.owner).toEqual({
      kind: 'plugin',
      id: `plugin:${plugin.id}`,
    })
    expect(first.introspect().identities.compatibility).toBe(same.introspect().identities.compatibility)
    expect(first.introspect().identities.compatibility).not.toBe(different.introspect().identities.compatibility)
  })

  it('checks structural requirements at the mount position with a temporal diagnostic', () => {
    const plugin = definePlugin({
      id: 'org.vanity.test.requirements',
      version: 1,
      setup: (ds) => {
        const expected = ds.expectTokens({
          color: {
            brand: { type: 'color', mutable: true, reference: 'var', emit: true },
          },
        })
          .expectAxis('scheme', ['light', 'dark'])
        return expected.addUtils({
          requirementsMet: () => true,
          brandTheme: (value: string) => expected.tdec({ color: { brand: value } }),
        })
      },
    })
    const origin = createSystem()
    const withAxis = origin.addAxis('scheme', ['light', 'dark'])
    const host = withAxis
      .addTokens({
        color: {
          brand: withAxis.tdef.color({ mutable: true }),
        },
      })
      .augmentTokens({ color: { brand: 'red' } })

    const ds = host.addPlugin(plugin).consolidate()
    expect(ds.requirementsMet()).toBe(true)
    const { css } = emit(() => ds.class({ ...ds.brandTheme('rebeccapurple') }))
    expect(css).toContain('--vanity-color-brand: rebeccapurple')
    expect(() => (origin as any).addPlugin(plugin))
      .toThrow(/plugin 'org\.vanity\.test\.requirements'.*add it earlier.*temporal/i)
  })

  it('keeps plugin setup additive after intermediate chaining', () => {
    const hostile = definePlugin({
      id: 'org.vanity.test.no-overwrite',
      version: 1,
      setup: ds => (ds.addUtils({ safe: () => true }) as any)
        .overwriteConsts({ host: true }),
    })

    expect(() => createSystem().addConsts({ host: false }).addPlugin(hostile))
      .toThrow(/cannot call overwriteConsts.*additive/)

    const replacement = definePlugin({
      id: 'org.vanity.test.replacement',
      version: 1,
      setup: () => createSystem().addUtils({ replaced: () => true }),
    })
    expect(() => createSystem().addPlugin(replacement))
      .toThrow(/must return the accumulated system/)
  })

  it('accepts stable inline plugins and rejects nonportable consts', () => {
    const inline = {
      id: 'org.vanity.test.inline',
      version: 1,
      setup: (ds: VanityPluginSetupSystem) => ds.addUtils({ inlineValue: () => 42 }),
    }
    expect(createSystem().addPlugin(inline).consolidate().inlineValue()).toBe(42)
    expect(() => createSystem().addConsts({ executable: () => true } as any))
      .toThrow(/JSON-serializable/)
  })

  it('rejects utility and constructor collisions at the additive call site', () => {
    expect(() => (createSystem() as any).addUtils({ class: () => 'lost' }))
      .toThrow(/reserved by system surface/)
    expect(() => (createSystem() as any).addUtils({ length: () => 'lost' }))
      .toThrow(/duplicate utility leaf at 'length'/)

    const withUtil = createSystem().addUtils({ measure: (value: number) => value })
    expect(() => (withUtil as any).addConstructor('measure', {
      call: (value: number) => withUtil.length.px(value),
    })).toThrow(/system member already exists/)

    const hostile = definePlugin({
      id: 'org.vanity.test.reserved-util',
      version: 1,
      setup: ds => ds.addUtils({ class: () => 'lost' } as never),
    })
    expect(() => createSystem().addPlugin(hostile))
      .toThrow(/plugin 'org\.vanity\.test\.reserved-util'.*reserved by system surface/)
  })

  it('invalidates only the identity projections affected by a change', () => {
    const contract = (val: string, description: string) => {
      const open = createSystem()
      return open
        .addTokens({
          color: {
            brand: open.tdef.color({ val, description }),
          },
        })
        .consolidate()
        .introspect()
    }
    const original = contract('red', 'Brand')
    const valueEdit = contract('blue', 'Brand')
    const docsEdit = contract('red', 'Primary brand color')

    expect(valueEdit.identities).toMatchObject({
      compatibility: original.identities.compatibility,
      runtime: original.identities.runtime,
      docs: original.identities.docs,
    })
    expect(valueEdit.identities.css).not.toBe(original.identities.css)
    expect(docsEdit.identities).toMatchObject({
      compatibility: original.identities.compatibility,
      css: original.identities.css,
      runtime: original.identities.runtime,
    })
    expect(docsEdit.identities.docs).not.toBe(original.identities.docs)
  })

  it('validates portable data and its projection-derived identities at the trust boundary', () => {
    const ds = createSystem()
      .addTokens({ color: { brand: 'red' } })
      .consolidate()
    const portable = systemContractOf(ds)!.portable
    const tampered = JSON.parse(JSON.stringify(portable))
    tampered.prefix = 'forged'

    expect(() => assertPortableSystem(tampered)).toThrow(/identity does not match/)
    expect(() => assertPortableSystem({
      ...portable,
      consts: { executable: () => 'not portable' },
    })).toThrow(/function values/)
  })
})
