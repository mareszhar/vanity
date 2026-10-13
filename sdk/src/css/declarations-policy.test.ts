import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { calc, clamp, createSystem, length, max, min, unsafe } from '../index'
import { audit } from '../introspect/audit'
import { buildManifest } from '../introspect/manifest'
import { collectInspection } from '../introspect/records'
import { substrate } from '../substrate'

function system(derivations: 'allow' | 'audit' | 'restrict' = 'audit') {
  return substrate.modules.runInFileScope({ filePath: 'fixture/system.ts' }, () => createSystem({ declarations: {
    level: 'forbid',
    reason: 'Themes must reach these decisions.',
    tokens: ['color', 'length'],
    properties: { zIndex: 'token' },
    mechanics: ['0', 'auto', 'none'],
    derivations,
  } }).addTokens(h => ({
    gap: h.tdef.length({ val: length.px(16), reference: 'var', description: 'Gaps between blocks' }),
    line: h.tdef.length({ val: length.px(1), reference: 'var' }),
    ink: h.tdef.color({ val: 'red', reference: 'var' }),
    folded: h.tdef.color({ val: 'red', reference: 'val' }),
    primitive: h.tdef.length({ val: length.px(12), usage: { tier: 'primitive' } }),
  })).consolidate())
}

function capture(ds: ReturnType<typeof system>, value: unknown, property = 'margin') {
  return collectInspection(() => emit(() => ds.class({ [property]: value } as any, 'row')))
}

