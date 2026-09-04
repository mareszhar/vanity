import { readFile } from 'node:fs/promises'
import { createSystem, data } from '@mszr/vanity'
import { emit } from '@test'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { assertManifest } from '../cli'
import { diffManifests } from './diff'
import { buildManifest, VANITY_MANIFEST_SCHEMA, VANITY_MANIFEST_VERSION } from './manifest'
import { collectInspection } from './records'

function fixture(value = 'red', description = 'Brand color') {
  const origin = createSystem()
    .addAxis('density', {
      modes: { compact: data('density', 'compact'), comfortable: '&' },
      default: 'comfortable',
      description: 'Layout density.',
    })
    .addConditions({ selected: '&[aria-selected=true]' })
  return origin
    .addTokens({
      color: {
        brand: origin.tdef.color({ val: value, description, mutable: true }),
      },
    })
    .addConsts({ release: 'next' })
    .addUtils({ double: (value: number) => value * 2 })
    .consolidate({ prefix: 'manifest', audit: { overwriteInventory: 'warn' } })
}

function manifestOf(ds: ReturnType<typeof fixture>) {
  const { records, result } = collectInspection(() => emit(() =>
    ds.class({ color: ds.t.color.brand }, 'sample')))
  return buildManifest(records, result.css)
}

