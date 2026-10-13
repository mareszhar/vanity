import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { createSystem, length } from '../index'
import { buildAgentContext, generateAgentContext } from '../introspect/agent'
import { buildManifest } from '../introspect/manifest'
import { assertManifestShape } from '../introspect/manifestValidation'
import { collectInspection } from '../introspect/records'
import { substrate } from '../substrate'
import { getSystemContract } from '../system/contract'

function system(usage = { for: ['quiet divider'], avoid: 'text and icons' }, properties = ['borderColor'], level = 'forbid') {
  return substrate.modules.runInFileScope({ filePath: 'fixture/system.ts' }, () => createSystem().addTokens(h => ({
    edge: h.tdef.color({ val: 'red', usage, restrict: { properties, level, reason: 'Hairlines need a border role.' } } as any),
    gap: length.px(12),
  })).consolidate())
}

describe('token guidance and restrictions', () => {
  it('projects guidance into explanations and agent context without changing CSS or runtime', () => {
    const ds = system()
    const next = system({ for: ['quiet divider'], avoid: 'focus rings' })
    const captured = collectInspection(() => emit(() => ds.class({ borderColor: ds.t.edge })))
    const manifest = buildManifest(captured.records, captured.result.css)
    assertManifestShape(manifest)
    expect(ds.explain(ds.t.edge)).toMatchObject({ usage: { for: ['quiet divider'], avoid: 'text and icons' } })
    expect(buildAgentContext(manifest).tokens.find(token => token.path === 'edge')).toMatchObject({ usage: { for: ['quiet divider'], avoid: 'text and icons' } })
    expect(generateAgentContext(manifest)).toContain('quiet divider')
    expect(generateAgentContext(manifest)).toContain('text and icons')
    const before = getSystemContract(ds)!.portable.identities
    const after = getSystemContract(next)!.portable.identities
    expect(after).toMatchObject({ compatibility: before.compatibility, css: before.css, runtime: before.runtime })
    expect(after.docs).not.toBe(before.docs)
  })

  it('permits shorthand components and physical or logical family members, rejecting other uses at the declared level', () => {
    for (const level of ['forbid', 'discourage']) {
      const ds = system(undefined, undefined, level)
      for (const property of ['borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'borderInlineStartColor', 'borderInlineEndColor', 'borderBlockStartColor', 'borderBlockEndColor', 'borderInlineColor', 'borderBlockColor', 'border']) {
        const capture = collectInspection(() => emit(() => ds.class({ [property]: property === 'border' ? `1px solid ${ds.t.edge}` : ds.t.edge } as any)))
        expect(capture.findings, property).toEqual([])
      }
      for (const property of ['color', 'outlineColor', 'backgroundColor']) {
        const capture = collectInspection(() => emit(() => ds.class({ [property]: ds.t.edge } as any)))
        expect(capture.findings).toMatchObject([{ diagnostic: { code: 'VANITY_TOKEN_RESTRICTED', severity: level === 'discourage' ? 'warning' : 'error', message: expect.stringContaining(property.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)), detail: expect.arrayContaining(['Hairlines need a border role.']) } }])
      }
    }
  })

  it('changes compatibility for restrictions while keeping emitted CSS and runtime stable', () => {
    const before = getSystemContract(system())!.portable.identities
    const after = getSystemContract(system(undefined, ['borderColor', 'outlineColor']))!.portable.identities
    expect(after.compatibility).not.toBe(before.compatibility)
    expect(after.css).toBe(before.css)
    expect(after.runtime).toBe(before.runtime)
  })

  it('rejects invalid property contracts at definition instead of silently allowing them', () => {
    for (const restrict of [{ properties: ['border*'], level: 'forbid' }, { properties: ['border-color'], level: 'forbid' }, { properties: ['borderColor'], level: 'error' }, { properties: ['notAProperty'], level: 'forbid' }, { properties: ['color'], level: 'forbid', enforce: 'prospective' }])
      expect(() => createSystem().tdef.color({ val: 'red', restrict } as any)).toThrow(/restrict/)
  })
})
