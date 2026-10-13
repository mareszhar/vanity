import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { buildNuxtFixture } from '../../sdk/src/test-support/nuxt'

const workspace = fileURLToPath(new URL('../../', import.meta.url))
// Load-bearing checks may use unchanged SDK artifacts without altering a host.
const sdk = process.env.VANITY_NUXT_QUERY_TEST_SDK ?? join(workspace, 'sdk')

test.describe.configure({ mode: 'serial' })
for (const spelling of ['card.css', 'card.css.ts']) {
  test(`Nuxt production SSR styles a component importing ./${spelling}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-nuxt-css-query-')))
    let child: ReturnType<typeof spawn> | undefined
    const context = await browser.newContext({ javaScriptEnabled: false })
    try {
      await mkdir(join(root, 'node_modules/@mszr/vanity'), { recursive: true })
      await copyFile(join(sdk, 'package.json'), join(root, 'node_modules/@mszr/vanity/package.json'))
      await symlink(join(sdk, 'dist'), join(root, 'node_modules/@mszr/vanity/dist'))
      for (const name of ['nuxt', 'vue'])
        await symlink(join(workspace, 'sdk/node_modules', name), join(root, 'node_modules', name))
      await mkdir(join(root, 'app/design'), { recursive: true })
      await writeFile(join(root, 'package.json'), '{"name":"nuxt-css-query-contract","type":"module"}')
      await writeFile(join(root, 'nuxt.config.mjs'), `export default { modules: ['@mszr/vanity/nuxt'], telemetry: false, devtools: { enabled: false }, features: { inlineStyles: true }, vanity: { compiler: { system: './app/design/system.ts', layerOrder: ['vendor', 'vanity'] }, autoImports: { style: './app/design/authoring.ts' } } }`)
      await writeFile(join(root, 'app/design/system.ts'), `import { createSystem } from '@mszr/vanity'; export const ds = createSystem().consolidate()`)
      await writeFile(join(root, 'app/design/authoring.ts'), `export { ds } from './system'`)
      await writeFile(join(root, 'app/card.css.ts'), `export const card = ds.class({ padding: '13px' })`)
      await writeFile(join(root, 'app/app.vue'), `<script setup>import { card } from './${spelling}'</script><template><main id="card" :class="card">Server styles</main></template>`)
      await buildNuxtFixture(root)
      const portServer = createServer()
      await new Promise<void>(resolve => portServer.listen(0, '127.0.0.1', resolve))
      const address = portServer.address()
      if (address === null || typeof address === 'string')
        throw new Error('The production test server has no port')
      const port = address.port
      await new Promise<void>((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()))
      child = spawn(process.execPath, [join(root, '.output/server/index.mjs')], {
        cwd: root,
        env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      child.stdout?.on('data', chunk => output += chunk)
      child.stderr?.on('data', chunk => output += chunk)
      const origin = `http://127.0.0.1:${port}`
      let ready = false
      for (let attempt = 0; attempt < 300; attempt++) {
        try {
          ready = (await fetch(origin)).ok
        }
        catch {}
        if (ready || child.exitCode !== null)
          break
        await delay(100)
      }
      expect(ready, output).toBe(true)
      const page = await context.newPage()
      expect((await page.goto(origin))?.status()).toBe(200)
      await expect(page.locator('#card')).toHaveCSS('padding-top', '13px')
      const css = await page.evaluate(() => [...document.styleSheets]
        .flatMap(sheet => [...sheet.cssRules].map(rule => rule.cssText))
        .join('\n'))
      expect(css).toMatch(/@layer vendor,\s*vanity;/)
    }
    finally {
      await context.close()
      if (child !== undefined && child.exitCode === null) {
        child.kill('SIGTERM')
        await new Promise<void>(resolve => child!.once('exit', () => resolve()))
      }
      await rm(root, { recursive: true, force: true })
    }
  })
}
