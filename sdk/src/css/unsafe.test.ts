import { readFile } from 'node:fs/promises'
import { emit } from '@test'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import { assertManifest } from '../cli'
import { createSystem, unsafe } from '../index'
import { buildManifest } from '../introspect/manifest'
import { collectInspection } from '../introspect/records'

describe('unsafe declaration values', () => {
  it('validates a labeled value and records its declaring style and property', async () => {
    const ds = createSystem().consolidate()
    const { result, records } = collectInspection(() => emit(() => ds.class({ padding: unsafe.value(1, 'optical alignment') }, 'icon')))
    expect(result.css).toContain('padding: 1px;')
    expect(records.filter(record => record.kind === 'escape')).toMatchObject([
      { form: 'unsafe', reason: 'optical alignment', style: 'icon', property: 'padding' },
    ])
    const manifest = buildManifest(records, result.css)
    expect(Object.values(manifest.modules).flatMap(module => module.escapes)).toMatchObject([{ style: 'icon', property: 'padding', reason: 'optical alignment' }])
    const roundTrip = JSON.parse(JSON.stringify(manifest))
    expect(() => assertManifest(roundTrip)).not.toThrow()
    const schema = JSON.parse(await readFile(new URL('../../manifest.schema.json', import.meta.url), 'utf8'))
    const validate = new Ajv2020({ strict: true }).compile(schema)
    expect(validate(roundTrip)).toBe(true)
    expect(validate.errors).toBeNull()
    const style = records.find(record => record.kind === 'style')!
    expect(style.kind === 'style' && style.declarations![0]!.components[0]!.origin).toBe('unsafe')
    expect(() => emit(() => ds.class({ padding: unsafe.value('-1px', 'optical alignment') }))).toThrow(/VANITY_CSS_INVALID_VALUE/)
  })

  it('rejects an unlabeled escape when it is declared in a style or an atom', () => {
    const ds = createSystem().consolidate()
    for (const reason of ['', '   ']) {
      expect(() => emit(() => ds.class({ padding: unsafe.value('1px', reason) }))).toThrow(/non-empty reason/)
      expect(() => emit(() => ds.atoms({ properties: { padding: [0] } })({ padding: unsafe.value('1px', reason) }))).toThrow(/non-empty reason/)
    }
  })

  it('admits the same escape across declaration producers with the shared unit rule', () => {
    const ds = createSystem().consolidate()
    const value = unsafe.value(1, 'optical alignment')
    const producers = [
      () => ds.recipe({ base: { padding: value } }),
      () => ds.anatomy({ parts: ['root'], base: { root: { padding: value } } }),
      () => ds.rules({ '.icon': { padding: value } }),
      () => ds.class(ds.fragment({ padding: value })),
      () => ds.keyframes({ from: { padding: value } }),
    ]
    for (const producer of producers)
      expect(emit<unknown>(producer).css).toContain('padding: 1px;')
  })
})
