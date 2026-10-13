// Real Nuxt development pipelines and headless acquisition boundary, independent of the SDK.
// Real Nuxt initialization and development pipelines; no agent evaluations, no listening app server.
import assert from 'node:assert/strict'
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { buildNuxt, loadNuxt } from '@nuxt/kit'
import { directory, root as packageFixture, prepareFixture } from './fixture.mjs'
import { compile, evaluate } from './model.mjs'

const require = createRequire(import.meta.url)
await prepareFixture()
const root = join(directory, '.vanity/nuxt-fixture')
await mkdir(join(root, 'app'), { recursive: true })
await mkdir(join(root, 'node_modules'), { recursive: true })
for (const [name, target] of [['nuxt', dirname(require.resolve('nuxt/package.json'))], ['vue', dirname(require.resolve('vue/package.json'))], ['@fixture', join(packageFixture, 'node_modules/@fixture')]]) {
  await symlink(target, join(root, 'node_modules', name)).catch((error) => {
    if (error.code !== 'EEXIST')
      throw error
  })
}
await writeFile(join(root, 'package.json'), '{"name":"nuxt-resolution-probe","private":true,"type":"module"}')
await writeFile(join(root, 'nuxt.config.mjs'), 'export default { devtools: {enabled:false}, telemetry:false, ssr:true }')
await writeFile(join(root, 'app/app.vue'), '<template><main>Resolver probe</main></template>')
await writeFile(join(root, 'client-only.js'), 'export const selected = "project/client"')
const entry = join(root, 'matrix-entry.js')
await writeFile(entry, await readFile(join(packageFixture, 'matrix-entry.js'), 'utf8'))
const events = []
const rows = []
const hosts = []
let clientServer
let configPhase
let pluginConfigurations = 0
const configured = []
const plugin = {
  name: 'nuxt-resolution-matrix',
  enforce: 'pre',
  async resolveId(specifier, importer) {
    if (specifier === 'plugin-choice')
      return this.resolve('@fixture/exact', importer, { skipSelf: true })
    if (specifier === 'stateful-choice')
      return join(root, 'client-only.js')
    if (specifier === 'virtual-choice')
      return '\0virtual-choice'
  },
  load(id) {
    if (id === '\0virtual-choice')
      return 'export const selected = "virtual"'
  },
  configResolved(config) {
    configPhase = config.build.ssr ? 'nuxt-server' : 'nuxt-client'
    pluginConfigurations++
    configured.push({ phase: configPhase, plugins: config.plugins.map(plugin => plugin.name) })
    for (const configuredPlugin of config.plugins) {
      for (const hookName of ['configureServer', 'buildStart', 'closeBundle']) {
        const hook = configuredPlugin[hookName]
        if (!hook)
          continue
        const handler = (typeof hook === 'function' ? hook : hook.handler).original ?? (typeof hook === 'function' ? hook : hook.handler)
        const capturedPhase = configPhase
        const wrapper = function (...args) {
          events.push({ phase: capturedPhase, plugin: configuredPlugin.name, hook: hookName, environment: this?.environment?.name ?? 'unscoped' })
          return handler.apply(this, args)
        }
        wrapper.original = handler
        configuredPlugin[hookName] = typeof hook === 'function' ? wrapper : { ...hook, handler: wrapper }
      }
    }
  },
}
let viteResolvedHooks = 0
const started = performance.now()
const nuxt = await loadNuxt({ cwd: root, dev: true, ready: true, overrides: {
  devtools: { enabled: false },
  telemetry: false,
  vite: { plugins: [plugin], server: { hmr: false, ws: false, watch: null, warmup: { clientFiles: [] } }, optimizeDeps: { noDiscovery: true }, resolve: { alias: [{ find: 'string-alias', replacement: join(root, 'client-only.js') }, { find: /^regex-alias$/, replacement: join(root, 'client-only.js') }] } },
  hooks: { 'vite:configResolved': function () { viteResolvedHooks++ }, 'vite:serverCreated': async function (server, context) {
    hosts.push({ isClient: context.isClient, isServer: context.isServer, environmentNames: Object.keys(server.environments) })
    if (context.isClient)
      clientServer = server
    assert.ok(clientServer, 'Nuxt creates its client server first')
    const container = clientServer.environments.client.pluginContainer
    const bundle = await compile(entry, (request, importer) => container.resolveId(request, importer), id => container.load(id))
    const exports = evaluate(bundle)
    assert.deepEqual(exports, { value0: 'exact/node.js', value1: 'browser-false-main/node.js', value2: 'browser-map/disabled.js', value3: 'project/client', value4: 'project/client', value5: 'exact/browser.js', value6: 'project/client', value7: 'virtual' })
    rows.push({ host: context.isClient ? 'client' : 'server-trigger-uses-client', exports, requests: bundle.requests })
  } },
} })
const headless = { acquisitionMs: performance.now() - started, viteResolvedHooks, pluginConfigurations, hasClientServer: Boolean(clientServer), viteOptionPlugins: nuxt.options.vite.plugins.map(plugin => plugin.name), explanation: 'loadNuxt initializes modules but does not assemble the configured Vite client pipeline; vite-builder exports bundle/setupWatcher, and bundle creates the pipeline as part of a framework build' }
assert.equal(pluginConfigurations, 0)
assert.equal(viteResolvedHooks, 0)
try {
  await buildNuxt(nuxt)
}
finally {
  await nuxt.close()
}
assert.equal(pluginConfigurations, 2, 'one shared plugin instance configured once per actual host')
assert.equal(rows.length, 2)
const counts = {}
for (const event of events) {
  const key = `${event.phase}/${event.plugin}/${event.hook}/${event.environment}`
  counts[key] = (counts[key] ?? 0) + 1
}
assert.ok(Object.values(counts).every(count => count === 1), JSON.stringify(counts))
await writeFile(join(directory, '.vanity/nuxt.json'), JSON.stringify({ version: nuxt._version, headless, hosts, configured, rows, events, counts }, null, 2))
console.log(JSON.stringify({ version: nuxt._version, headless, hosts, counts }, null, 2))
