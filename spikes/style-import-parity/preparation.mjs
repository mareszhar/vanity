import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { directory } from './fixture.mjs'
import { compile, evaluate } from './model.mjs'

/** Measure the answer before and after one valid plugin's initialization. */
export async function observePreparation(vite) {
  const root = join(directory, '.vanity/preparation-fixture')
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'package.json'), '{"name":"preparation-fixture","type":"module"}')
  await writeFile(join(root, 'before.js'), 'export const selected = "before-initialization"')
  await writeFile(join(root, 'client.js'), 'export const selected = "client-after-initialization"')
  const system = join(root, 'system.js')
  const entry = join(root, 'entry.js')
  const virtualSystem = join(root, 'virtual-system.js')
  await writeFile(system, 'export {selected} from "phase-choice"')
  await writeFile(entry, 'export {selected} from "phase-choice"')
  await writeFile(virtualSystem, 'export {selected} from "virtual:initialized"')
  let ready = false
  const events = []
  const rows = []
  async function observe(mode, context) {
    const bundle = await compile(system, (request, importer) => context.resolve(request, importer), async (id) => {
      await context.load({ id })
      return context.getModuleInfo(id)?.code
    })
    rows.push({ mode, selected: evaluate(bundle).selected, requests: bundle.requests })
  }
  await vite.build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'fixture-preparation',
        async buildStart() {
          events.push('preparation-start')
          await observe('buildStart', this)
          events.push('preparation-end')
        },
        async transform(_code, id) {
          if (id === entry) {
            await observe('transform', this)
            const bundle = await compile(virtualSystem, (request, importer) => this.resolve(request, importer), async (id) => {
              await this.load({ id })
              return this.getModuleInfo(id)?.code
            })
            rows.push({ mode: 'configured-virtual-after-initialization', selected: evaluate(bundle).selected })
          }
        },
      },
      {
        name: 'fixture-late-initialization',
        buildStart: {
          order: 'post',
          sequential: true,
          handler() {
            events.push('client-initialized')
            ready = true
          },
        },
        resolveId(request) {
          if (request === 'phase-choice')
            return join(root, ready ? 'client.js' : 'before.js')
          if (request === 'virtual:initialized')
            return '\0virtual:initialized'
        },
        load(id) {
          if (id === '\0virtual:initialized')
            return 'export const selected = "virtual-after-initialization"'
        },
      },
    ],
    build: { write: false, minify: false, lib: { entry, formats: ['es'] } },
  })
  assert.deepEqual(events, ['preparation-start', 'preparation-end', 'client-initialized'])
  assert.equal(rows[0].selected, 'before-initialization')
  assert.equal(rows[1].selected, 'client-after-initialization')
  assert.equal(rows[2].selected, 'virtual-after-initialization')
  const result = { version: vite.version, events, rows, same: rows[0].selected === rows[1].selected }
  await writeFile(join(directory, '.vanity/preparation.json'), JSON.stringify(result, null, 2))
  return result
}