describe('declarations policy', () => {
  it('uses the same derivation proof for custom-property components', () => {
    const ds = system('restrict')
    expect(capture(ds, calc(ds.t.gap).multiply(2), '--gap').findings).toEqual([])
    expect(capture(ds, calc(ds.t.gap).multiply(13).divide(16), '--gap').findings.map(finding => finding.diagnostic.code)).toEqual(['VANITY_DECLARATION_DERIVED'])
  })

  it('governs components by type and properties, exempting only declared mechanics', () => {
    const ds = system()
    const port = emit(() => ds.port(length.px(4))).returned
    for (const value of [ds.t.gap, port, unsafe.value('13px', 'optical alignment'), '0', 'auto'])
      expect(capture(ds, value).findings).toEqual([])
    for (const value of ['13px', length.px(8), 'var(--outside)'])
      expect(capture(ds, value).findings.map(finding => finding.diagnostic.code)).toEqual(['VANITY_DECLARATION_RAW'])
    expect(capture(ds, 3, 'zIndex').findings[0]!.diagnostic.code).toBe('VANITY_DECLARATION_RAW')
    const border = capture(ds, `1px solid ${ds.t.ink}`, 'border')
    expect(border.findings).toHaveLength(1)
    expect(border.findings[0]!.diagnostic.message).toContain('border-width')
    expect(capture(ds, `${ds.t.line} solid ${ds.t.ink}`, 'border').findings).toEqual([])
    expect(capture(ds, 'transparent', 'color').findings[0]!.diagnostic.code).toBe('VANITY_DECLARATION_RAW')
  })

  it('explains value proximity and the identity lost by val interpolation', () => {
    const ds = system()
    const raw = capture(ds, '13px').findings[0]!.diagnostic
    expect(raw.detail?.join('\n')).toContain('gap (16px, Gaps between blocks)')
    expect(typeof raw.fix === 'string' ? raw.fix : raw.fix?.message).toContain('unsafe.value')
    const folded = capture(ds, `${ds.t.folded}`, 'color').findings[0]!.diagnostic
    expect(folded.detail?.join('\n')).toContain('folded')
    expect(typeof folded.fix === 'string' ? folded.fix : folded.fix?.message).toContain('reference: \'var\'')
    expect(capture(ds, ds.t.folded, 'color').findings).toEqual([])
  })

  it('suggests the declared replacement instead of a deprecated role', () => {
    const ds = createSystem({ declarations: { level: 'discourage', tokens: ['length'] } }).addTokens(h => ({
      old: h.tdef({ val: length.px(12), deprecated: { reason: 'Choose a semantic gap.', use: 'gap' } }),
      gap: h.tdef({ val: length.px(16), usage: { for: ['gaps between controls'] } }),
    })).consolidate()
    const collected = collectInspection(() => emit(() => ds.class({ padding: '13px' })))
    const details = collected.findings[0]!.diagnostic.detail!.join('\n')
    expect(details).toContain('gap (16px, gaps between controls)')
    expect(details).not.toContain('old (12px')
  })

  it('allows, audits, or restricts the net token transformations', () => {
    for (const mode of ['allow', 'audit', 'restrict'] as const) {
      const ds = system(mode)
      const adjusted = capture(ds, calc(ds.t.gap).multiply(13).divide(16))
      expect(adjusted.findings.map(finding => finding.diagnostic.code)).toEqual(mode === 'restrict' ? ['VANITY_DECLARATION_DERIVED'] : [])
      expect(adjusted.records.find(record => record.kind === 'style')).toMatchObject({
        declarations: [{ components: [{ derivation: { terms: [{ token: 'gap', factor: 13 / 16 }], allowed: false, audit: mode === 'audit' } }] }],
      })
      for (const value of [calc(ds.t.gap).multiply(2), calc(ds.t.gap).divide(2), calc(ds.t.gap).negate(), calc(ds.t.gap).multiply(13).divide(13), calc(ds.t.gap).add(ds.t.line), min(ds.t.gap, ds.t.line), max(ds.t.gap, ds.t.line), clamp(ds.t.line, ds.t.gap, ds.t.gap)])
        expect(capture(ds, value).findings).toEqual([])
      expect(capture(ds, calc(ds.t.gap).multiply(2).add(ds.t.line)).findings.length).toBe(mode === 'restrict' ? 1 : 0)
    }
  })

  it('checks the exact net factor after nested decimal operations', () => {
    const ds = system('restrict')
    const integer = capture(ds, calc(ds.t.gap).multiply(0.1).multiply(3).multiply(10))
    const reciprocal = capture(ds, calc(ds.t.gap).divide(0.3).multiply(0.1))
    expect(integer.findings).toEqual([])
    expect(reciprocal.findings).toEqual([])
    expect(integer.records.find(record => record.kind === 'style')).toMatchObject({ declarations: [{ components: [{ derivation: { terms: [{ factor: 3 }], allowed: true } }] }] })
    expect(reciprocal.records.find(record => record.kind === 'style')).toMatchObject({ declarations: [{ components: [{ derivation: { terms: [{ factor: 1 / 3 }], allowed: true } }] }] })
  })

  it('reports direct primitives and rejects contribution-order enforcement', () => {
    const ds = system()
    expect(capture(ds, ds.t.primitive).findings[0]!.diagnostic.code).toBe('VANITY_DECLARATION_PRIMITIVE')
    expect(() => createSystem({ declarations: { level: 'forbid', enforce: 'prospective' } })).toThrow(/style modules.*order|order.*style modules/)
  })

  it('reports policy-governed scale strays once and keeps the advisory audit without a policy', () => {
    for (const enabled of [false, true]) {
      const ds = createSystem(enabled ? { declarations: { level: 'discourage', tokens: ['length'] } } : {}).addTokens({ gap: length.px(8) }).consolidate()
      const captured = collectInspection(() => emit(() => {
        for (let index = 0; index < 6; index++)
          ds.class({ padding: ds.t.gap }, `token${index}`)
        ds.class({ padding: '13px' }, 'stray')
      }))
      const manifest = buildManifest(captured.records, captured.result.css)
      expect(audit(manifest, captured.result.css).filter(finding => finding.kind === 'scaleStrays')).toHaveLength(enabled ? 0 : 1)
      expect(captured.findings).toHaveLength(enabled ? 1 : 0)
      if (enabled)
        expect(captured.findings[0]!.diagnostic.severity).toBe('warning')
    }
  })
})
