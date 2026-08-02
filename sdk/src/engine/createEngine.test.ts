import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { collectInspection } from '../internal/inspect'
import { buildManifest } from '../introspect/manifest'
import {
  createEngine,
  defineCssSupportTarget,
  defineEnginePlugin,
  defineTokens,
  VANITY_BUILTIN_CONSTRUCTOR_NAMES,
  VANITY_SYSTEM_MEMBERS,
  VANITY_SYSTEM_SURFACE_VERSION,
  VanityError,
} from '../test-support/characterization'
import { createCoreConstructors } from '../values/defaultEngine'

describe('the canonical design engine', () => {
  it('is a complete zero-config authoring environment with semantic identity', () => {
    const first = createEngine()
    const duplicate = createEngine()
    const rem = createEngine({ length: { unitless: 'rem' } })
    const restricted = createEngine({
      support: defineCssSupportTarget({ id: 'no-modern-values', features: [] }),
    })

    expect(first).not.toBe(duplicate)
    expect(first.signature).toBe(duplicate.signature)
    expect(first.compatibleWith(duplicate)).toBe(true)
    expect(first.signature).not.toBe(rem.signature)
    expect(first.length(2).css).toBe('2px')
    expect(rem.length(2).css).toBe('2rem')
    expect(() => restricted.serialize(restricted.calc('1rem').add('2px'))).toThrow(/no-modern-values/)
    expect(Object.isFrozen(first)).toBe(true)
  })

  it('publishes one closed system/constructor reservation contract', () => {
    expect(VANITY_SYSTEM_SURFACE_VERSION).toBe(2)
    expect(VANITY_SYSTEM_MEMBERS).toContain('class')
    expect(VANITY_SYSTEM_MEMBERS).toContain('explain')
    expect(VANITY_BUILTIN_CONSTRUCTOR_NAMES).toContain('length')
    expect([...VANITY_BUILTIN_CONSTRUCTOR_NAMES].sort()).toEqual(
      Object.keys(createCoreConstructors('px')).sort(),
    )
    expect(Object.isFrozen(VANITY_SYSTEM_MEMBERS)).toBe(true)
    expect(createEngine().policies.systemSurface).toEqual({
      version: 2,
      members: VANITY_SYSTEM_MEMBERS,
      builtInConstructors: VANITY_BUILTIN_CONSTRUCTOR_NAMES,
    })
  })

  it('creates immutable anonymous core-IR links and identified plugin links', () => {
    const base = createEngine()
    const local = base.extend(de => ({
      editorial: Object.freeze({
        double: (value: number) => de.length.px(value * 2),
      }),
    }))

    const measurePlugin = (fingerprint: string) => defineEnginePlugin({
      id: 'com.example.editorial-measure',
      version: 1,
      fingerprint,
      setup(de) {
        const measure = de.defineCssValue({
          type: 'length',
          extension: { id: 'com.example.editorial-measure', version: 1, fingerprint },
          create(value: number) {
            return { serialize: () => `editorial-measure(${value})` }
          },
        })
        return { editorialMeasure: Object.freeze({ measure }) }
      },
    })

    const installed = base.use(measurePlugin('compact'))
    const equivalent = createEngine().use(measurePlugin('compact'))
    const changed = createEngine().use(measurePlugin('comfortable'))

    expect(local).not.toBe(base)
    expect('editorial' in base).toBe(false)
    expect(local.editorial.double(4).css).toBe('8px')
    expect(local.signature).toBe(base.signature)
    expect(installed.signature).toBe(equivalent.signature)
    expect(installed.signature).not.toBe(changed.signature)
    expect(installed.serialize(installed.editorialMeasure.measure(42))).toBe('editorial-measure(42)')
    expect(Object.isFrozen(installed.editorialMeasure)).toBe(true)
  })

  it('rejects engine/system collisions and duplicate semantic identities locally', () => {
    const de = createEngine()

    expect(() => (de.extend as any)(() => ({ css: {} }))).toThrow(/reserved by system surface/)
    expect(() => (de.extend as any)(() => ({ length: {} }))).toThrow(/already exists/)

    const plugin = defineEnginePlugin({
      id: 'com.example.once',
      version: 1,
      setup: () => ({ once: {} }),
    })
    expect(() => de.use(plugin).use(plugin)).toThrow(/already installed/)

    const codecPlugin = defineEnginePlugin({
      id: 'com.example.codec-one',
      version: 1,
      setup: () => ({ codecOne: {} }),
      dtcg: [{
        id: 'com.example.shared-codec',
        version: 1,
        extension: 'com.example.opaque',
        encode: () => null,
        decode: () => 0,
      }],
    })
    const duplicateCodecPlugin = defineEnginePlugin({
      id: 'com.example.codec-two',
      version: 1,
      setup: () => ({ codecTwo: {} }),
      dtcg: [{
        id: 'com.example.shared-codec',
        version: 1,
        extension: 'com.example.other-opaque',
        encode: () => null,
        decode: () => 0,
      }],
    })
    expect(Object.isFrozen(codecPlugin.dtcg?.[0])).toBe(true)
    expect(() => de.use(codecPlugin).use(duplicateCodecPlugin)).toThrow(/duplicate DTCG codec/)
  })

  it('composes equivalent and parent-engine modules but rejects changed semantics', () => {
    const first = createEngine()
    const duplicate = createEngine()
    const derived = first.extend(de => ({ editorial: { gap: de.length.rem(2) } }))
    const changed = createEngine({ length: { unitless: 'rem' } })

    const colors = first.defineTokens({ color: { brand: first.oklch(0.58, 0.2, 285) } })
    const spacing = duplicate.defineTokens({ space: { sm: duplicate.length.rem(0.5) } })

    expect(() => derived.defineTokens().compose(colors).compose(spacing)).not.toThrow()
    expect(() => changed.defineTokens().compose(colors)).toThrowError(VanityError)
    expect(() => changed.defineTokens().compose(colors)).toThrow(/incompatible design engines/)
  })

  it('snapshots module structure and keeps every composition link immutable', () => {
    const de = createEngine()
    const seed = { color: { brand: '#635bff' } }
    const module = de.defineTokens(seed)
    const branch = module.derive(m => ({ color: { accent: m.color.brand } }))

    seed.color.brand = '#f00'
    expect(Object.isFrozen(module)).toBe(true)
    expect(Object.isFrozen(branch)).toBe(true)
    expect((module as any).build).toBeUndefined()
    expect(Object.keys(module)).not.toContain('build')

    const { css } = emit(() => de.createSystem({ tokens: branch }))
    expect(css).toContain('--vanity-color-brand: #635bff')
    expect(css).not.toContain('--vanity-color-brand: #f00')
  })

  it('validates extension-owned values against the final engine, not object provenance', () => {
    const identity = { id: 'com.example.editorial-measure', version: 1 } as const
    const withMeasure = () => createEngine().extend(identity, de => ({
      editorial: {
        measure: de.defineCssValue({
          type: 'length',
          extension: identity,
          create: (value: number) => ({ serialize: () => `editorial-measure(${value})` }),
        }),
      },
    }))
    const author = withMeasure()
    const equivalent = withMeasure()
    const foreignValue = author.editorial.measure(4)

    expect(() => emit(() => createEngine().createSystem({
      tokens: { measure: { editorial: foreignValue } },
    }))).toThrow(/requires extension com\.example\.editorial-measure@1/)

    const { css } = emit(() => equivalent.createSystem({
      tokens: { measure: { editorial: foreignValue } },
    }))
    expect(css).toContain('--vanity-measure-editorial: editorial-measure(4)')
  })
})

