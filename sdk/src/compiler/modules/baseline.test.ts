import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSystem } from '../../index'
import { readCompilerBaseline } from './baseline'
import { evaluateStyleModule } from './evaluate'
import { applySourceLocations } from './source'

const entry = { code: 'VANITY_DECLARATION_RAW', module: 'row.css.ts', style: { export: 'first', name: 'manual' }, property: 'padding', condition: [], value: '13px', count: 1 }
function fixture(entries = [entry]) {
  const root = mkdtempSync(join(tmpdir(), 'vanity-baseline-'))
  writeFileSync(join(root, 'vanity.baseline.json'), JSON.stringify({ format: 'vanity.baseline/1', entries }))
  return { root, baseline: readCompilerBaseline(root) }
}
function evaluate(root: string, baseline: ReturnType<typeof readCompilerBaseline>, body: string) {
  const ds = createSystem({ declarations: { level: 'forbid', tokens: ['length'] } }).consolidate()
  const file = join(root, 'row.css.ts')
  const source = applySourceLocations(`const ds = require('fixture').ds; ${body}`, file, root).replaceAll('export const', 'const')
  const session = baseline.createModuleSession(file)
  return { session, run: () => evaluateStyleModule(source, file, 'debug', new Map([['fixture', { ds }]]), () => {}, session.finalization) }
}

describe('compiler baseline', () => {
  it('uses project-relative identity when the host compiles from its application directory', () => {
    const { root } = fixture([{ ...entry, module: 'app/row.css.ts' }])
    const app = join(root, 'app')
    const baseline = readCompilerBaseline(root, undefined, app)
    const result = evaluate(app, baseline, `export const first = ds.class({padding:'13px'},'manual');`)
    expect(result.run()).toHaveProperty('cssByFileScope')
    expect(result.session.findings).toMatchObject([{ accepted: true, identity: { module: 'app/row.css.ts' } }])
  })
  it('accepts the same value after incidental CSS whitespace changes', () => {
    const { root, baseline } = fixture()
    const result = evaluate(root, baseline, `export const first = ds.class({padding:' 13px '},'manual');`)
    expect(result.run()).toHaveProperty('cssByFileScope')
    expect(result.session.findings).toMatchObject([{ accepted: true, identity: entry }])
  })
  it('accepts the established finding after moving lines and rejects a later new finding or an excess repeat', () => {
    const { root, baseline } = fixture()
    for (const prefix of ['', '\n'.repeat(10)]) {
      const result = evaluate(root, baseline, `${prefix}export const first = ds.class({padding:'13px'},'manual');`)
      expect(result.run()).toHaveProperty('cssByFileScope')
      expect(result.session.findings).toMatchObject([{ accepted: true, identity: entry }])
    }
    expect(evaluate(root, baseline, `export const first = ds.class({padding:'13px'},'manual'); export const second = ds.class({margin:'15px'});`).run).toThrow('margin')
    expect(evaluate(root, baseline, `export const first = ds.class([{padding:'13px'},{padding:'13px'}],'manual');`).run).toThrow('padding')
  })

  it('prunes only completely evaluated absent entries and retains interrupted entries when writing', () => {
    const { root, baseline } = fixture()
    const interrupted = evaluate(root, baseline, `ds.class({unknownProperty:1}); export const first = ds.class({padding:'13px'},'manual');`)
    expect(interrupted.run).toThrow('unknown-property')
    const pending = baseline.reconcile([interrupted.session])
    expect(pending.unevaluated).toMatchObject([{ entry, reason: expect.stringContaining('unknown-property') }])
    expect(pending.entries).toEqual([entry])
    const removed = evaluate(root, baseline, `export const first = ds.class({opacity:1},'manual');`)
    removed.run()
    const resolved = baseline.reconcile([removed.session])
    expect(resolved.resolved).toEqual([entry])
    expect(resolved.entries).toEqual([])
  })

  it('rejects a token-kind mismatch in a baseline rather than suppressing a CSS contract error', () => {
    expect(() => fixture([{ ...entry, code: 'VANITY_CSS_TOKEN_KIND' }])).toThrow('VANITY_BASELINE_INVALID')
  })
})