describe('canonical introspection', () => {
  it('uses the exact same canonical map for ds.introspect() and Manifest v4', () => {
    const ds = fixture()
    const manifest = manifestOf(ds)

    expect(manifest.system).toEqual(ds.introspect())
    expect(JSON.stringify(manifest.system)).toBe(JSON.stringify(ds.introspect()))
    expect(manifest.system).toMatchObject({
      format: 'vanity.introspection/2',
      version: 2,
      prefix: 'manifest',
      tokens: { 'color.brand': { id: 'token:color.brand', owner: { kind: 'system' } } },
      axes: { density: { id: 'axis:density', description: 'Layout density.' } },
      consts: { release: { value: 'next' } },
      utilities: { double: { path: ['double'] } },
    })
  })

  it('explains every public semantic handle species structurally', () => {
    const ds = fixture()
    const explained = emit(() => {
      const fraction = ds.port(0, { label: 'fraction' })
      const button = ds.recipe({ ports: { fraction }, base: { color: ds.t.color.brand } }, 'button')
      const dialog = ds.anatomy({
        parts: ['root', 'content'],
        base: { content: { color: ds.t.color.brand } },
      }, 'dialog')
      return {
        token: ds.explain(ds.t.color.brand),
        axis: ds.explain(ds.axes.density),
        condition: ds.explain(ds.conditions.selected),
        recipe: ds.explain(button),
        anatomy: ds.explain(dialog),
        port: ds.explain(fraction),
      }
    }).returned

    expect(explained.token).toMatchObject({ kind: 'token', id: 'token:color.brand' })
    expect(explained.axis).toMatchObject({ kind: 'axis', name: 'density' })
    expect(explained.condition).toMatchObject({ kind: 'condition', name: 'selected' })
    expect(explained.recipe).toMatchObject({ kind: 'recipe', name: 'button' })
    expect(explained.anatomy).toMatchObject({ kind: 'anatomy', name: 'dialog' })
    expect(explained.port).toMatchObject({ kind: 'port', type: 'number', default: 0 })
  })

  it('validates a produced manifest against the published draft-2020-12 schema', async () => {
    const schema = JSON.parse(await readFile(
      new URL('../../manifest.schema.json', import.meta.url),
      'utf8',
    ))
    expect(schema.$id).toBe(VANITY_MANIFEST_SCHEMA)
    const validate = new Ajv2020({ strict: true }).compile(schema)
    const manifest = manifestOf(fixture())

    expect(validate(manifest)).toBe(true)
    expect(validate.errors).toBeNull()

    const tokenName = Object.keys(manifest.system.tokens)[0]!
    const conditionName = Object.keys(manifest.system.conditions)[0]!
    const axisName = Object.keys(manifest.system.axes)[0]!
    const invalidCases = [
      {
        name: 'missing system ruleGroups',
        value: (() => {
          const { ruleGroups: _ruleGroups, ...system } = manifest.system
          return { ...manifest, system }
        })(),
      },
      {
        name: 'missing runtime tokens',
        value: {
          ...manifest,
          system: {
            ...manifest.system,
            runtime: (() => {
              const { tokens: _tokens, ...runtime } = manifest.system.runtime
              return runtime
            })(),
          },
        },
      },
      {
        name: 'missing token reference',
        value: {
          ...manifest,
          system: {
            ...manifest.system,
            tokens: {
              ...manifest.system.tokens,
              [tokenName]: (() => {
                const { reference: _reference, ...token } = manifest.system.tokens[tokenName]!
                return token
              })(),
            },
          },
        },
      },
      {
        name: 'missing condition ast',
        value: {
          ...manifest,
          system: {
            ...manifest.system,
            conditions: {
              ...manifest.system.conditions,
              [conditionName]: (() => {
                const { ast: _ast, ...condition } = manifest.system.conditions[conditionName]!
                return condition
              })(),
            },
          },
        },
      },
      {
        name: 'missing axis modes',
        value: {
          ...manifest,
          system: {
            ...manifest.system,
            axes: {
              ...manifest.system.axes,
              [axisName]: (() => {
                const { modes: _modes, ...axis } = manifest.system.axes[axisName]!
                return axis
              })(),
            },
          },
        },
      },
      {
        name: 'unknown token field',
        value: {
          ...manifest,
          system: {
            ...manifest.system,
            tokens: {
              ...manifest.system.tokens,
              [tokenName]: { ...manifest.system.tokens[tokenName], unexpected: true },
            },
          },
        },
      },
    ]

    for (const { name, value } of invalidCases) {
      expect(() => assertManifest(value), name).toThrow()
      expect(validate(value), `${name} must be rejected by the published schema`).toBe(false)
    }
  })

  it('rejects malformed, unknown, and semantically invalid Manifest v4 data at the CLI boundary', () => {
    const manifest = manifestOf(fixture())
    expect(() => assertManifest(manifest)).not.toThrow()
    const { modules: _modules, ...withoutModules } = manifest
    const { runtime: _runtime, ...withoutRuntime } = manifest.system
    const moduleId = Object.keys(manifest.modules)[0]!

    expect(() => assertManifest(withoutModules)).toThrow(/modules.*required/)
    expect(() => assertManifest({ ...manifest, unexpected: {} })).toThrow(/unexpected.*not a property/)
    expect(() => assertManifest({
      ...manifest,
      version: VANITY_MANIFEST_VERSION - 1,
    })).toThrow(new RegExp(`version.*must be ${VANITY_MANIFEST_VERSION}`))
    expect(() => assertManifest({ ...manifest, format: 'vanity.manifest/3' })).toThrow(/format.*must be/)
    expect(() => assertManifest({
      ...manifest,
      system: withoutRuntime,
    })).toThrow(/runtime.*required/)
    expect(() => assertManifest({
      ...manifest,
      system: {
        ...manifest.system,
        policies: { ...manifest.system.policies, tokens: { reference: 'inline' } },
      },
    })).toThrow(/policies\.tokens\.reference.*var or val/)
    const [constructorName, constructor] = Object.entries(manifest.system.constructors)[0]!
    expect(() => assertManifest({
      ...manifest,
      system: {
        ...manifest.system,
        constructors: {
          ...manifest.system.constructors,
          [constructorName]: { ...constructor, origin: { kind: 'unknown' } },
        },
      },
    })).toThrow(/origin\.kind.*builtin, system, plugin, or extension|origin.*must be/)
    expect(() => assertManifest({
      ...manifest,
      modules: {
        ...manifest.modules,
        [moduleId]: { ...manifest.modules[moduleId], stale: true },
      },
    })).toThrow(/stale.*not a property/)
  })

  it('categorizes docs-only and CSS-only evolution independently', () => {
    const original = manifestOf(fixture())
    const docs = diffManifests(original, manifestOf(fixture('red', 'Primary brand color')))
    const css = diffManifests(original, manifestOf(fixture('blue')))

    expect(docs.identities.docs.changed).toBe(true)
    expect(docs.identities.css.changed).toBe(false)
    expect(docs.changes.every(change => change.category === 'docs')).toBe(true)

    expect(css.identities.css.changed).toBe(true)
    expect(css.identities.runtime.changed).toBe(false)
    expect(css.changes.some(change => change.category === 'css' && change.path.includes('color.brand'))).toBe(true)
  })

  it('orders module records deterministically regardless of record arrival order', () => {
    const ds = fixture()
    const { records, result } = collectInspection(() => emit(() => {
      ds.raw`h2 { color: red; }`
      return ds.class({ color: ds.t.color.brand }, 'sample')
    }))

    expect(JSON.stringify(buildManifest(records, result.css)))
      .toBe(JSON.stringify(buildManifest([...records].reverse(), result.css)))
  })
})
