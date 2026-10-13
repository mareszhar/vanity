// Framework initialization and lifecycle observations independent of the SDK.
// Real WXT headless client pipeline and Vitest-created server; no tests/agent evaluations executed.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import net from 'node:net'
import { join } from 'node:path'
import { createVitest, version as vitestVersion } from 'vitest/node'
import { createServer as createWxtServer, version as wxtVersion } from 'wxt'
import { directory, entry, prepareFixture, root } from './fixture.mjs'
import { compile, evaluate } from './model.mjs'

await prepareFixture()
const events = []
const rows = []
let host
let viteServer
let listenCalls = 0
const listeners = []
const listen = net.Server.prototype.listen
net.Server.prototype.listen = function (...args) {
  listenCalls++
  const record = { host, closed: false, stack: new Error('listen attribution').stack }
  listeners.push(record)
  this.once('close', () => {
    record.closed = true
  })
  return listen.apply(this, args)
}
function configuration() {
  return { root, configFile: false, logLevel: 'silent', optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, resolve: { alias: [{ find: 'string-alias', replacement: join(root, 'client-only.js') }, { find: /^regex-alias$/, replacement: join(root, 'client-only.js') }] }, plugins: [{ name: 'framework-matrix-choice', async resolveId(specifier, importer) {
    if (specifier === 'plugin-choice')
      return this.resolve('@fixture/exact', importer, { skipSelf: true })
    if (specifier === 'stateful-choice')
      return join(root, 'client-only.js')
    if (specifier === 'virtual-choice')
      return '\0virtual-choice'
  }, load(id) {
    if (id === '\0virtual-choice')
      return 'export const selected = "virtual"'
  } }, {
    name: 'framework-instrument',
    configResolved(config) {
      for (const plugin of config.plugins) {
        for (const hookName of ['configureServer', 'buildStart', 'closeBundle']) {
          const hook = plugin[hookName]
          if (!hook)
            continue
          const handler = typeof hook === 'function' ? hook : hook.handler
          const wrapped = function (...args) {
            events.push({ host, plugin: plugin.name, hook: hookName, environment: this?.environment?.name ?? 'unscoped' })
            return handler.apply(this, args)
          }
          plugin[hookName] = typeof hook === 'function' ? wrapped : { ...hook, handler: wrapped }
        }
      }
    },
    configureServer(server) { viteServer = server },
  }] }
}
async function run(name, acquisitionMs) {
  const container = viteServer.environments.client.pluginContainer
  const bundle = await compile(entry, (request, importer) => container.resolveId(request, importer), id => container.load(id))
  const exports = evaluate(bundle)
  const pluginAnswer = await container.resolveId('plugin-choice', entry)
  assert.equal(bundle.requests.find(request => request.specifier === 'plugin-choice').result, pluginAnswer.id)
  assert.deepEqual(exports, { value0: 'exact/node.js', value1: 'browser-false-main/node.js', value2: 'browser-map/disabled.js', value3: 'project/client', value4: 'project/client', value5: pluginAnswer.id.endsWith('/node.js') ? 'exact/node.js' : 'exact/browser.js', value6: 'project/client', value7: 'virtual' })
  assert.equal(viteServer.httpServer, null)
  assert.equal(viteServer.config.server.hmr, false)
  rows.push({ name, acquisitionMs, exports, pluginAnswer, clientConditions: viteServer.environments?.client.config.resolve.conditions, requests: bundle.requests, pluginNames: viteServer.config.plugins.map(plugin => plugin.name) })
}
try {
  host = 'WXT'
  let started = performance.now()
  const wxt = await createWxtServer({ root, configFile: false, dev: { server: { port: 39451, strictPort: true } }, webExt: { disabled: true }, vite: () => configuration() })
  try {
    await run('wxt-headless', performance.now() - started)
  }
  finally {
    await wxt.stop()
  }
  host = 'Vitest'
  viteServer = undefined
  started = performance.now()
  const vitest = await createVitest({ root, config: false, watch: false, api: false }, configuration())
  try {
    viteServer ??= vitest.vite
    await run('vitest-created-server', performance.now() - started)
  }
  finally {
    await vitest.close()
  }
}
finally {
  net.Server.prototype.listen = listen
}
console.log(JSON.stringify({ listeners, environments: Object.fromEntries(Object.entries(viteServer.environments).map(([name, env]) => [name, { consumer: env.config.consumer, hot: env.config.dev.hot }])) }, null, 2))
assert.equal(listenCalls, 0, 'transportless headless pipeline must not listen')
for (const listener of listeners)
  assert.match(listener.stack, /node_modules\/(?:vitest|vite)\//, 'any listen must belong to the host')
const counts = {}
for (const event of events) {
  const key = `${event.host}/${event.plugin}/${event.hook}/${event.environment}`
  counts[key] = (counts[key] ?? 0) + 1
}
assert.ok(Object.values(counts).every(count => count === 1), JSON.stringify(counts))
await writeFile(join(directory, '.vanity/frameworks.json'), JSON.stringify({ wxtVersion, vitestVersion, rows, events, counts, listenCalls, listeners }, null, 2))
console.log(JSON.stringify({ wxtVersion, vitestVersion, rows: rows.map(({ name, acquisitionMs }) => ({ name, acquisitionMs })), counts, listenCalls, listeners }, null, 2))
