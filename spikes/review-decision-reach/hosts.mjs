import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { reviewPlugin } from './host.mjs'

await mkdir(new URL('test-results/', import.meta.url), { recursive: true })

const require2 = createRequire(import.meta.url)
const browser = await chromium.launch()
const rows = []
try {
  for (const major of process.env.PROBE_MAJOR ? [Number(process.env.PROBE_MAJOR)] : [6, 7, 8]) {
    const pkg = require2.resolve(`${major === 8 ? 'vite' : `vite${major}`}/package.json`)
    const { createServer, build } = await import(pathToFileURL(join(dirname(pkg), 'dist/node/index.js')).href)
    const version = require2(`${major === 8 ? 'vite' : `vite${major}`}/package.json`).version
    for (const kit of process.env.PROBE_NO_KIT ? [false] : [false, true]) {
      const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-review-host-')))
      const observed = {}
      let server
      try {
        await writeFile(join(root, 'styles.css'), '@layer review{.vanity-base{padding:4px}.vanity-recipe{padding:8px}.vanity-part{padding:4px}.vanity-condition[data-ready]{padding:8px}@media(min-width:1px){.vanity-media{padding:4px}}@supports(display:block){.vanity-supports{padding:4px}}@scope(.scope){.vanity-scoped{padding:4px}}@starting-style{.vanity-starting{padding:4px}}}')
        await writeFile(join(root, 'index.html'), `<!doctype html><script type="module">import "./styles.css";if(import.meta.env.DEV)import("virtual:review-probe")<\/script><p>application</p><section class="scope">${['base', 'recipe', 'part', 'condition', 'media', 'supports', 'scoped', 'starting'].map(key => [1, 2].map(n => `<div id="${key}${n}" class="vanity-${key}" data-ready>${key}</div>`).join('')).join('')}<div id="unrelated">other</div></section>`)
        const plugins = [reviewPlugin(observed)]
        if (kit) {
          const { DevTools } = await import(pathToFileURL(require2.resolve('@vitejs/devtools')).href)
          plugins.unshift(DevTools({ apply: 'serve', clientAuth: false, mcp: false, open: false }))
        }
        server = await createServer({ root, configFile: false, logLevel: 'silent', plugins, server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { noDiscovery: true } })
        await server.listen()
        const page = await browser.newPage()
        const errors = []
        page.on('pageerror', e => errors.push(e.message))
        await page.goto(server.resolvedUrls.local[0])
        try {
          await page.waitForFunction(() => window.__reviewProbe)
        }
        catch (error) {
          await writeFile(new URL('test-results/host-failure.json', import.meta.url), JSON.stringify({ major, kit, errors, overlay: await page.evaluate(() => document.querySelector('vite-error-overlay')?.shadowRoot?.textContent), html: await page.content() }, null, 2))
          throw error
        }
        assert.equal(await page.locator('vanity-review-probe').isVisible(), false)
        await page.evaluate(() => window.__reviewProbe.open())
        assert.equal(await page.locator('vanity-review-probe').isVisible(), true)
        await page.keyboard.press('Escape')
        assert.equal(await page.locator('vanity-review-probe').isVisible(), false)
        await page.keyboard.press('Control+Alt+v')
        assert.equal(await page.locator('vanity-review-probe').isVisible(), true)
        await page.evaluate(() => {
          window.__reviewProbe.close()
          document.documentElement.setAttribute('data-mesurer-keyboard-owned', '')
        })
        await page.keyboard.press('Control+Alt+v')
        assert.equal(await page.locator('vanity-review-probe').isVisible(), false)
        await page.evaluate(() => document.documentElement.removeAttribute('data-mesurer-keyboard-owned'))
        server.ws.send({ type: 'custom', event: 'vanity:review-probe', data: { text: 'agent replied' } })
        await page.waitForFunction(() => window.__reviewProbe.records.length === 1)
        let command = false
        let dock = false
        if (kit) {
          assert.equal(observed.kitSetups, 1)
          command = observed.kit.commands.list().some(item => item.id === 'vanity.review')
          dock = observed.kit.docks.values().some(item => item.id === 'vanity.review')
          assert(command && dock)
          await observed.kit.commands.execute('vanity.review')
          await page.waitForFunction(() => !document.querySelector('vanity-review-probe').hidden)
        }
        const reach = await page.evaluate(() => {
          const flatten = rules => [...rules].flatMap(rule => [...(rule instanceof CSSStyleRule ? [rule] : []), ...('cssRules' in rule ? flatten(rule.cssRules) : [])])
          const rules = [...document.styleSheets].flatMap(sheet => flatten(sheet.cssRules))
          const read = () => Object.fromEntries([...document.querySelectorAll('div[id]')].map(el => [el.id, getComputedStyle(el).paddingTop]))
          return rules.filter(r => r.selectorText.includes('vanity-')).map((rule) => {
            const original = rule.style.cssText
            const before = read()
            rule.style.setProperty('padding', '12px')
            const after = read()
            rule.style.cssText = original
            return { selector: rule.selectorText, before, after, restored: read(), changed: Object.keys(before).filter(k => before[k] !== after[k]) }
          })
        })
        for (const row of reach) {
          assert.deepEqual(row.restored, row.before)
          assert.equal(row.after.unrelated, row.before.unrelated)
        }
        for (const key of ['base', 'recipe', 'part', 'condition', 'media', 'supports', 'scoped'])assert(reach.some(row => row.changed.includes(`${key}1`) && row.changed.includes(`${key}2`)), `${key} reaches both`)
        const old = await page.locator('vanity-review-probe').elementHandle()
        await server.environments.client.reloadModule(server.environments.client.moduleGraph.getModuleById('\0virtual:review-probe'))
        await page.waitForFunction(() => window.__reviewProbe.records.length === 0)
        assert.equal(await page.locator('vanity-review-probe').count(), 1)
        try {
          assert.equal(await old.evaluate(el => el.isConnected), false)
        }
        catch (error) {
          assert.match(error.message, /context was destroyed/)
        }
        assert.deepEqual(errors, [])
        rows.push({ host: `Vite ${version}`, kit, mount: true, preview: reach, initiallyHidden: true, command: true, keybinding: true, push: true, ownership: true, kitSetups: observed.kitSetups ?? 0, kitCommand: command, kitDock: dock, errors })
        await page.close()
        await server.close()
        server = void 0
        const snapshot = async (directory) => {
          const result = {}
          const walk = async (path, relative = '') => {
            for (const entry of await readdir(path, { withFileTypes: true })) {
              const key = relative + entry.name
              if (entry.isDirectory())
                await walk(join(path, entry.name), `${key}/`)
              else result[key] = await readFile(join(path, entry.name), 'utf8')
            }
          }
          await walk(directory)
          return result
        }
        const previousNodeEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'production'
        await build({ root, configFile: false, logLevel: 'silent', plugins, build: { outDir: 'with-review' } })
        await build({ root, configFile: false, logLevel: 'silent', plugins: [], build: { outDir: 'without-review' } })
        if (previousNodeEnv === void 0)
          delete process.env.NODE_ENV
        else process.env.NODE_ENV = previousNodeEnv
        const withReview = await snapshot(join(root, 'with-review'))
        const withoutReview = await snapshot(join(root, 'without-review'))
        assert.deepEqual(withReview, withoutReview, 'production bytes unchanged')
        assert(!JSON.stringify(withReview).includes('vanity-review-probe'))
        rows.at(-1).productionBytesIdentical = true
      }
      finally {
        await server?.close()
        await rm(root, { recursive: true, force: true })
      }
    }
  }
  await writeFile(new URL('test-results/hosts-results.json', import.meta.url), JSON.stringify({ browser: browser.version(), rows }, null, 2))
  console.log(JSON.stringify(rows, null, 2))
}
finally {
  await browser.close()
}
