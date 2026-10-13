import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

await mkdir(new URL('test-results/', import.meta.url), { recursive: true })

const kit = process.argv.includes('--kit')
const capture = { value: { base: 'vanity-base', conditional: 'vanity-conditional', recipe: 'vanity-recipe', root: 'vanity-anatomy-root', label: 'vanity-anatomy-label' }, css: '@layer review{.vanity-base,.vanity-recipe,.vanity-anatomy-label{padding:4px}.vanity-conditional{padding:4px}.vanity-conditional[data-ready],.vanity-anatomy-root{padding:8px}}' }
const require2 = createRequire(import.meta.url)
const root = await mkdtemp(join(tmpdir(), 'vanity-review-nuxt-'))
const deps = fileURLToPath(new URL('node_modules', import.meta.url))
const model = fileURLToPath(new URL('host.mjs', import.meta.url))
await symlink(deps, join(root, 'node_modules'))
await mkdir(join(root, 'app/pages'), { recursive: true })
await mkdir(join(root, 'app/components'))
await mkdir(join(root, 'app/plugins'))
await writeFile(join(root, 'package.json'), '{"name":"review-nuxt-fixture","private":true,"type":"module"}')
await writeFile(join(root, 'nuxt.config.mjs'), `import {reviewPlugin} from ${JSON.stringify(model)};${kit ? `import {DevTools} from ${JSON.stringify(require2.resolve('@vitejs/devtools'))};` : ''}const observed={};export default {devtools:{enabled:false},telemetry:false,vite:{plugins:[${kit ? `DevTools({apply:'serve',clientAuth:false,mcp:false,open:false}),` : ''}reviewPlugin(observed)],server:{fs:{allow:[${JSON.stringify(root)},${JSON.stringify(resolve())}]}}}}`)
await writeFile(join(root, 'app/plugins/review.client.ts'), `export default defineNuxtPlugin(async()=>{if(import.meta.dev)await import('virtual:review-probe')})`)
await mkdir(join(root, 'app/styles'))
await writeFile(join(root, 'app/styles/emitted.css'), capture.css)
await writeFile(join(root, 'app/styles/classes.ts'), `import './emitted.css';export const classes=${JSON.stringify(capture.value)}`)
await writeFile(join(root, 'app/components/ReviewChild.vue'), `<script setup>import {classes} from '../styles/classes';defineOptions({name:'ReviewChild'})<\/script><template lang="pug">
section
  div#pug-leaf Pug review target
${Object.keys(capture.value).map(key => [1, 2].map(n => `  div#${key}${n}(:class="classes.${key}" data-ready) ${key}`).join('\n')).join('\n')}
  div#unrelated unrelated
</template>`)
await writeFile(join(root, 'app/pages/index.vue'), `<script setup>defineOptions({name:'ReviewPage'})<\/script><template lang="pug">
main
  ReviewChild
</template>`)
const listener = createServer()
await new Promise(resolve2 => listener.listen(0, '127.0.0.1', resolve2))
const port = listener.address().port
await new Promise(resolve2 => listener.close(() => resolve2()))
const origin = `http://127.0.0.1:${port}`
const log = createWriteStream(new URL(`test-results/nuxt-server${kit ? '-kit' : ''}.log`, import.meta.url))
const child = spawn(process.execPath, [join(dirname(require2.resolve('nuxt/package.json')), 'bin/nuxt.mjs'), 'dev', root, '--port', String(port), '--host', '127.0.0.1', '--no-fork'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NUXT_TELEMETRY_DISABLED: '1' } })
child.stdout.pipe(log)
child.stderr.pipe(log)
let browser
try {
  const deadline = Date.now() + 9e4
  while (true) {
    assert.equal(child.exitCode, null, 'Nuxt remains running')
    try {
      if ((await fetch(origin)).ok)
        break
    }
    catch {
    }
    assert(Date.now() < deadline, 'Nuxt starts')
    await new Promise(resolve2 => setTimeout(resolve2, 200))
  }
  browser = await chromium.launch()
  const page = await browser.newPage()
  await page.addInitScript('globalThis.__name=(fn)=>fn')
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin)
  await page.waitForFunction(() => window.__reviewProbe && document.querySelector('#pug-leaf').__vueParentComponent)
  assert.equal(await page.locator('vanity-review-probe').isVisible(), false)
  await page.evaluate(() => window.__reviewProbe.open())
  assert.equal(await page.locator('vanity-review-probe').isVisible(), true)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Alt+v')
  assert.equal(await page.locator('vanity-review-probe').isVisible(), true)
  await fetch(`${origin}/__review/push`)
  await page.waitForFunction(() => window.__reviewProbe.records.length === 1)
  const chain = await page.locator('#pug-leaf').evaluate((el) => {
    const rows = []
    let instance = el.__vueParentComponent
    while (instance) {
      rows.push({ name: instance.type.name ?? instance.type.__name, file: instance.type.__file ?? null })
      instance = instance.parent
    }
    return rows
  })
  assert(chain.some(row => row.name === 'ReviewChild' && row.file?.endsWith('ReviewChild.vue')))
  assert(chain.some(row => row.name === 'ReviewPage' && row.file?.endsWith('index.vue')))
  const preview = await page.evaluate(() => {
    const read = () => Object.fromEntries([...document.querySelectorAll('div[id]')].map(el => [el.id, getComputedStyle(el).paddingTop]))
    const flatten = rules2 => [...rules2].flatMap(rule => [...rule instanceof CSSStyleRule ? [rule] : [], ...'cssRules' in rule ? flatten(rule.cssRules) : []])
    const rules = [...document.styleSheets].flatMap(sheet => flatten(sheet.cssRules))
    const rows = []
    for (const rule of rules.filter(rule2 => rule2.selectorText.includes('vanity') && rule2.style.getPropertyValue('padding'))) {
      const before = read()
      const value = rule.style.getPropertyValue('padding')
      rule.style.setProperty('padding', '12px')
      const after = read()
      rule.style.setProperty('padding', value)
      rows.push({ selector: rule.selectorText, before, after, restored: read(), changed: Object.keys(before).filter(key => before[key] !== after[key]) })
    }
    return rows
  })
  for (const row of preview) {
    assert.deepEqual(row.restored, row.before)
    assert.equal(row.after.unrelated, row.before.unrelated)
  }
  for (const key of Object.keys(capture.value)) assert(preview.some(row => row.changed.includes(`${key}1`) && row.changed.includes(`${key}2`)), `${key} preview reaches both instances`)
  const kitState = await (await fetch(`${origin}/__review/state`)).json()
  await writeFile(new URL(`test-results/nuxt-kit-state${kit ? '-kit' : ''}.json`, import.meta.url), JSON.stringify(kitState, null, 2))
  assert.equal(kitState.kitSetups, kit ? 2 : 0)
  assert.equal(kitState.kitRegistrations, kit ? 1 : 0)
  if (kit)
    assert.deepEqual(kitState.kitHosts.map(host => host.ssr).sort(), [false, true])
  if (kit) {
    assert(kitState.commands.includes('vanity.review'))
    assert(kitState.docks.includes('vanity.review'))
  }
  assert.deepEqual(errors, [])
  const result = { host: require2('nuxt/package.json').version, browser: browser.version(), kit, kitState, preview, initiallyHidden: true, command: true, keybinding: true, push: true, pug: true, componentChain: chain, errors }
  await writeFile(new URL(`test-results/nuxt-preview${kit ? '-kit' : ''}.json`, import.meta.url), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
}
finally {
  await browser?.close()
  child.kill('SIGTERM')
  await new Promise((resolve2) => {
    if (child.exitCode !== null)
      resolve2()
    else child.once('exit', () => resolve2())
  })
  log.end()
  await rm(root, { recursive: true, force: true })
}
