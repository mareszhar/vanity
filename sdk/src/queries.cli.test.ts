import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { transformSync } from 'esbuild'
import { describe, expect, it, vi } from 'vitest'
import { runVanityCli } from './cli'
import { evaluateStyleModule } from './compiler/modules/evaluate'
import { applySourceLocations } from './compiler/modules/source'
import { createSystem, length } from './index'
import { buildManifest } from './introspect/manifest'
import { queryManifest } from './introspect/queries'
import { collectInspection } from './introspect/records'
import { captureEmission } from './testing'

describe('manifest-sourced CLI queries', () => {
  it('returns partial word matches below fuller matches, matches plurals and separates avoid-only warnings', () => {
    const open = createSystem()
    const ds = open.addTokens({ color: {
      border: open.tdef.color({ val: 'gray', usage: { for: ['divider'], avoid: 'text and icons' } }),
      quiet: open.tdef.color({ val: 'silver', usage: { for: ['quiet dividers'] } }),
    } }).consolidate()
    const { records, result } = collectInspection(() => captureEmission(() => ds.class({ color: ds.t.color.border })))
    const manifest = buildManifest(records, result.css)
    const query = (subject: string) => queryManifest(manifest, 'roles', subject) as { roles: Array<{ path: string }>, warnings: Array<{ path: string, matches: Array<{ field: string, text: string }> }> }
    expect(query('quiet divider').roles.map(role => role.path)).toEqual(['color.quiet', 'color.border'])
    expect(query('dividers').roles.map(role => role.path).sort()).toEqual(['color.border', 'color.quiet'])
    expect(query('icon')).toEqual({ roles: [], warnings: [expect.objectContaining({ path: 'color.border', matches: [{ field: 'usage.avoid', text: 'text and icons' }] })] })
    expect(query('div')).toEqual({ roles: [], warnings: [] })
  })

  it('finds guided roles, emitted examples, export parts and focused context with snapshot metadata', async () => {
    const schema = JSON.parse(await readFile(new URL('../query.schema.json', import.meta.url), 'utf8'))
    const manifestSchema = JSON.parse(await readFile(new URL('../manifest.schema.json', import.meta.url), 'utf8'))
    const validate = new Ajv2020({ strict: true }).addSchema(manifestSchema).compile(schema)
    const root = await mkdtemp(join(tmpdir(), 'vanity-query-contract-'))
    const manifestPath = join(root, '.vanity/manifest.json')
    const open = createSystem()
    const ds = open.addTokens({
      space: { sm: open.tdef.length({ val: length.px(8), usage: { for: ['quiet inset'] } }) },
      color: { border: open.tdef.color({ val: 'gray', description: 'Quiet divider between cards', usage: { for: ['quiet divider'] } }) },
    }).consolidate()
    const source = `const {ds}=require('fixture'); export const card=ds.class({padding:ds.t.space.sm,borderColor:ds.t.color.border}); export const parts=ds.anatomy({parts:['root','label'],base:{root:{padding:ds.t.space.sm},label:{color:ds.t.color.border}}});`
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await mkdir(join(root, '.vanity'))
      await mkdir(join(root, 'components'))
      await writeFile(join(root, 'components/card.css.ts'), source)
      const evaluated = evaluateStyleModule(transformSync(applySourceLocations(source, join(root, 'components/card.css.ts'), root, undefined, true), { loader: 'ts', format: 'cjs' }).code, join(root, 'components/card.css.ts'), 'debug', new Map([['fixture', { ds }]]))
      const manifest = buildManifest(evaluated.records, [...evaluated.cssByFileScope.values()].join('\n'), { root })
      await writeFile(manifestPath, JSON.stringify(manifest))
      await utimes(manifestPath, new Date('2026-10-10T00:00:00Z'), new Date('2026-10-10T00:00:00Z'))
      const run = async (args: string[]) => {
        output.mockClear()
        await runVanityCli([...args, manifestPath, '--json'])
        const report = JSON.parse(String(output.mock.calls[0]![0]))
        expect(validate(report), JSON.stringify(validate.errors)).toBe(true)
        expect(report).toMatchObject({ format: 'vanity.query/1', version: 1, manifest: { version: 5, identities: manifest.system.identities, writtenAt: '2026-10-10T00:00:00.000Z' } })
        expect(report.warnings).toEqual([expect.stringContaining('components/card.css.ts is newer than the manifest')])
        await runVanityCli([...args, manifestPath])
        let human = String(output.mock.calls.at(-1)![0])
        for (const [kind, identity] of Object.entries(manifest.system.identities))
          human = human.replaceAll(identity, `<${kind}>`)
        Object.values(manifest.modules).flatMap(module => Object.values(module.styles)).forEach((style, index) => {
          human = human.replaceAll(style.class, `<style${index}>`)
        })
        expect(human).toMatchSnapshot(args.join(' '))
        return report.result
      }
      const roles = await run(['roles', '--for', 'quiet divider'])
      expect(roles.roles[0]).toMatchObject({ path: 'color.border', matches: [{ field: 'usage.for', text: 'quiet divider' }, { field: 'description', text: 'Quiet divider between cards' }] })
      const examples = await run(['examples', 'color.border'])
      expect(examples.map((example: any) => example.declaration.property).sort()).toEqual(['border-color', 'color'])
      const explain = await run(['explain', 'components/card.css.ts#card'])
      expect(explain.declarations.map((declaration: any) => declaration.property)).toEqual(['padding', 'border-color'])
      const part = await run(['explain', 'components/card.css.ts#parts.label'])
      expect(part.declarations.map((declaration: any) => declaration.property)).toEqual(['color'])
      const tokens = await run(['context', '--focus', 'space'])
      expect(tokens.tokens.map((token: any) => token.path)).toEqual(['space.sm'])
      const module = await run(['context', '--focus', 'components/card.css.ts'])
      expect(module.modules.map((entry: any) => entry.source)).toEqual(['components/card.css.ts'])
      expect(module.tokens.map((token: any) => token.path).sort()).toEqual(['color.border', 'space.sm'])
    }
    finally {
      output.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  })
})
