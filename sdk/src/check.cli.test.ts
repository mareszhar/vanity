import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { checkProject } from './check'
import { installTestSdk } from './test-support/installedSdk'

const execute = promisify(execFile)
const launcher = fileURLToPath(new URL('../bin/vanity.mjs', import.meta.url))
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-check-cli-')))
  await installTestSdk(root)
  await writeFile(join(root, 'package.json'), '{"name":"check-cli","type":"module"}')
  await writeFile(join(root, 'vanity.config.ts'), `export default{compiler:{system:'./system.ts'}}`)
  await writeFile(join(root, 'system.ts'), `import{createSystem}from'@mszr/vanity';export const ds=createSystem({declarations:{level:'forbid',tokens:['length']}}).consolidate()`)
  await writeFile(join(root, 'row.css.ts'), `import{ds}from'./system';export const row=ds.class({padding:'13px'})`)
  return root
}
async function run(root: string, args: string[]) {
  try {
    return { ...await execute(process.execPath, [launcher, 'check', '--root', root, ...args]), code: 0 }
  }
  catch (error) {
    return error as { stdout: string, stderr: string, code: number }
  }
}
async function validator() {
  const ajv = new Ajv2020({ strict: true })
  ajv.addSchema(JSON.parse(await readFile(new URL('../baseline.schema.json', import.meta.url), 'utf8')))
  return ajv.compile(JSON.parse(await readFile(new URL('../check.schema.json', import.meta.url), 'utf8')))
}

describe('published check command', () => {
  it.each(['wxt', 'vitest'])('emits schema-valid JSON through the installed %s host', async (host) => {
    const root = await fixture()
    await writeFile(join(root, 'system.ts'), `import{createSystem}from'@mszr/vanity';export const ds=createSystem().consolidate()`)
    const vite = `{plugins:vanityPlugin({compiler:{system:'./system.ts'}})}`
    await writeFile(join(root, `${host}.config.mjs`), `import{vanityPlugin}from'@mszr/vanity/vite';export default ${host === 'wxt' ? `{manifest:{name:'CLI',version:'0.0.0'},webExt:{disabled:true},vite:()=>${vite}}` : vite}`)
    if (host === 'wxt') {
      await mkdir(join(root, 'entrypoints/popup'), { recursive: true })
      await writeFile(join(root, 'entrypoints/popup/index.html'), '<main>CLI</main>')
    }
    const result = await run(root, ['--json'])
    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
    const report = JSON.parse(result.stdout)
    const validate = await validator()
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true)
    expect(report.coverage).toMatchObject({ total: 1, evaluated: 1, cssComplete: true })
  })

  it('round trips schema-valid reports with exits 0, 1 and 2, preserves interrupted baselines and formats requested detail', async () => {
    const root = await fixture()
    const validate = await validator()
    const json = async (args: string[], code: number) => {
      const result = await run(root, [...args, '--json'])
      expect(result.code).toBe(code)
      expect(result.stderr).toBe('')
      const report = JSON.parse(result.stdout)
      expect(validate(report), JSON.stringify(validate.errors)).toBe(true)
      expect(report.exitCode).toBe(code)
      return report
    }
    expect((await json([], 1)).coverage).toMatchObject({ evaluated: 1, rejected: 1, cssComplete: false })
    await json(['--write-baseline'], 1)
    expect((await json([], 0)).baseline.accepted).toBe(1)
    const formatted = await run(root, ['--unresolved', '--exceptions', '--derivations', '--roles'])
    expect(formatted.code).toBe(0)
    expect(formatted.stdout.slice(formatted.stdout.indexOf('Coverage')).replace(/Snapshot \S+/, 'Snapshot <identity>').trim()).toMatchInlineSnapshot(`
      "Coverage
        Authored bodies evaluated 1 / 1 style modules; rejected after evaluation 0
        Failed during evaluation 0; blocked by a failing system 0
        CSS emitted for 1 / 1 style modules; complete
        Declarations unresolved 0
      []
        Audits without evidence 4: eagerStyleBarrels (application build evidence was not supplied); cssParityGaps (application build evidence was not supplied); staleArtifacts (application build evidence was not supplied); rootModeDisagreements (application build evidence was not supplied)
      No comparison manifest supplied.
      Baseline (vanity.baseline.json): 1 accepted, 0 resolved, 0 unevaluated
      []
      []
      Snapshot <identity> · exit 0"
    `)
    await json(['--config', 'missing.ts'], 2)
    await writeFile(join(root, 'row.css.ts'), `import{ds}from'./system';ds.class({unknownProperty:1});export const row=ds.class({padding:'13px'})`)
    const interrupted = await json(['--write-baseline'], 1)
    expect(interrupted.coverage).toMatchObject({ evaluated: 0, failed: 1, cssComplete: false })
    expect(interrupted.baseline.unevaluated).toHaveLength(1)
    expect(JSON.parse(await readFile(join(root, 'vanity.baseline.json'), 'utf8')).entries).toHaveLength(1)
    await writeFile(join(root, 'nuxt.config.ts'), 'export default{}')
    expect((await json([], 2)).diagnostics[0]).toMatchObject({ message: expect.stringContaining('does not support Nuxt'), fix: { message: expect.stringContaining('framework build') } })
  })

  it('formats role comparisons and publishes their schema-valid JSON through --against and --roles', async () => {
    const root = await fixture()
    const system = (next: boolean) => `import{createSystem,length}from'@mszr/vanity';export const ds=createSystem().addTokens({space:{${next ? 'added:length.px(12)' : 'removed:length.px(8)'},changed:length.px(${next ? 20 : 16}),stable:length.px(4)}}).consolidate()`
    await writeFile(join(root, 'system.ts'), system(false))
    await writeFile(join(root, 'row.css.ts'), `import{ds}from'./system';export const row=ds.class({padding:ds.t.space.changed})`)
    const before = await checkProject({ root })
    await mkdir(join(root, '.vanity'))
    await writeFile(join(root, '.vanity/main.manifest.json'), JSON.stringify(before.manifest))
    await writeFile(join(root, 'system.ts'), system(true))
    const args = ['--against', '.vanity/main.manifest.json', '--roles']
    const formatted = await run(root, args)
    expect(formatted.code).toBe(0)
    expect(formatted.stdout.slice(formatted.stdout.indexOf('Roles against'), formatted.stdout.indexOf('Baseline (')).trim()).toMatchInlineSnapshot(`
      "Roles against .vanity/main.manifest.json: 1 added, 1 changed value, 1 removed, 0 changed restriction
        added: space.added
        changed value: space.changed
        removed: space.removed"
    `)
    const result = await run(root, [...args, '--json'])
    expect(result.code).toBe(0)
    const report = JSON.parse(result.stdout)
    const validate = await validator()
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true)
    expect(report.comparison.roles).toEqual({ added: ['space.added'], changedValues: ['space.changed'], changedRestrictions: [], removed: ['space.removed'] })
    expect(report.snapshot.manifest).toEqual(expect.any(String))
  })
})
