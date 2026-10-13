import type { ChildProcess } from 'node:child_process'
import type { ViteDevServer } from 'vite'
import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { createServer as createPortServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import { createServer } from 'vite'

const workspace = fileURLToPath(new URL('../../', import.meta.url))
const sdk = process.env.VANITY_RETIREMENT_TEST_SDK ?? join(workspace, 'sdk')

for (const [host, producer] of [['vite', 'vanity'], ['nuxt', 'vanity'], ['vite', 'vanilla-extract'], ['nuxt', 'vanilla-extract']] as const) {
  test(`${host} ${producer} retires a deleted style and restores its still-importing component`, async ({ page }) => {
    test.setTimeout(120_000)
    const root = await realpath(await mkdtemp(join(tmpdir(), `vanity-retirement-browser-${host}-`)))
    const app = host === 'nuxt' ? join(root, 'app') : root
    let server: ViteDevServer | undefined
    let child: ChildProcess | undefined
    let output = ''
    try {
      await mkdir(join(root, 'node_modules/@mszr/vanity'), { recursive: true })
      await copyFile(join(sdk, 'package.json'), join(root, 'node_modules/@mszr/vanity/package.json'))
      await symlink(join(sdk, 'dist'), join(root, 'node_modules/@mszr/vanity/dist'))
      await mkdir(join(root, 'node_modules/@vanilla-extract'), { recursive: true })
      await symlink(join(workspace, 'sdk/node_modules/@vanilla-extract/css'), join(root, 'node_modules/@vanilla-extract/css'))
      await mkdir(app, { recursive: true })
      await writeFile(join(root, 'package.json'), '{"name":"style-retirement-browser","type":"module"}')
      await writeFile(join(app, 'system.ts'), `import {createSystem} from '@mszr/vanity';export const ds=createSystem().consolidate()`)
      const helper = join(app, 'helper.ts')
      await writeFile(helper, 'export const padding=4')
      const style = join(app, 'row.css.ts')
      const source = producer === 'vanilla-extract'
        ? `import {style} from '@vanilla-extract/css';import {padding} from './helper';export const row=style({padding})`
        : `import {ds} from './system';import {padding} from './helper';export const row=ds.class({padding})`
      await writeFile(style, source)
      let origin: string
      if (host === 'vite') {
        await writeFile(join(root, 'index.html'), '<main id="row">ready</main><script type="module" src="/entry.ts"></script>')
        await writeFile(join(root, 'entry.ts'), 'console.log("ready")')
        const { vanityPlugin } = await import(pathToFileURL(join(sdk, 'dist/vite.mjs')).href)
        server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: vanityPlugin({ compiler: { system: './system.ts' } }), optimizeDeps: { noDiscovery: true }, server: { host: '127.0.0.1', port: 0 } })
        await server.listen()
        origin = server.resolvedUrls!.local[0]!
      }
      else {
        for (const name of ['nuxt', 'vue'])
          await symlink(join(workspace, 'sdk/node_modules', name), join(root, 'node_modules', name))
        await writeFile(join(root, 'nuxt.config.mjs'), `export default { modules: ['@mszr/vanity/nuxt'], telemetry: false, devtools: { enabled: false }, vanity: { compiler: { system: './app/system.ts' } } }`)
        await writeFile(join(app, 'app.vue'), '<template><main id="row">ready</main></template>')
        const portServer = createPortServer()
        await new Promise<void>(resolve => portServer.listen(0, '127.0.0.1', resolve))
        const address = portServer.address()
        if (!address || typeof address === 'string')
          throw new Error('The Nuxt fixture has no port')
        const port = address.port
        await new Promise<void>((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()))
        child = spawn(process.execPath, [join(workspace, 'sdk/node_modules/nuxt/bin/nuxt.mjs'), 'dev', root, '--port', String(port), '--host', '127.0.0.1', '--no-fork'], { cwd: root, env: { ...process.env, NUXT_TELEMETRY_DISABLED: '1', CHOKIDAR_USEPOLLING: 'true', CHOKIDAR_INTERVAL: '100' }, stdio: ['ignore', 'pipe', 'pipe'] })
        child.stdout?.on('data', chunk => output += chunk)
        child.stderr?.on('data', chunk => output += chunk)
        origin = `http://127.0.0.1:${port}`
        await expect.poll(async () => {
          try {
            return (await fetch(origin)).ok
          }
          catch { return false }
        }, { timeout: 90_000, message: output }).toBe(true)
      }
      const navigate = async (): Promise<void> => {
        await expect.poll(async () => {
          try {
            await page.goto(origin, { waitUntil: 'networkidle' })
            return true
          }
          catch (error) {
            if (error instanceof Error && error.message.includes('net::ERR_ABORTED'))
              return false
            throw error
          }
        }).toBe(true)
      }
      await navigate()
      await expect(page.locator('#row')).toHaveText('ready')
      const styleUrl = host === 'nuxt' ? '/_nuxt/row.css.ts' : '/row.css.ts'
      // A page-level import has no authored importer in the host graph.
      await expect.poll(async () => {
        try {
          return await page.evaluate(async (url) => {
            const { row } = await import(url)
            const element = document.querySelector('#row')
            if (element === null)
              return false
            element.className = row
            return true
          }, styleUrl)
        }
        catch (error) {
          if (error instanceof Error && /Execution context was destroyed|Cannot find context/.test(error.message))
            return false
          throw error
        }
      }).toBe(true)
      await expect(page.locator('#row')).toHaveCSS('padding-top', '4px')
      const installedClass = await page.locator('#row').getAttribute('class')
      await unlink(style)
      await expect(page.locator('#row')).toHaveCSS('padding-top', '0px')
      await expect(page.locator('#row')).toHaveAttribute('class', installedClass!)
      await writeFile(helper, 'export const padding=8')
      await delay(300)
      await expect(page.locator('vite-error-overlay')).toHaveCount(0)
      await writeFile(style, source)
      if (host === 'vite')
        await writeFile(join(app, 'entry.ts'), `import {row} from './row.css.ts';document.querySelector('#row').className=row`)
      else
        await writeFile(join(app, 'app.vue'), `<script setup>import {row} from './row.css.ts'</script><template><main id="row" :class="row">ready</main></template>`)
      const entryUrl = host === 'nuxt' ? '/_nuxt/app.vue' : '/entry.ts'
      await expect.poll(async () => (await page.request.get(new URL(entryUrl, origin).href)).text()).toContain('row.css.ts')
      await navigate()
      await expect(page.locator('#row')).toHaveCSS('padding-top', '8px')
      await unlink(style)
      await expect.poll(async () => {
        const overlay = page.locator('vite-error-overlay')
        return await overlay.count() ? await overlay.evaluate(element => element.shadowRoot?.textContent ?? element.textContent) : await page.locator('body').textContent()
      }, { timeout: 15_000 }).toMatch(/(?:Failed to resolve import|Cannot find module).*row\.css/s)
      await writeFile(style, source)
      if (host === 'nuxt') {
        // Nuxt's SSR error document has no application to hot-update.
        // A fresh request must recover on the same server process.
        await expect.poll(async () => (await page.request.get(origin)).ok()).toBe(true)
        await navigate()
      }
      await expect(page.locator('vite-error-overlay')).toHaveCount(0, { timeout: 15_000 })
      await expect(page.locator('#row')).toHaveText('ready', { timeout: 15_000 })
      await expect(page.locator('#row')).toHaveCSS('padding-top', '8px')
    }
    finally {
      await server?.close()
      if (child !== undefined && child.exitCode === null) {
        child.kill('SIGTERM')
        await new Promise<void>(resolve => child!.once('exit', () => resolve()))
      }
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })
}
