import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { checkProject, formatCheckReport } from './check'
import { formatVanityDiagnostic } from './diagnostics'
import { installTestSdk } from './test-support/installedSdk'

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-check-')))
  await installTestSdk(root)
  await writeFile(join(root, 'package.json'), '{"name":"vanity-check-fixture","type":"module"}')
  await writeFile(join(root, 'vanity.config.ts'), `export default { compiler: { system: './system.ts', identifiers: 'debug' } };`)
  await writeFile(join(root, 'system.ts'), `import { createSystem, length } from '@mszr/vanity'; export const ds = createSystem({declarations:{level:'forbid',tokens:['length']}}).addTokens({gap:length.px(8)}).consolidate();`)
  return root
}
async function hostBuild(root: string) {
  await writeFile(join(root, 'vite.config.mjs'), `import {vanityPlugin} from '@mszr/vanity/vite';import options from './vanity.config.ts';export default{plugins:vanityPlugin(options)}`)
  await writeFile(join(root, 'entry.ts'), `import{first}from'./row.css.ts';console.log(first)`)
  return build({ root, logLevel: 'silent', build: { write: false, lib: { entry: join(root, 'entry.ts'), formats: ['es'] } } })
}
const raw = `import { ds } from './system'; export const first = ds.class({padding:'13px'});`
describe('headless compiler check', () => {
  it('reports unanchored selector findings from complete authored capture, once in human output, and honors off', async () => {
    const root = await fixture()
    for (const level of ['warn', 'off', 'error'] as const) {
      await writeFile(join(root, 'system.ts'), `import{createSystem}from'@mszr/vanity';export const ds=createSystem().consolidate({audit:{unanchoredSelectors:'${level}'}})`)
      await writeFile(join(root, 'row.css.ts'), `import{ds}from'./system';export const row=ds.class({'::before':{content:'"x"'},':hover':{color:'red'},'&::before':{color:'blue'}})`)
      const { report } = await checkProject({ root })
      expect(report.exitCode).toBe(level === 'error' ? 1 : 0)
      expect(report.audits.filter(row => row.kind === 'unanchoredSelectors')).toHaveLength(level === 'warn' ? 2 : 0)
      expect(report.unevaluated.some(row => row.kind === 'unanchoredSelectors')).toBe(level === 'error')
      if (level === 'error')
        expect(report.unevaluated.find(row => row.kind === 'unanchoredSelectors')?.reason).toContain('not completely evaluated')
      expect(formatCheckReport(report).match(/matches descendants/g) ?? []).toHaveLength(level === 'off' ? 0 : 2)
      const baselineSchema = JSON.parse(await readFile(new URL('../baseline.schema.json', import.meta.url), 'utf8'))
      const validate = new Ajv2020({ strict: true }).addSchema(baselineSchema).compile(JSON.parse(await readFile(new URL('../check.schema.json', import.meta.url), 'utf8')))
      expect(validate(report), JSON.stringify(validate.errors)).toBe(true)
    }
  })

  it('counts observed mode-specific structure without judging it', async () => {
    const root = await fixture()
    await writeFile(join(root, 'system.ts'), `import{createSystem,data}from'@mszr/vanity';export const ds=createSystem().addAxis('skin',{modes:{calm:'&',playful:data('skin','playful')},default:'calm'}).addConditions({'skin.playful':data('skin','playful').self.or(data('skin','party').self)}).consolidate()`)
    await writeFile(join(root, 'row.css.ts'), `import{ds}from'./system';export const row=ds.class({'skin.playful':{padding:4,margin:8}});export const second=ds.class({padding:{'skin.playful':12}})`)
    const { report } = await checkProject({ root })
    expect(report.exitCode).toBe(0)
    expect(report.modeStyles).toEqual([{ axis: 'skin', mode: 'playful', styles: 2, declarations: 3 }])
    expect(formatCheckReport(report)).toContain('skin.playful: 2 styles, 3 declarations')
    const baselineSchema = JSON.parse(await readFile(new URL('../baseline.schema.json', import.meta.url), 'utf8'))
    const validate = new Ajv2020({ strict: true }).addSchema(baselineSchema).compile(JSON.parse(await readFile(new URL('../check.schema.json', import.meta.url), 'utf8')))
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true)
  })

  it('reports sampled contrast with its method, reachable states and limitations', async () => {
    const root = await fixture()
    await writeFile(join(root, 'system.ts'), `import{createSystem,check,angle}from'@mszr/vanity';const open=createSystem();const tokens=open.defineTokens().add('hue',{val:angle.deg(265),mutable:true,range:['0deg','360deg']}).add(m=>({text:open.color('black'),bg:open.oklch(.99,.005,m.hue)}));export const ds=open.addTokens(tokens).addChecks(t=>[check.textContrast(t.text,t.bg).aa()]).consolidate()`)
    await writeFile(join(root, 'card.css.ts'), `import{ds}from'./system';export const card=ds.class({color:ds.t.text,backgroundColor:ds.t.bg})`)
    const { report } = await checkProject({ root })
    expect(report.exitCode).toBe(0)
    expect(report.contrast).toHaveLength(2)
    expect(report.contrast).toEqual(expect.arrayContaining([expect.objectContaining({ samples: 73, step: { hue: '5°' }, evidence: expect.objectContaining({ level: 'sampled' }) })]))
    expect(formatCheckReport(report)).toContain('WCAG 2')
    expect(formatCheckReport(report)).toContain('73 reachable samples')
    expect(formatCheckReport(report)).toContain('not proof')
    const baselineSchema = JSON.parse(await readFile(new URL('../baseline.schema.json', import.meta.url), 'utf8'))
    const validate = new Ajv2020({ strict: true }).addSchema(baselineSchema).compile(JSON.parse(await readFile(new URL('../check.schema.json', import.meta.url), 'utf8')))
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true)
  })
  it('compares added, value-changed and removed roles without counting unchanged role ownership', async () => {
    const root = await fixture()
    const system = (next: boolean) => `import {createSystem,length} from '@mszr/vanity';export const ds=createSystem().addTokens(h=>({space:{${next ? 'added:length.px(12)' : 'removed:length.px(8)'},changed:length.px(${next ? 20 : 16}),stable:length.px(4)},edge:h.tdef.color({val:'red',restrict:{properties:['borderColor'${next ? ',\'outlineColor\'' : ''}],level:'forbid'}})})).consolidate()`
    await writeFile(join(root, 'system.ts'), system(false))
    await writeFile(join(root, 'row.css.ts'), `import{ds}from'./system';export const row=ds.class({padding:ds.t.space.changed})`)
    const before = await checkProject({ root })
    await mkdir(join(root, '.vanity'))
    await writeFile(join(root, '.vanity/main.manifest.json'), JSON.stringify(before.manifest))
    await writeFile(join(root, 'system.ts'), system(true))
    const result = await checkProject({ root, against: '.vanity/main.manifest.json' })
    expect(result.report.comparison).toMatchObject({ roles: { added: ['space.added'], changedValues: ['space.changed'], removed: ['space.removed'], changedRestrictions: ['edge'] } })
    expect(formatCheckReport(result.report)).toContain('Roles against .vanity/main.manifest.json: 1 added, 1 changed value, 1 removed')
    const expanded = formatCheckReport(result.report, { roles: true })
    expect(expanded).toContain('added: space.added')
    expect(expanded).toContain('changed value: space.changed')
    expect(expanded).toContain('removed: space.removed')
    expect(expanded).toContain('changed restriction: edge')
    expect(expanded).not.toContain('changed value: space.stable')
  })
  it('publishes schemas for round-tripped check output and policy baselines', async () => {
    const root = await fixture()
    await writeFile(join(root, 'row.css.ts'), raw)
    const result = await checkProject({ root, writeBaseline: true })
    const baselineSchema = JSON.parse(await readFile(new URL('../baseline.schema.json', import.meta.url), 'utf8'))
    const checkSchema = JSON.parse(await readFile(new URL('../check.schema.json', import.meta.url), 'utf8'))
    const ajv = new Ajv2020({ strict: true }).addSchema(baselineSchema)
    const validateReport = ajv.compile(checkSchema)
    const validateBaseline = ajv.getSchema(baselineSchema.$id)!
    const baseline = JSON.parse(await readFile(join(root, 'vanity.baseline.json'), 'utf8'))
    const report = JSON.parse(JSON.stringify(result.report))
    expect(validateReport(report), JSON.stringify(validateReport.errors)).toBe(true)
    expect(validateBaseline(baseline), JSON.stringify(validateBaseline.errors)).toBe(true)
    expect(validateReport({ ...report, format: 'vanity.check/2' })).toBe(false)
    expect(validateReport({ ...report, complete: true })).toBe(false)
    expect(validateBaseline({ ...baseline, entries: [{ ...baseline.entries[0], code: 'VANITY_CSS_TOKEN_KIND' }] })).toBe(false)
    expect(validateBaseline({ ...baseline, entries: [{ ...baseline.entries[0], count: 0 }] })).toBe(false)
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    for (const name of ['check', 'baseline']) {
      expect(pkg.exports[`./${name}.schema.json`]).toBe(`./${name}.schema.json`)
      expect(pkg.files).toContain(`${name}.schema.json`)
    }
  })
  it('matches a host build byte for byte with default identifiers and the same diagnostics', async () => {
    const root = await fixture()
    await writeFile(join(root, 'system.ts'), `import {createSystem} from '@mszr/vanity'; export const ds=createSystem({declarations:{level:'discourage',tokens:['length']}}).consolidate();`)
    await writeFile(join(root, 'vite.config.mjs'), `import {vanityPlugin} from '@mszr/vanity/vite'; export default {plugins:vanityPlugin({compiler:{system:'./system.ts'}})};`)
    await writeFile(join(root, 'row.css.ts'), raw)
    await writeFile(join(root, 'entry.ts'), `import {first} from './row.css.ts'; console.log(first);`)
    const checked = await checkProject({ root })
    const css: string[] = []
    const warnings: string[] = []
    await build({ root, logLevel: 'silent', plugins: [{ name: 'fixture-compiler-css', enforce: 'pre', transform(code, id) {
      if (id.split('?')[0].endsWith('.vanity.css'))
        css.push(code)
    } }], customLogger: {
      hasWarned: false,
      info() {},
      warn(message) { warnings.push(message) },
      warnOnce(message) { warnings.push(message) },
      error() {},
      clearScreen() {},
      hasErrorLogged() { return false },
    }, build: { write: false, minify: false, lib: { entry: join(root, 'entry.ts'), formats: ['es'] } } })
    expect([...checked.css.values()].sort()).toEqual(css.sort())
    expect(checked.report.diagnostics.map(formatVanityDiagnostic)).toEqual(warnings)
  })
  it('counts a completed but rejected body without claiming complete CSS or auditing partial CSS', async () => {
    const root = await fixture()
    await writeFile(join(root, 'row.css.ts'), raw)
    const result = await checkProject({ root })
    expect(result.report.coverage).toMatchObject({ total: 1, evaluated: 1, rejected: 1, failed: 0, cssComplete: false, cssEmitted: 0 })
    expect(result.report.modules).toMatchObject([{ source: 'row.css.ts', status: 'rejected', cssComplete: false }])
    expect(result.css.has('row.css.ts')).toBe(false)
    expect(result.report.unevaluated).toContainEqual({ kind: 'scaleStrays', reason: expect.stringContaining('CSS') })
    expect(result.report.audits.some(row => row.kind === 'scaleStrays')).toBe(false)
  })

  it('blocks only dependents of a failing system and still reports independent style errors', async () => {
    const root = await fixture()
    await writeFile(join(root, 'system.ts'), `throw new Error('broken system'); export const ds = {};`)
    await writeFile(join(root, 'row.css.ts'), raw)
    await writeFile(join(root, 'good-system.ts'), `import {createSystem} from '@mszr/vanity'; export const good=createSystem().consolidate();`)
    await writeFile(join(root, 'independent.css.ts'), `import {good} from './good-system'; export const row=good.class({unknownProperty:1});`)
    const result = await checkProject({ root })
    expect(result.report.coverage).toMatchObject({ total: 2, failed: 1, blocked: 1, evaluated: 0 })
    expect(result.report.diagnostics).toContainEqual(expect.objectContaining({ code: 'VANITY_CSS_UNKNOWN_PROPERTY', file: 'independent.css.ts' }))
    expect(result.report.diagnostics.some(row => row.message.includes('broken system'))).toBe(true)
    expect(result.report.unevaluated).toContainEqual({ kind: 'unusedTokens', reason: expect.stringContaining('module') })
  })
  it('accepts an existing baseline, finds a later violation, preserves identity after line movement, and prunes a resolved entry', async () => {
    const root = await fixture()
    await writeFile(join(root, 'row.css.ts'), raw)
    const original = await checkProject({ root, writeBaseline: true })
    expect(original.report.exitCode).toBe(1)
    expect(original.report.baseline.observed).toMatchObject([{ module: 'row.css.ts', style: { export: 'first', name: 'first' }, value: '13px' }])
    expect((await checkProject({ root })).report.exitCode).toBe(0)
    await expect(hostBuild(root)).resolves.toBeDefined()
    await writeFile(join(root, 'row.css.ts'), `${raw}export const later = ds.class({margin:'15px'});`)
    const later = await checkProject({ root })
    expect(later.report.exitCode).toBe(1)
    expect(later.report.diagnostics).toMatchObject([{ code: 'VANITY_DECLARATION_RAW', accepted: true }, { code: 'VANITY_DECLARATION_RAW', accepted: false }])
    await expect(hostBuild(root)).rejects.toThrow('margin')
    await writeFile(join(root, 'row.css.ts'), '\n'.repeat(10) + raw)
    expect((await checkProject({ root })).report.exitCode).toBe(0)
    await expect(hostBuild(root)).resolves.toBeDefined()
    await writeFile(join(root, 'row.css.ts'), `import { ds } from './system'; export const first = ds.class({opacity:1});`)
    const removed = await checkProject({ root, writeBaseline: true })
    expect(removed.report.baseline.resolved).toHaveLength(1)
    expect(JSON.parse(await readFile(join(root, 'vanity.baseline.json'), 'utf8')).entries).toEqual([])
    await expect(hostBuild(root)).resolves.toBeDefined()
  })

  it.each([1, 2])('counts %s authored repeats once across importing style modules', async (repeat) => {
    const root = await fixture()
    await writeFile(join(root, 'common.css.ts'), `import {ds} from './system'; export const rows=[${Array.from({ length: repeat }).fill(`ds.class({padding:'13px'},'repeat')`).join(',')}];`)
    for (const name of ['a', 'b'])
      await writeFile(join(root, `${name}.css.ts`), `import {rows} from './common.css.ts'; export const card=rows[0]`)
    const original = await checkProject({ root, writeBaseline: true })
    expect(original.report.baseline.observed).toMatchObject([{ module: 'common.css.ts', count: repeat }])
    expect(original.report.diagnostics.filter(row => row.code === 'VANITY_DECLARATION_RAW')).toHaveLength(repeat)
    const accepted = await checkProject({ root })
    expect(accepted.report.exitCode).toBe(0)
    expect(accepted.report.baseline.accepted).toBe(repeat)
    expect(accepted.report.diagnostics.filter(row => row.accepted)).toHaveLength(repeat)
    await writeFile(join(root, 'common.css.ts'), `import {ds} from './system'; export const rows=[${Array.from({ length: repeat + 1 }).fill(`ds.class({padding:'13px'},'repeat')`).join(',')}];`)
    const later = await checkProject({ root })
    expect(later.report.exitCode).toBe(1)
    expect(later.report.baseline.accepted).toBe(repeat)
    expect(later.report.diagnostics.filter(row => row.accepted === false)).toHaveLength(1)
  })

  it('keeps an interrupted baseline entry and reports independent errors without claiming complete coverage', async () => {
    const root = await fixture()
    await writeFile(join(root, 'row.css.ts'), raw)
    await checkProject({ root, writeBaseline: true })
    await writeFile(join(root, 'row.css.ts'), `import { ds } from './system'; ds.class({unknownProperty:1}); export const first = ds.class({padding:'13px'});`)
    await writeFile(join(root, 'other.css.ts'), `import { ds } from './system'; export const other = ds.class({margin:'15px'});`)
    const result = await checkProject({ root, writeBaseline: true })
    expect(result.report.exitCode).toBe(1)
    expect(result.report.coverage).toMatchObject({ evaluated: 1, failed: 1, blocked: 0, total: 2 })
    expect(result.report.diagnostics.map(row => row.code)).toContain('VANITY_CSS_UNKNOWN_PROPERTY')
    expect(result.report.diagnostics.map(row => row.code)).toContain('VANITY_DECLARATION_RAW')
    expect(result.report.baseline.unevaluated).toMatchObject([{ entry: { module: 'row.css.ts' }, reason: expect.stringContaining('unknown-property') }])
    expect(JSON.parse(await readFile(join(root, 'vanity.baseline.json'), 'utf8')).entries).toHaveLength(2)
    await expect(hostBuild(root)).rejects.toThrow('unknown-property')
  })

  it('uses exit 2 for unavailable configuration and the documented Nuxt headless boundary', async () => {
    const root = await fixture()
    expect((await checkProject({ root, config: 'missing.ts' })).report.exitCode).toBe(2)
    await mkdir(join(root, 'pages'))
    await writeFile(join(root, 'nuxt.config.ts'), 'export default {}')
    const result = await checkProject({ root })
    expect(result.report.exitCode).toBe(2)
    expect(result.report.diagnostics[0].message).toContain('does not support Nuxt')
  })
})
