import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import * as localVite from 'vite'

const browser = await chromium.launch({ headless: true })
try {
  for (const host of process.argv.slice(2).length
    ? process.argv.slice(2)
    : ['local']) {
    const vite
      = host === 'local' ? localVite : await import(pathToFileURL(host).href)
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'css-install-spike-')),
    )
    let server
    let generation = 0
    const completed = new Map()
    const pruned = new Set()
    try {
      await writeFile(
        join(root, 'index.html'),
        '<script type="module" src="/main.js"></script>',
      )
      await writeFile(
        join(root, 'main.js'),
        `import './source.js';document.body.innerHTML='<p>styled</p>'`,
      )
      await writeFile(
        join(root, 'source.js'),
        `import './old.css';import './stable.css';if(import.meta.hot)import.meta.hot.accept()`,
      )
      await writeFile(join(root, 'old.css'), 'p{color:red}')
      await writeFile(join(root, 'new.css'), 'p{color:blue}')
      await writeFile(join(root, 'stable.css'), 'p{padding:1px}')
      server = await vite.createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        server: { host: '127.0.0.1', port: 0, watch: null },
        optimizeDeps: { noDiscovery: true },
        plugins: [
          {
            name: 'observe-native-install',
            transform: {
              order: 'post',
              handler(code, id) {
                if (
                  id.endsWith('.css')
                  && code.includes('__vite__updateStyle(')
                ) {
                  return `${code}\nimport.meta.hot.send('probe:installed',{id:${JSON.stringify(id)},generation:${generation}})`
                }
              },
            },
            configureServer(server) {
              server.hot.on('probe:installed', (data, client) => {
                let entries = completed.get(client)
                if (!entries) {
                  entries = new Map()
                  completed.set(client, entries)
                }
                entries.set(data.id, data.generation)
                if (
                  generation === 1
                  && entries.get(join(root, 'new.css')) === 1
                  && entries.get(join(root, 'stable.css')) === 1
                ) {
                  client.send({ type: 'prune', paths: ['/old.css'] })
                  pruned.add(client)
                }
              })
            },
          },
        ],
      })
      const nativeSend = server.hot.send.bind(server.hot)
      server.hot.send = (payload, ...args) => {
        if (payload?.type === 'prune' && payload.paths.includes('/old.css'))
          return
        return nativeSend(payload, ...args)
      }
      await server.listen()
      const pages = [await browser.newPage(), await browser.newPage()]
      for (const [i, page] of pages.entries()) {
        await page.goto(server.resolvedUrls.local[0], {
          waitUntil: 'networkidle',
        })
        await page.evaluate(() => {
          window.gap = false
          new MutationObserver(() => {
            if (
              ![...document.styleSheets].some(s =>
                s.ownerNode
                  ?.getAttribute('data-vite-dev-id')
                  ?.match(/\/(old|new)\.css$/),
              )
            ) {
              window.gap = true
            }
          }).observe(document.head, { childList: true })
        })
        await page.route('**/*.css*', async (route) => {
          await new Promise(r => setTimeout(r, 600 * (i + 1)))
          await route.continue()
        })
      }
      generation = 1
      await writeFile(
        join(root, 'source.js'),
        `import './new.css';import './stable.css';if(import.meta.hot)import.meta.hot.accept()`,
      )
      for (const file of ['source.js', 'stable.css']) {
        for (const node of server.moduleGraph.getModulesByFile(
          join(root, file),
        ) ?? [])
          server.moduleGraph.invalidateModule(node)
      }
      // Deliberately independent native updates: stable CSS must finish too.
      server.hot.send({
        type: 'update',
        updates: [
          {
            type: 'js-update',
            path: '/source.js',
            acceptedPath: '/source.js',
            timestamp: Date.now(),
          },
          {
            type: 'js-update',
            path: '/stable.css',
            acceptedPath: '/stable.css',
            timestamp: Date.now(),
          },
        ],
      })
      for (const page of pages) {
        await page.waitForFunction(
          () =>
            getComputedStyle(document.querySelector('p')).color
            === 'rgb(0, 0, 255)',
        )
        await page.waitForFunction(
          () =>
            ![...document.styleSheets].some(s =>
              s.ownerNode
                ?.getAttribute('data-vite-dev-id')
                ?.endsWith('/old.css'),
            ),
        )
        assert.equal(await page.evaluate(() => window.gap), false)
        assert.equal(
          await page.locator('p').evaluate(p => getComputedStyle(p).padding),
          '1px',
        )
      }
      assert.equal(pruned.size, 2)
      console.log(
        `PASS ${host}: CSS post-transform completion, stable + new CSS, delayed clients, native client-specific prune`,
      )
      for (const page of pages) await page.close()
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true })
    }
  }
}
finally {
  await browser.close()
}
