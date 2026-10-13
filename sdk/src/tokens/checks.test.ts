import { emit } from '@test'
import { describe, expect, it } from 'vitest'
import { check, colorSchemes, createSystem, data } from '../index'
import { buildManifest } from '../introspect/manifest'
import { collectInspection } from '../introspect/records'
import { getSystemContract } from '../system/contract'

describe('system contrast checks', () => {
  it('measures the native scheme arm rather than its inferred base value', () => {
    const open = createSystem().addAxis('scheme', colorSchemes())
    expect(() => open.addTokens({ text: open.color('black'), bg: open.tdef.color({ axes: { scheme: { light: 'white', dark: 'black' } } }) }).addChecks(t => [check.textContrast(t.text, t.bg).aa()]).consolidate()).toThrow(/VANITY_TOKENS_CONTRAST.*scheme=dark/)
  })

  it('measures declared mode arms under the same context as CSS emission', () => {
    const open = createSystem().addAxis('skin', { modes: { calm: '&', crisp: data('skin', 'crisp') }, default: 'calm' })
    expect(() => open.addTokens({ text: open.color('black'), bg: open.tdef.color({ val: 'white', axes: { skin: { crisp: 'black' } } }) }).addChecks(t => [check.textContrast(t.text, t.bg).aa()]).consolidate()).toThrow(/VANITY_TOKENS_CONTRAST.*skin=crisp/)
  })
  it('attaches additive checks without changing the original open system', () => {
    const open = createSystem().addTokens(h => ({ text: h.color('black'), bg: h.color('white'), faint: h.color('white') }))
    const checked = open.addChecks(t => [check.textContrast(t.text, t.bg).aa()])
    expect(() => open.consolidate()).not.toThrow()
    expect(() => checked.consolidate()).not.toThrow()
    expect(() => checked.addChecks(t => [check.textContrast(t.faint, t.bg).aa()]).consolidate()).toThrow(/VANITY_TOKENS_CONTRAST.*faint \/ bg/)
    expect(() => checked.consolidate()).not.toThrow()
  })

  it('changes only the docs identity and carries evidence into a later style capture', () => {
    const open = createSystem().addTokens(h => ({ text: h.color('black'), bg: h.color('white') }))
    const plain = open.consolidate()
    const aa = open.addChecks(t => [check.textContrast(t.text, t.bg).aa()]).consolidate()
    const aaa = open.addChecks(t => [check.textContrast(t.text, t.bg).aaa()]).consolidate()
    const identities = [plain, aa, aaa].map(ds => getSystemContract(ds)!.portable.identities)
    for (const kind of ['compatibility', 'css', 'runtime'] as const)
      expect(identities.map(id => id[kind])).toEqual([identities[0]![kind], identities[0]![kind], identities[0]![kind]])
    expect(new Set(identities.map(id => id.docs)).size).toBe(3)
    const captured = collectInspection(() => emit(() => aa.class({ color: aa.t.text })))
    const manifest = buildManifest(captured.records, captured.result.css)
    expect(Object.values(manifest.modules).flatMap(m => m.contrast)).toEqual(expect.arrayContaining([
      expect.objectContaining({ pairing: 'text on bg', algorithm: 'wcag2', evidence: { level: 'environments', environments: ['light', 'dark'] } }),
    ]))
    expect(emit(() => plain.class({ color: plain.t.text })).css).toBe(captured.result.css)
  })
})
