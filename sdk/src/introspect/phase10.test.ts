import { readFile } from 'node:fs/promises'
import { createSystem, data } from '@mszr/vanity'
import { emit } from '@test'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { assertManifest } from '../cli'
import { diffManifests } from './diff'
import { buildManifest } from './manifest'
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
    .consolidate({ prefix: 'phase10', audit: { overwriteInventory: 'warn' } })
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
      prefix: 'phase10',
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
    const validate = new Ajv2020({ strict: true }).compile(schema)

    expect(validate(manifestOf(fixture()))).toBe(true)
    expect(validate.errors).toBeNull()
  })

  it('rejects malformed, legacy, unknown, and semantically invalid Manifest v4 data at the CLI boundary', () => {
    const manifest = manifestOf(fixture())
    expect(() => assertManifest(manifest)).not.toThrow()
    const { modules: _modules, ...withoutModules } = manifest
    const { runtime: _runtime, ...withoutRuntime } = manifest.system
    const moduleId = Object.keys(manifest.modules)[0]!

    expect(() => assertManifest(withoutModules)).toThrow(/modules.*required/)
    expect(() => assertManifest({ ...manifest, engine: {} })).toThrow(/engine.*not a property/)
    expect(() => assertManifest({ ...manifest, version: 3 })).toThrow(/version.*must be 4/)
    expect(() => assertManifest({ ...manifest, format: 'vanity.manifest/3', version: 3 })).toThrow(/format.*must be/)
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