describe('engine-owned system finalization', () => {
  it('finalizes names once, honors module roots/layers, and re-exposes constructors', () => {
    const de = createEngine({ length: { unitless: 'rem' } })
    const widget = de.defineTokens({
      color: { brand: de.oklch(0.58, 0.2, 285) },
    }, { root: '#widget', layer: 'tokens.components' }).derive(m => ({
      color: { accent: m.color.brand },
    }))
    const metrics = de.defineTokens({ space: { sm: de.length(0.5) } })

    const { css, returned: ds } = emit(() => de.createSystem({
      tokens: de.defineTokens().compose(widget).compose(metrics),
      prefix: 'app',
      root: '#app',
      conditions: { wide: de.media('(min-width: 60rem)') },
    }))

    expect(ds.length(2).css).toBe('2rem')
    expect(ds.oklch).toBe(de.oklch)
    expect(ds.t.color.brand.$name).toBe('--app-color-brand')
    expect(ds.t.color.accent.$name).toBe('--app-color-accent')
    expect(ds.t.space.sm.$name).toBe('--app-space-sm')
    expect(ds.conditions.wide).toBe('@media (min-width: 60rem)')
    expect(ds.layers).toEqual(['reset', 'tokens', 'recipes', 'utilities', 'overrides'])
    expect(ds.serialize(ds.length.rem(2))).toBe('2rem')
    expect(css).toContain('@layer app.tokens.components')
    expect(css).toContain('#widget {\n    --app-color-brand: oklch(0.58 0.2 285);')
    expect(css).toContain('--app-color-accent: var(--app-color-brand);')
    expect(css).toContain('@layer app.tokens.base {')
    expect(css).toContain('#app {\n    --app-space-sm: 0.5rem;')
  })

  it('records semantic engine and normalized emission ownership in the manifest', () => {
    const de = createEngine()
    const { records, result } = collectInspection(() => emit(() => de.createSystem({
      tokens: de.defineTokens(
        { color: { brand: '#635bff' }, space: { sm: '8px' } },
        { root: '#widget', layer: 'tokens.components' },
      ),
      prefix: 'app',
      root: '#app',
    })))
    const manifest = buildManifest(records, result.css)

    expect(manifest.system).toMatchObject({
      engine: { signature: de.signature },
      root: '#app',
      tokenLayer: 'app.tokens',
      tokens: {
        'color.brand': {
          name: '--app-color-brand',
          path: ['color', 'brand'],
          declarations: [{
            kind: 'base',
            context: { root: '#widget', layer: 'app.tokens.base.components' },
          }],
        },
      },
    })
  })

  it('rejects finalized graphs, incompatible modules, invalid roots, and unknown token layers', () => {
    const de = createEngine()
    const other = createEngine({ length: { unitless: 'rem' } })
    const otherModule = other.defineTokens({ space: { sm: other.length(1) } })
    const built = emit(() => defineTokens({
      space: { sm: de.length.rem(1) },
    }).build()).returned

    expect(() => emit(() => de.createSystem({ tokens: otherModule }))).toThrow(/not compatible/)
    expect(() => emit(() => de.createSystem({ tokens: built } as any))).toThrow()
    expect(() => emit(() => de.createSystem({ tokens: {}, prefix: 'two words' as never }))).toThrow(/valid design-system prefix/)
    expect(() => emit(() => de.createSystem({ tokens: {}, root: '& .widget' }))).toThrow(/absolute system root/)
    expect(() => emit(() => de.createSystem({
      tokens: {},
      layers: ['base', 'app'],
      tokenLayer: 'missing' as never,
    }))).toThrow(/not declared/)
  })
})
