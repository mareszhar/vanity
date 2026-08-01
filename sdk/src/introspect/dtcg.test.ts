import { emit } from '@test'
import { createEngine, defineEnginePlugin, exportDesignTokens, importDesignTokens } from '@test/legacy'
import { describe, expect, it } from 'vitest'

describe('dTCG interchange', () => {
  it('exports an honest standard snapshot for one selected environment', () => {
    const de = createEngine().axes(({ scheme }) => ({ scheme: scheme({ locality: 'root' }) }))
    const document = emit(() => {
      const ds = de.createSystem({
        tokens: de.defineTokens({
          color: {
            brand: de.token({
              val: de.oklch(0.58, 0.2, 285),
              axes: { scheme: { dark: de.oklch(0.72, 0.14, 285) } },
            }),
          },
          space: { md: de.token({ val: de.length.rem(1) }) },
          motion: { quick: de.token({ val: de.time.ms(160) }) },
        }),
      })
      return exportDesignTokens(ds, { mode: 'resolved', environment: { scheme: 'dark' } })
    }).returned as any

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

  it('round-trips portable authored traits, aliases, axes, and reservations', () => {
    const de = createEngine().axes(({ scheme }) => ({ scheme: scheme({ locality: 'root' }) }))
    const document = emit(() => {
      const module = de.defineTokens({
        color: {
          brand: de.token({
            val: de.oklch(0.58, 0.2, 285),
            mutable: true,
            axes: { scheme: { dark: de.oklch(0.72, 0.14, 285) } },
            description: 'brand seed',
          }),
          accent: de.token.color({
            mutable: true,
            axes: { scheme: { light: de.oklch(0.6, 0.1, 285), dark: null } },
          }),
        },
      }).derive(({ color }) => ({ color: { brandAlias: color.brand } }))
      const ds = de.createSystem({ tokens: module, prefix: 'first' })
      return exportDesignTokens(ds, { mode: 'authored' })
    }).returned as any

    expect(document.$extensions['com.mszr.vanity']).toMatchObject({ version: 1, mode: 'authored' })

    const imported = importDesignTokens(document, { system: de })
    const result = emit(() => de.createSystem({ tokens: imported, prefix: 'second' }))

    expect(result.css).toContain('--second-color-brand: light-dark(')
    expect(result.css).toContain('--second-color-brand-alias: var(--second-color-brand)')
    expect(result.css).toContain('--second-color-accent: light-dark(')
    expect((result.returned.t as any).color.brand.$description).toBe('brand seed')
    expect((result.returned.t as any).color.accent.$axes.scheme.dark.$val).toBeUndefined()
  })

  it('orders authored imports by dependencies that exist only inside branches', () => {
    const de = createEngine().axes(({ scheme }) => ({ scheme: scheme({ locality: 'root' }) }))
    const document = emit(() => {
      const module = de.defineTokens({ color: { seed: 'red' } }).derive(({ color }) => ({
        color: {
          conditional: de.token({ val: 'white', axes: { scheme: { dark: color.seed } } }),
        },
      }))
      return exportDesignTokens(de.createSystem({ tokens: module }), { mode: 'authored' })
    }).returned as any
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

    const imported = importDesignTokens(reordered, { system: de })
    const result = emit(() => de.createSystem({ tokens: imported, prefix: 'ordered' }))
    expect(result.css).toContain('var(--ordered-color-seed)')
  })

  it('preserves unknown token extensions through import and re-export', () => {
    const de = createEngine()
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
    }, { system: de })
    const exported = emit(() => {
      const ds = de.createSystem({ tokens: imported })
      return exportDesignTokens(ds, { mode: 'resolved' })
    }).returned as any

    expect(exported.space.md.$extensions).toEqual({ 'org.example.tool': { intent: 'layout' } })
    expect(exported.$extensions).toEqual({ 'org.example.root': { revision: 3 } })
    expect(exported.space.$extensions).toEqual({ 'org.example.group': { scale: 'layout' } })

    const invalid = importDesignTokens({
      token: { $type: 'number', $value: 1, $extensions: { 'org.example.invalid': { value: Number.NaN } } },
    }, { system: de })
    expect(() => emit(() => {
      const ds = de.createSystem({ tokens: invalid })
      return exportDesignTokens(ds)
    })).toThrow('non-finite number')
  })

  it('keeps external resolution opt-in', () => {
    const document = { remote: { $type: 'number', $ref: 'https://tokens.example/value.json' } }
    expect(() => importDesignTokens(document)).toThrow('external DTCG reference')

    const module = importDesignTokens(document, { resolveExternal: () => 4 })
    const result = emit(() => createEngine().createSystem({ tokens: module }))
    expect(result.returned.t.remote.$val).toBe('4')

    expect(() => {
      const asyncModule = importDesignTokens(document, { resolveExternal: async () => 4 })
      emit(() => createEngine().createSystem({ tokens: asyncModule }))
    }).toThrow('must return synchronously')
  })

  it('distinguishes unknown aliases from cycles and rejects non-finite color channels', () => {
    expect(() => {
      const module = importDesignTokens({
        color: { brand: { $type: 'color', $value: { colorSpace: 'oklch', components: [Number.NaN, 0.2, 285] } } },
      })
      emit(() => createEngine().createSystem({ tokens: module }))
    }).toThrow('finite numbers')

    expect(() => importDesignTokens({ alias: { $type: 'number', $value: '{missing}' } })).toThrow('unknown token')
    expect(() => importDesignTokens({
      first: { $type: 'number', $value: '{second}' },
      second: { $type: 'number', $value: '{first}' },
    })).toThrow('cycle')
  })

  it('imports inherited standard types, JSON Pointer aliases, and standard color spaces', () => {
    const de = createEngine()
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
    }, { system: de })
    const result = emit(() => de.createSystem({ tokens: imported, prefix: 'standard' }))

    expect(result.css).toContain('--standard-space-sm: 0.75rem')
    expect(result.css).toContain('--standard-space-md: var(--standard-space-sm)')
    expect(result.css).toContain('--standard-color-brand: color(display-p3 0.5 0.2 0.1 / 0.8)')
    expect((result.returned.t as any).space.sm.$description).toBe('compact space')
  })

  it('exports an unfinished module only with its explicit engine context', () => {
    const de = createEngine()
    const module = de.defineTokens({ space: { md: de.token({ val: de.length.rem(1) }) } })

    expect(() => exportDesignTokens(module)).toThrow('needs options.system')
    expect(exportDesignTokens(module, { system: de, prefix: 'portable', root: '#widget' })).toMatchObject({
      space: { md: { $type: 'dimension', $value: { value: 1, unit: 'rem' } } },
    })
  })

  it('fails strict authored export for an opaque plugin without a codec', () => {
    const de = createEngine().extend(
      { id: 'org.example.opaque', version: 1 },
      engine => ({
        mystery: engine.defineCssValue({
          type: 'length',
          extension: { id: 'org.example.opaque', version: 1 },
          create: (value: number) => ({ serialize: () => `${value}px` }),
        }),
      }),
    )
    const result = emit(() => de.createSystem({
      tokens: de.defineTokens({ space: { mystery: de.token({ val: de.mystery(7) }) } }),
    }))

    expect(() => exportDesignTokens(result.returned, { mode: 'authored' })).toThrow('not losslessly portable')
    const lossy = exportDesignTokens(result.returned, { mode: 'authored', strict: false }) as any
    expect(lossy.$extensions['com.mszr.vanity'].tokens['space.mystery'].lossy).toBe(true)
  })

  it('lets a public plugin codec make opaque semantics losslessly portable', () => {
    const plugin = defineEnginePlugin({
      id: 'org.example.codec-value',
      version: 1,
      setup: engine => ({
        mystery: engine.defineCssValue({
          type: 'length',
          extension: { id: 'org.example.codec-value', version: 1 },
          create: (value: number) => ({ serialize: () => `${value}px` }),
        }),
      }),
      dtcg: [{
        id: 'org.example.codec',
        version: 1,
        extension: 'org.example.codec-value',
        encode: ({ css }) => ({ css }),
        decode: ({ payload, engine }) => (engine as any).length.px(Number((payload as any).css.replace('px', ''))),
      }],
    })
    const de = createEngine()
      .axes(({ axis, data }) => ({
        density: axis({ modes: { compact: data('density', 'compact') } }),
        state: axis({ modes: { active: data('state', 'active') } }),
      }))
      .use(plugin)
    const document = emit(() => {
      const ds = de.createSystem({
        tokens: de.defineTokens({
          space: {
            mystery: de.token({
              val: de.mystery(9),
              axes: { density: { compact: de.mystery(11) } },
              cases: [{ when: { density: 'compact', state: 'active' }, val: de.mystery(13) }],
            }),
          },
        }),
      })
      return exportDesignTokens(ds, { mode: 'authored' })
    }).returned as any
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

    const imported = importDesignTokens(document, { system: de })
    const result = emit(() => de.createSystem({ tokens: imported, prefix: 'restored' }))
    expect(result.css).toContain('--restored-space-mystery: 9px')
    expect(result.css).toContain('11px')
    expect(result.css).toContain('13px')

    const nested = emit(() => de.createSystem({
      tokens: de.defineTokens({
        space: { composite: de.token({ val: de.calc(de.mystery(4)).add(de.length.px(1)) }) },
      }),
    }))
    expect(() => exportDesignTokens(nested.returned, { mode: 'authored' })).toThrow('nested in a core/mixed expression')
  })
})
