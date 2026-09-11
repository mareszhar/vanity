import {
  colorSchemes,
  createSystem,
  data,
  defineCssValue,
  definePlugin,
  exportDesignTokens,
  importDesignTokens,
} from '@mszr/vanity'
import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { substrate } from '../substrate'

function locked(open: { readonly consolidate: (options?: object) => object }, options: object = {}) {
  return substrate.modules.runInFileScope({
    filePath: 'src/introspect/dtcg.system.ts',
    packageName: '@vanity/introspect-fixture',
  }, () => open.consolidate(options)) as any
}

describe('dTCG interchange', () => {
  it('exports an honest standard snapshot for one selected environment', () => {
    const open = createSystem().addAxis('scheme', colorSchemes({ locality: 'root' }))
    const ds = locked(open.addTokens(open.defineTokens({
      color: {
        brand: open.tdef({
          val: open.oklch(0.58, 0.2, 285),
          axes: { scheme: { dark: open.oklch(0.72, 0.14, 285) } },
        }),
      },
      space: { md: open.tdef({ val: open.length.rem(1) }) },
      motion: { quick: open.tdef({ val: open.time.ms(160) }) },
    })))
    const document = exportDesignTokens(ds, { mode: 'resolved', environment: { scheme: 'dark' } }) as any

    expect(document.color.brand).toEqual({
      $type: 'color',
      $value: {
        colorSpace: 'oklch',
        components: [0.72, 0.14, 285],
        alpha: 1,
      },
    })
    expect(document.space.md).toEqual({ $type: 'dimension', $value: { value: 1, unit: 'rem' } })
    expect(document.motion.quick).toEqual({ $type: 'duration', $value: { value: 160, unit: 'ms' } })
  })

  it('preserves authored color spaces through standard DTCG round trips', () => {
    const open = createSystem()
    const p3 = open.color('display-p3', 1, 0.123456789, 0)
    const hsl = open.hsl(200, 50, 50)
    const parsed = open.color('blue')
    const first = locked(open.addTokens({
      color: {
        p3: open.tdef({ val: p3 }),
        hsl: open.tdef({ val: hsl }),
        lab: open.tdef({ val: open.lab(50, 20, 30) }),
        oklch: open.tdef({ val: open.oklch(0.58, 0.2, 285) }),
        parsed: open.tdef({ val: parsed }),
        p3Alpha: open.tdef({ val: open.alpha(p3, 0.4) }),
        hslAlpha: open.tdef({ val: open.alpha(hsl, 0.4) }),
        hslAdjusted: open.tdef({ val: open.hsl.lighten(hsl, 0.1) }),
        hslCrossAdjusted: open.tdef({ val: open.hsl.lighten(open.oklch(0.5, 0.1, 30), 0.1) }),
        parsedAlpha: open.tdef({ val: open.alpha(parsed, 0.4) }),
        computedMix: open.tdef({ val: open.colorMix(['red', 'blue']).in('oklab') }),
      },
    }), { prefix: 'dtcg-colors' })

    const exported = exportDesignTokens(first, { mode: 'resolved' }) as any
    expect(exported.color.p3.$value).toEqual({
      colorSpace: 'display-p3',
      components: [1, 0.123456789, 0],
      alpha: 1,
    })
    expect(exported.color.hsl.$value).toEqual({
      colorSpace: 'hsl',
      components: [200, 50, 50],
      alpha: 1,
    })
    expect(exported.color.lab.$value).toEqual({
      colorSpace: 'lab',
      components: [50, 20, 30],
      alpha: 1,
    })
    expect(exported.color.oklch.$value).toEqual({
      colorSpace: 'oklch',
      components: [0.58, 0.2, 285],
      alpha: 1,
    })
    expect(exported.color.parsed.$value.colorSpace).toBe('srgb')
    expect(exported.color.p3Alpha.$value).toMatchObject({ colorSpace: 'display-p3', alpha: 0.4 })
    expect(exported.color.hslAlpha.$value).toMatchObject({ colorSpace: 'hsl', alpha: 0.4 })
    expect(exported.color.hslAdjusted.$value).toMatchObject({ colorSpace: 'hsl', components: [200, 50, 50.1] })
    expect(exported.color.hslCrossAdjusted.$value.colorSpace).toBe('hsl')
    expect(exported.color.parsedAlpha.$value).toMatchObject({ colorSpace: 'srgb', alpha: 0.4 })
    expect(exported.color.computedMix.$value.colorSpace).toBe('oklch')

    const imported = importDesignTokens(exported)
    const second = locked(open.addTokens(imported), { prefix: 'dtcg-colors-roundtrip' })
    const roundTrip = exportDesignTokens(second, { mode: 'resolved' }) as any
    for (const name of ['p3', 'hsl', 'lab', 'oklch', 'p3Alpha', 'hslAlpha', 'hslAdjusted', 'hslCrossAdjusted', 'parsedAlpha', 'computedMix'])
      expect(roundTrip.color[name].$value).toEqual(exported.color[name].$value)
    expect(exportDesignTokens(first, { mode: 'resolved', strict: false })).toEqual(exported)
  })

  it('round-trips portable authored traits, aliases, axes, and reservations', () => {
    const open = createSystem().addAxis('scheme', colorSchemes({ locality: 'root' }))
    const module = open.defineTokens({
      color: {
        brand: open.tdef({
          val: open.oklch(0.58, 0.2, 285),
          mutable: true,
          axes: { scheme: { dark: open.oklch(0.72, 0.14, 285) } },
          description: 'brand seed',
        }),
        accent: open.tdef.color({
          mutable: true,
          axes: { scheme: { light: open.oklch(0.6, 0.1, 285), dark: null } },
        }),
      },
    }).add(m => ({ color: { brandAlias: m.color.brand } }))
    const first = locked(open.addTokens(module), { prefix: 'first' })
    const document = exportDesignTokens(first, { mode: 'authored' }) as any

    expect(document.$extensions['com.mszr.vanity']).toMatchObject({ version: 1, mode: 'authored' })

    const imported = importDesignTokens(document, { system: open })
    const second = locked(open.addTokens(imported), { prefix: 'second' })
    expect(second.t.color.brand.$description).toBe('brand seed')
    expect(second.t.color.accent.$axes.scheme.dark.$val).toBeUndefined()
    const css = emit(() => second.class({
      color: second.t.color.brand,
      background: second.t.color.brandAlias,
      borderColor: second.t.color.accent,
    })).css
    expect(css).toContain('--second-color-brand: light-dark(')
    expect(css).toContain('--second-color-brand-alias: var(--second-color-brand)')
    expect(css).toContain('--second-color-accent: light-dark(')
  })

  it('orders authored imports by dependencies that exist only inside branches', () => {
    const open = createSystem().addAxis('scheme', colorSchemes({ locality: 'root' }))
    const module = open.defineTokens({ color: { seed: 'red' } }).add(m => ({
      color: {
        conditional: open.tdef({ val: 'white', axes: { scheme: { dark: m.color.seed } } }),
      },
    }))
    const document = exportDesignTokens(locked(open.addTokens(module)), { mode: 'authored' }) as any
    const extension = document.$extensions['com.mszr.vanity']
    const reordered = {
      ...document,
      $extensions: {
        ...document.$extensions,
        'com.mszr.vanity': {
          ...extension,
          tokens: {
            'color.conditional': extension.tokens['color.conditional'],
            'color.seed': extension.tokens['color.seed'],
          },
        },
      },
    }

    const imported = importDesignTokens(reordered, { system: open })
    const ordered = locked(open.addTokens(imported), { prefix: 'ordered' })
    const css = emit(() => ordered.class({ color: ordered.t.color.conditional })).css
    expect(css).toContain('var(--ordered-color-seed)')
  })

  it('preserves unknown token extensions through import and re-export', () => {
    const imported = importDesignTokens({
      $extensions: { 'org.example.root': { revision: 3 } },
      space: {
        $extensions: { 'org.example.group': { scale: 'layout' } },
        md: {
          $type: 'dimension',
          $value: { value: 1, unit: 'rem' },
          $extensions: { 'org.example.tool': { intent: 'layout' } },
        },
      },
    })
    const open = createSystem()
    const exported = exportDesignTokens(locked(open.addTokens(imported)), { mode: 'resolved' }) as any

    expect(exported.space.md.$extensions).toEqual({ 'org.example.tool': { intent: 'layout' } })
    expect(exported.$extensions).toEqual({ 'org.example.root': { revision: 3 } })
    expect(exported.space.$extensions).toEqual({ 'org.example.group': { scale: 'layout' } })

    const invalid = importDesignTokens({
      token: { $type: 'number', $value: 1, $extensions: { 'org.example.invalid': { value: Number.NaN } } },
    })
    expect(() => exportDesignTokens(locked(open.addTokens(invalid)))).toThrow('non-finite number')
  })

  it('keeps external resolution opt-in', () => {
    const document = { remote: { $type: 'number', $ref: 'https://tokens.example/value.json' } }
    expect(() => importDesignTokens(document)).toThrow('external DTCG reference')

    const module = importDesignTokens(document, { resolveExternal: () => 4 })
    const open = createSystem()
    const result = locked(open.addTokens(module))
    expect(result.t.remote.$val).toBe('4')

    expect(() => {
      const asyncModule = importDesignTokens(document, { resolveExternal: async () => 4 })
      locked(createSystem().addTokens(asyncModule))
    }).toThrow('must return synchronously')
  })

  it('distinguishes unknown aliases from cycles and rejects non-finite color channels', () => {
    expect(() => {
      const module = importDesignTokens({
        color: { brand: { $type: 'color', $value: { colorSpace: 'oklch', components: [Number.NaN, 0.2, 285] } } },
      })
      locked(createSystem().addTokens(module))
    }).toThrow('finite numbers')

    expect(() => importDesignTokens({ alias: { $type: 'number', $value: '{missing}' } })).toThrow('unknown token')
    expect(() => importDesignTokens({
      first: { $type: 'number', $value: '{second}' },
      second: { $type: 'number', $value: '{first}' },
    })).toThrow('cycle')
  })

  it('imports inherited standard types, JSON Pointer aliases, and standard color spaces', () => {
    const imported = importDesignTokens({
      space: {
        $type: 'dimension',
        sm: { $value: { value: 0.75, unit: 'rem' }, $description: 'compact space' },
        md: { $value: '#/space/sm/$value' },
      },
      color: {
        brand: {
          $type: 'color',
          $value: { colorSpace: 'display-p3', components: [0.5, 0.2, 0.1], alpha: 0.8 },
        },
      },
    })
    const open = createSystem()
    const result = locked(open.addTokens(imported), { prefix: 'standard' })
    const css = emit(() => result.class({})).css

    expect(css).toContain('--standard-space-sm: 0.75rem')
    expect(css).toContain('--standard-space-md: var(--standard-space-sm)')
    expect(css).toContain('--standard-color-brand: color(display-p3 0.5 0.2 0.1 / 0.8)')
    expect((result.t as any).space.sm.$description).toBe('compact space')
  })

  it('exports an unfinished module only with its explicit system context', () => {
    const open = createSystem()
    const module = open.defineTokens({ space: { md: open.tdef({ val: open.length.rem(1) }) } })

    expect(() => exportDesignTokens(module)).toThrow('needs options.system')
    expect(exportDesignTokens(module, { system: open, prefix: 'portable', root: '#widget' })).toMatchObject({
      space: { md: { $type: 'dimension', $value: { value: 1, unit: 'rem' } } },
    })
  })

  it('fails strict authored export for an opaque plugin without a codec', () => {
    const mystery = defineCssValue({
      type: 'length',
      extension: { id: 'org.example.opaque', version: 1 },
      create: (value: number) => ({ serialize: () => `${value}px` }),
    })
    const open = createSystem().addPlugin(definePlugin({
      id: 'org.example.opaque',
      version: 1,
      setup: ds => ds.addConstructor('mystery', { call: mystery }),
    }))
    const result = locked(open.addTokens({
      space: { mystery: open.tdef({ val: open.mystery(7) }) },
    }))

    expect(() => exportDesignTokens(result, { mode: 'authored' })).toThrow('not losslessly portable')
    const lossy = exportDesignTokens(result, { mode: 'authored', strict: false }) as any
    expect(lossy.$extensions['com.mszr.vanity'].tokens['space.mystery'].lossy).toBe(true)
  })

  it('lets a public plugin codec make opaque semantics losslessly portable', () => {
    const mystery = defineCssValue({
      type: 'length',
      extension: { id: 'org.example.codec-value', version: 1 },
      create: (value: number) => ({ serialize: () => `${value}px` }),
    })
    const plugin = definePlugin({
      id: 'org.example.codec-value',
      version: 1,
      setup: ds => ds.addConstructor('mystery', { call: mystery }),
      dtcg: [{
        id: 'org.example.codec',
        version: 1,
        extension: 'org.example.codec-value',
        encode: ({ css }) => ({ css }),
        decode: ({ payload, context }) => (context.values.constructors as any).length.px(Number((payload as any).css.replace('px', ''))),
      }],
    })
    const open = createSystem()
      .addAxis('density', { modes: { compact: data('density', 'compact') } })
      .addAxis('state', { modes: { active: data('state', 'active') } })
      .addPlugin(plugin)
    const result = locked(open.addTokens({
      space: {
        mystery: open.tdef({
          val: open.mystery(9),
          axes: { density: { compact: open.mystery(11) } },
          cases: [{ when: { density: 'compact', state: 'active' }, val: open.mystery(13) }],
        }),
      },
    }))
    const document = exportDesignTokens(result, { mode: 'authored' }) as any
    expect(document.$extensions['com.mszr.vanity'].tokens['space.mystery'].val.codec).toMatchObject({
      id: 'org.example.codec',
      version: 1,
    })
    expect(document.$extensions['com.mszr.vanity'].tokens['space.mystery'].branches[0].val.codec).toMatchObject({
      id: 'org.example.codec',
      version: 1,
    })
    expect(document.$extensions['com.mszr.vanity'].tokens['space.mystery'].branches[1].val.codec).toMatchObject({
      id: 'org.example.codec',
      version: 1,
    })

    const imported = importDesignTokens(document, { system: open })
    const restored = locked(open.addTokens(imported), { prefix: 'restored' })
    const css = emit(() => restored.class({})).css
    expect(css).toContain('--restored-space-mystery: 9px')
    expect(css).toContain('11px')
    expect(css).toContain('13px')

    const nested = locked(open.addTokens({
      space: { composite: open.tdef({ val: open.calc(open.mystery(4)).add(open.length.px(1)) }) },
    }))
    expect(() => exportDesignTokens(nested, { mode: 'authored' })).toThrow('nested in a core/mixed expression')
  })
})
