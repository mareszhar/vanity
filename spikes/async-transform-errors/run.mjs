import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer as createPortProbe } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, expect } from '@playwright/test'

// Local exports model a compiler cache; this spike imports no Vanity code.
const entries = process.argv.slice(2)
const hosts = entries.length ? entries : [import.meta.resolve('vite')]
const browser = await chromium.launch({ headless: true })
try {
  for (const host of hosts) {
    const { createServer } = await import(host.startsWith('file:') ? host : pathToFileURL(host).href)
    for (const policy of ['accepted', 'pending', 'grace']) {
      const root = await realpath(await mkdtemp(join(tmpdir(), 'async-transform-errors-')))
      const logs = []
      let accepted = { caption: '12px' }
      let pending
      let startEvaluation
      let releaseEvaluation
      let requestStarted
      const started = new Promise((resolve) => {
        requestStarted = resolve
      })
      const evaluationStarted = new Promise((resolve) => {
        startEvaluation = resolve
      })
      const evaluationReleased = new Promise((resolve) => {
        releaseEvaluation = resolve
      })
      const portProbe = createPortProbe()
      await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve))
      const port = portProbe.address().port
      await new Promise(resolve => portProbe.close(resolve))
      const beginEvaluation = () => {
        pending = evaluationReleased.then(() => {
          accepted = { menu: '14px' }
          return accepted
        })
        startEvaluation()
      }
      const server = await createServer({
        root,
        configFile: false,
        customLogger: {
          info() {},
          warn() {},
          warnOnce() {},
          clearScreen() {},
          hasWarned: false,
          error(message) { logs.push(message) },
          hasErrorLogged() { return false },
        },
        plugins: [{
          name: 'local-compiler',
          async transform(_code, id) {
            if (id !== join(root, 'style.js'))
              return
            requestStarted()
            let system = policy === 'pending' && pending ? await pending : accepted
            if (!system.menu && policy === 'grace') {
              await new Promise(resolve => setTimeout(resolve, 50))
              system = accepted
            }
            if (!system.menu)
              throw new Error('style requires menu')
            return `document.getElementById('card').style.fontSize = '${system.menu}'`
          },
        }],
        server: { host: '127.0.0.1', port, strictPort: true, watch: null },
      })
      const page = await browser.newPage()
      try {
        await writeFile(join(root, 'index.html'), '<div id="card">card</div><script type="module" src="/style.js"></script>')
        await writeFile(join(root, 'style.js'), '// authored consumer\n')
        await server.listen()
        beginEvaluation()
        await evaluationStarted
        const navigation = page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' })
        await started
        // A compilation already known to the host takes longer than a grace window.
        await new Promise(resolve => setTimeout(resolve, 100))
        releaseEvaluation()
        await navigation
        const overlays = await page.locator('vite-error-overlay').count()
        if (policy === 'pending') {
          assert.equal(overlays, 0)
          assert.equal(logs.length, 0)
          await expect(page.locator('#card')).toHaveCSS('font-size', '14px')
        }
        else {
          assert.equal(overlays, 1)
          assert.ok(logs.some(message => message.includes('style requires menu')))
        }
        // A persistent failure still reaches native logging and the overlay.
        accepted = {}
        pending = undefined
        server.moduleGraph.onFileChange(join(root, 'style.js'))
        for (const environment of Object.values(server.environments ?? {}))
          environment.moduleGraph.onFileChange(join(root, 'style.js'))
        await page.reload({ waitUntil: 'networkidle' })
        await expect(page.locator('vite-error-overlay')).toContainText('style requires menu')
        console.log(JSON.stringify({ host, policy, overlapOverlay: overlays, persistentOverlay: true }))
      }
      finally {
        releaseEvaluation()
        await page.close()
        await server.close()
        await rm(root, { recursive: true, force: true })
      }
    }
  }
}
finally { await browser.close() }
