// Independent Nuxt lifecycle model. Run through run.mjs; imports no SDK.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { hashSource, inspectSource } from './registry.mjs'

const spikeRoot = dirname(fileURLToPath(import.meta.url))
const root = await realpath(await mkdtemp(resolve(tmpdir(), 'vanity-provenance-spike-')))
const observations = JSON.parse(await readFile(new URL('./emission-observations.json', import.meta.url)))
const metadata = JSON.parse(await readFile(new URL('./provenance-fixture.json', import.meta.url))).manifest.recipes.row
await mkdir(`${root}/app/pages`, { recursive: true })
await mkdir(`${root}/app/styles`, { recursive: true })
await symlink(resolve(spikeRoot, 'node_modules'), `${root}/node_modules`, 'dir')
await writeFile(`${root}/package.json`, '{"name":"vanity-source-registry-probe","type":"module","private":true}')
await writeFile(`${root}/nuxt.config.mjs`, `import { emitSourceRegistration } from ${JSON.stringify(resolve(spikeRoot, 'registry.mjs'))}
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
export default {
  devtools: { enabled: false }, telemetry: false, ssr: true,
  vite: { server: { fs: { allow: [${JSON.stringify(root)}, ${JSON.stringify(resolve(spikeRoot, '../..'))}] } }, plugins: [{
    name: 'probe-vanity-source-registry', enforce: 'post', apply: 'serve',
    transform(code, id) {
      if (id.endsWith('.css.ts')) {
        const source = relative(${JSON.stringify(root)}, id)
        return code + emitSourceRegistration(source, readFileSync(id))
      }
    }
  }] }
}
`)
await writeFile(`${root}/app/styles/emitted.css`, observations.css)
function styleSource(padding) {
  return `import './emitted.css'
// Authored spacing observation: ${padding}px
export function row(selection = {}) { return selection.size === 'large' ? ${JSON.stringify(observations.observed.recipe.large)} : ${JSON.stringify(observations.observed.recipe.small)} }
if (import.meta.hot) import.meta.hot.accept()
`
}
const styleFile = `${root}/app/styles/Row.css.ts`
function pageSource(marker) {
  return `<script setup>
import { ref, onMounted } from 'vue'
import { row } from '../styles/Row.css'
const items = ref(['alpha', 'beta'])
const selection = { size: 'small' }
const metadata = ${JSON.stringify(metadata)}
onMounted(() => window.__hydrated = true)
const marker = '${marker}'
</script><template><main><p id="marker">{{ marker }}</p><button id="reorder" @click="items.reverse()">Reorder</button>
<ul><li v-for="key in items" :key="key" :data-vanity-key="key" :class="row(selection)" v-vanity-variant="{ recipe: metadata, selection }">Identical row</li></ul></main></template>`
}
await mkdir(`${root}/app/plugins`, { recursive: true })
await writeFile(`${root}/app/plugins/variant.ts`, `import { createVariantDirective } from ${JSON.stringify(resolve(spikeRoot, 'binding.mjs'))}
export default defineNuxtPlugin(({ vueApp }) => { if (import.meta.dev) vueApp.directive('vanity-variant', createVariantDirective()) })`)
const pageFile = `${root}/app/pages/index.vue`
await writeFile(styleFile, styleSource(8))
await writeFile(pageFile, pageSource('version-one'))
const listener = createServer()
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
const port = listener.address().port
await new Promise(resolve => listener.close(resolve))
const origin = `http://127.0.0.1:${port}`
const log = createWriteStream(resolve(root, 'server.log'))
const child = spawn(process.execPath, [resolve(dirname(fileURLToPath(import.meta.resolve('nuxt/package.json'))), 'bin/nuxt.mjs'), 'dev', root, '--port', String(port), '--host', '127.0.0.1', '--no-fork'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NUXT_TELEMETRY_DISABLED: '1' } })
child.stdout.pipe(log)
child.stderr.pipe(log)
const hash = async file => hashSource(await readFile(file))
const sourceId = 'app/styles/Row.css.ts'
async function capture(page) {
  const disk = await hash(styleFile)
  const ran = await page.evaluate(id => window.__vanitySources?.[id], sourceId)
  return inspectSource(disk, ran)
}
let browser
try {
  const deadline = Date.now() + 60000
  while (true) {
    if (child.exitCode !== null)
      throw new Error(`Nuxt exited ${child.exitCode}`)
    try {
      if ((await fetch(origin)).ok)
        break
    }
    catch {}
    assert.ok(Date.now() < deadline, 'Nuxt did not start')
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  const ssr = await (await fetch(origin)).text()
  assert.ok(ssr.includes('Identical row') && /class="[^"]*row/.test(ssr), 'SSR did not render styled rows')
  browser = await chromium.launch()
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
    console.log('page error:', error.message)
  })
  page.on('console', (message) => {
    if (message.type() === 'error')
      console.log('page console:', message.text())
  })
  await page.goto(origin)
  await page.waitForFunction(() => window.__hydrated)
  const initial = await capture(page)
  console.log('initial', initial)
  assert.equal(initial.loaded, true)
  const before = await page.locator('li').nth(1).evaluate(el => ({ key: el.dataset.vanityKey, classes: el.className, padding: getComputedStyle(el).padding, binding: JSON.parse(el.dataset.vanityVariant) }))
  assert.equal(before.padding, '8px')
  await page.locator('#reorder').click()
  const reordered = await page.locator('li').evaluateAll(elements => ({ keys: elements.map(el => el.dataset.vanityKey), candidates: elements.filter(el => el.textContent === 'Identical row').length }))
  assert.deepEqual(reordered.keys, ['beta', 'alpha'])
  assert.equal(reordered.candidates, 2)
  await writeFile(styleFile, styleSource(12))
  await page.waitForFunction(({ sourceId, expected }) => window.__vanitySources?.[sourceId] === expected, { sourceId, expected: await hash(styleFile) })
  // Inspect instead of assuming the style wrapper re-executes on CSS-only HMR.
  const hot = await capture(page)
  console.log('hot', hot)
  await page.reload()
  await page.waitForFunction(() => window.__hydrated)
  const reload = await capture(page)
  console.log('reload', reload)
  assert.equal(reload.loaded, true)
  // Deny updated style JS and CSS to this page; a second page loads current disk.
  await page.route('**/*', route => /Row\.css|Row\.vanity|vanity\/style/.test(route.request().url()) ? route.abort() : route.continue())
  await writeFile(styleFile, styleSource(20))
  const expected = await hash(styleFile)
  const transformDeadline = Date.now() + 10000
  while (!(await (await fetch(`${origin}/_nuxt/styles/Row.css.ts`)).text()).includes(expected)) {
    assert.ok(Date.now() < transformDeadline, 'Updated style transform not served')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const second = await browser.newPage()
  await second.goto(origin)
  await second.waitForFunction(() => window.__hydrated)
  console.log('second state', await capture(second), await second.locator('li').first().evaluate(el => getComputedStyle(el).padding))
  assert.equal((await capture(second)).loaded, true)
  const stale = await capture(page)
  const fresh = await capture(second)
  assert.equal(stale.loaded, false)
  assert.equal(fresh.loaded, true)
  assert.equal(await page.locator('li').first().evaluate(el => getComputedStyle(el).padding), '8px')
  await page.route('**/*index.vue*', route => route.abort())
  await writeFile(pageFile, pageSource('version-two'))
  await second.reload()
  await second.locator('#marker').filter({ hasText: 'version-two' }).waitFor()
  const component = { disk: await hash(pageFile), loaded: 'unverified' }
  assert.equal(await page.locator('#marker').textContent(), 'version-one')
  assert.equal(hot.loaded, true)
  assert.notEqual(hot.ran, initial.ran)
  const result = { fixture: root, browser: browser.version(), initial, before, reordered, hot, reload, stale, fresh, component, errors }
  await writeFile(new URL('./results-nuxt.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
}
finally {
  await browser?.close()
  child.kill('SIGTERM')
  await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve))
  log.end()
}
