import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import net from 'node:net'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { directory, entry, prepareFixture, root } from './fixture.mjs'
import { getLifecycleCounts, instrumentLifecycle } from './lifecycle.mjs'
import { compile, evaluate } from './model.mjs'
import { observeOptimizer } from './optimizer.mjs'
import { observePreparation } from './preparation.mjs'

const vite = await import(process.env.VANITY_VITE_TEST_ENTRY ? pathToFileURL(process.env.VANITY_VITE_TEST_ENTRY).href : 'vite')
await prepareFixture()
const events = []
const cells = []
let phase = 'headless'
let listens = 0
const originalListen = net.Server.prototype.listen
net.Server.prototype.listen = function (...args) {
  listens++
  return originalListen.apply(this, args)
}
const configFile = join(root, 'vite.config.mjs')
await writeFile(configFile, `import {configuration} from ${JSON.stringify(pathToFileURL(join(directory, 'fixture.mjs')).href)}; export default configuration()`)
const options = extra => ({ root, configFile, plugins: [instrumentLifecycle(events, () => phase), ...extra], server: { middlewareMode: true, hmr: false, ws: false, watch: null } })
const expected = { value0: 'exact/node.js', value1: 'browser-false-main/node.js', value2: 'browser-map/disabled.js', value3: 'project/client', value4: 'project/client', value5: 'exact/browser.js', value6: 'project/client', value7: 'virtual' }
async function observe(mode, resolver, loader) {
  const starts = events.filter(event => event.hook === 'buildStart').length
  const result = evaluate(await compile(entry, resolver, loader))
  assert.deepEqual(result, expected)
  assert.equal(events.filter(event => event.hook === 'buildStart').length, starts)
  cells.push({ mode, result })
}
try {
  for (const mode of ['headless', 'development']) {
    phase = mode
    const server = await vite.createServer(options([]))
    try {
      const container = server.environments.client.pluginContainer
      const resolver = (request, importer) => container.resolveId(request, importer)
      const loader = id => container.load(id)
      await resolver('stateful-choice', entry)
      await observe(mode, resolver, loader)
      if (mode === 'development')
        await observe('server-trigger-uses-client', resolver, loader)
      assert.equal(server.httpServer, null)
      if (mode === 'headless') {
        const cases = [
          ['@fixture/exact/a', 'exact/node-a.js'],
          ['@fixture/exact/b', 'exact/node-b.js'],
          ['@fixture/pattern/a/item', 'pattern/node-a/item.js'],
          ['@fixture/pattern/b/item', 'pattern/node-b/item.js'],
          ['@fixture/nested', 'nested/node.js'],
          ['@fixture/browser-string', 'browser-string/node.js'],
          ['@fixture/browser-map', 'browser-map/node.js'],
          ['@fixture/browser-null', 'browser-null/node.js'],
          ['@fixture/unchanged', 'unchanged/node.js'],
          ['plugin-a', 'exact/browser.js'],
          ['plugin-b', 'exact/browser.js'],
          ['plugin-pattern-a', 'pattern/browser/item.js'],
          ['plugin-pattern-b', 'pattern/browser/item.js'],
          ['plugin-direct-browser', 'exact/browser.js'],
          ['react', 'exact/browser.js'],
          ['buffer', 'buffer/browser.js'],
        ]
        const packageEntry = join(root, 'package-entry.js')
        for (const [request, value] of cases) {
          await writeFile(packageEntry, `export {selected} from ${JSON.stringify(request)}`)
          assert.equal(evaluate(await compile(packageEntry, resolver, loader)).selected, value)
        }
        for (const request of ['plugin-false', 'plugin-throw', 'plugin-transitive', 'plugin-outer', 'plugin-unmapped']) {
          await writeFile(packageEntry, `export {selected} from ${JSON.stringify(request)}`)
          await assert.rejects(async () => evaluate(await compile(packageEntry, resolver, loader)), error => error.message.includes(request) && error.message.includes(packageEntry) && error.message.includes('Import the package by name in the style module.') && (request !== 'plugin-outer' || error.message.includes('plugin-inner')) && (request !== 'plugin-unmapped' || error.message.includes('Possible causes')))
        }
        await writeFile(packageEntry, 'import {readFileSync} from "node:fs"; import {readFileSync as bare} from "fs"; export const name = JSON.parse(readFileSync(new URL("./package.json", "file:" + __filename))).name; export const same = bare === readFileSync')
        // The CJS evaluation model supplies its entry filename explicitly.
        const builtins = await compile(packageEntry, resolver, loader)
        const builtinSource = builtins.source.replaceAll('__filename', JSON.stringify(packageEntry))
        assert.deepEqual(evaluate({ ...builtins, source: builtinSource }), { name: 'style-import-fixture', same: true })
        await writeFile(packageEntry, 'import {createSystem} from "compiler-fixture"; export const system = createSystem().consolidate()')
        const compilerRoot = dirname(createRequire(pathToFileURL(packageEntry)).resolve('compiler-fixture'))
        assert.deepEqual(evaluate(await compile(packageEntry, resolver, loader, undefined, file => file.startsWith(`${compilerRoot}/`))), { system: { kind: 'system' } })
      }
    }
    finally {
      await server.close()
    }
  }
  for (const watch of [false, true]) {
    phase = watch ? 'watch' : 'build'
    let captured = false
    const observer = { name: 'fixture-evaluate', async transform(_code, id) {
      if (id !== join(root, 'client-only.js') || captured)
        return
      captured = true
      await observe(phase, (request, importer) => this.resolve(request, importer), async (id) => {
        await this.load({ id })
        return this.getModuleInfo(id)?.code
      })
    } }
    const output = await vite.build({ ...options([observer]), build: { write: false, minify: false, lib: { entry: join(root, 'client-only.js'), formats: ['es'] }, ...(watch ? { watch: {} } : {}) } })
    if (watch) {
      try {
        await new Promise((accept, reject) => output.on('event', (event) => {
          if (event.code === 'ERROR')
            reject(event.error)
          if (event.code === 'BUNDLE_END')
            accept()
        }))
      }
      finally {
        await output.close()
      }
    }
    assert.ok(captured)
  }
}
finally {
  net.Server.prototype.listen = originalListen
}
assert.equal(listens, 0)
const preparation = await observePreparation(vite)
const optimizer = await observeOptimizer(vite)
const counts = getLifecycleCounts(events)
assert.ok(Object.values(counts).every(count => count === 1), JSON.stringify(counts))
await writeFile(join(directory, '.vanity/results.json'), JSON.stringify({ version: vite.version, cells, events, counts, listens, preparation, optimizer }, null, 2))
console.log(JSON.stringify({ version: vite.version, cells: cells.map(cell => cell.mode), lifecycleKeys: Object.keys(counts).length, listens, preparationSame: preparation.same }))
