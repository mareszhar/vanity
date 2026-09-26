/** Compiler integration coverage for configured systems and source packages. */

import type { AddressInfo } from 'node:net'
import type { Rollup } from 'vite'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vanityPlugin } from '@mszr/vanity/vite'
import { build, createServer } from 'vite'
import { describe, expect, it } from 'vitest'
import { getViteGraphModuleUrl, resolveViteVirtualId } from './hosts/viteHmr'

function local(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url))
}

const aliases = {
  '@mszr/vanity/runtime': local('../runtime.ts'),
  '@mszr/vanity': local('../index.ts'),
}

async function writeFixture(root: string, path: string, source: string): Promise<string> {
  const file = join(root, path)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, source)
  return file
}

function getAssets(result: Rollup.RollupOutput): Rollup.OutputAsset[] {
  return result.output.filter((item): item is Rollup.OutputAsset => item.type === 'asset')
}

function getLinkedCss(
  html: string,
  assets: readonly Rollup.OutputAsset[],
): string {
  const links = [...html.matchAll(/href="\/?([^"?]+\.css)"/g)].map(match => match[1])
  return assets
    .filter(asset => links.includes(asset.fileName))
    .map(asset => String(asset.source))
    .join('\n')
}

/** An application root with a sibling source package outside it. */
async function writeOutsideStyleFixture(): Promise<{
  readonly base: string
  readonly app: string
  readonly system: string
}> {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'vanity-outside-style-')))
  const app = join(base, 'apps/web')
  const ui = join(base, 'packages/ui')

  await writeFixture(base, 'package.json', '{ "name": "vanity-outside-style-fixture", "type": "module" }')
  await writeFixture(ui, 'package.json', '{ "name": "ui-pkg", "type": "module" }')
  await writeFixture(app, 'package.json', '{ "name": "vanity-outside-style-app", "type": "module" }')
  const system = await writeFixture(app, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#123456', accent: '#654321' } })
  .consolidate({ prefix: 'outside', root: ':root' })
`)
  await writeFixture(ui, 'Button.css.ts', `import { ds } from '../../apps/web/system.ts'
export const button = ds.class({ color: ds.t.color.brand })
`)
  await writeFixture(ui, 'Card.css.ts', `import { ds } from '../../apps/web/system.ts'
export const card = ds.class({ background: ds.t.color.accent })
`)
  await writeFixture(app, 'local.css.ts', `import { ds } from './system.ts'
export const local = ds.class({ color: ds.t.color.accent })
`)
  await writeFixture(app, 'entry.ts', `import { button } from 'ui/Button.css.ts'
import { card } from 'ui/Card.css.ts'
import { local } from './local.css.ts'
export { button, card, local }
`)
  await mkdir(join(app, 'node_modules'), { recursive: true })
  await symlink(ui, join(app, 'node_modules/ui'), 'dir')

  return { base, app, system }
}

/** Each style module's own rule carries its debug class and its token reference. */
function expectOutsideStyleCss(css: string): void {
  expect(css).toContain('--outside-color-brand:')
  const buttonRule = css.match(/[^{]*button[^{]*\{[^}]*\}/)?.[0] ?? ''
  expect(buttonRule).toContain('var(--outside-color-brand)')
  const cardRule = css.match(/[^{]*card[^{]*\{[^}]*\}/)?.[0] ?? ''
  expect(cardRule).toContain('var(--outside-color-accent)')
}

describe('configured system CSS ownership', () => {
  it('attaches an outside-root system to both independently linked HTML entries', async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'vanity-configured-outside-system-')))
    const app = join(base, 'app')

    try {
      await writeFixture(base, 'package.json', '{ "name": "vanity-linked-fixture", "type": "module" }')
      const configuredSystem = await writeFixture(base, 'design/system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'review', root: ':root' })
`)
      await writeFixture(base, 'design/package.json', JSON.stringify({
        name: '@review/design',
        type: 'module',
        exports: {
          './system': './system.ts',
          './authoring': './authoring.ts',
        },
      }))
      await writeFixture(base, 'design/authoring.ts', `import { ds } from './system.ts'
export { ds }
export const { class: mk, t } = ds
`)
      await writeFixture(app, 'package.json', '{ "name": "vanity-linked-app", "type": "module" }')
      await mkdir(join(app, 'node_modules/@review'), { recursive: true })
      await symlink(join(base, 'design'), join(app, 'node_modules/@review/design'), 'dir')

      for (const name of ['a', 'b']) {
        await writeFixture(app, `${name}/index.html`, `<html><script type="module" src="./main.ts"></script></html>`)
        await writeFixture(app, `${name}/main.ts`, `import { button } from './style.css.ts'
document.body.className = button
`)
        await writeFixture(app, `${name}/style.css.ts`, `import { mk, t } from '@review/design/authoring'
export const button = mk({ color: t.color.brand })
`)
      }

      for (const spelling of [
        configuredSystem,
        join(app, 'node_modules/@review/design/system.ts'),
        '@review/design/authoring',
      ]) {
        const result = await build({
          configFile: false,
          logLevel: 'silent',
          root: app,
          plugins: [vanityPlugin({ compiler: { identifiers: 'debug', system: spelling } })],
          resolve: { alias: aliases },
          build: {
            write: false,
            minify: false,
            rollupOptions: {
              input: {
                a: join(app, 'a/index.html'),
                b: join(app, 'b/index.html'),
              },
            },
          },
        })
        const output = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
        const assets = getAssets(output)
        const css = assets.filter(asset => asset.fileName.endsWith('.css'))
        const pages = assets.filter(asset => asset.fileName.endsWith('.html'))

        expect(css.some(asset => String(asset.source).includes('--review-color-brand:'))).toBe(true)
        expect(pages).toHaveLength(2)
        for (const page of pages) {
          const linked = getLinkedCss(String(page.source), css)
          expect(linked).toContain('--review-color-brand:')
          expect(linked).toContain('var(--review-color-brand)')
        }
      }
    }
    finally {
      await rm(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('instruments a physically installed source system in the bundled path', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-installed-source-system-')))

    try {
      await writeFixture(root, 'package.json', '{ "name": "vanity-installed-app", "type": "module" }')
      await writeFixture(root, 'node_modules/installed/package.json', '{ "name": "installed-design", "type": "module" }')
      await writeFixture(root, 'node_modules/installed/system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#654321' } })
  .consolidate({ prefix: 'installed', root: ':root' })
`)
      await writeFixture(root, 'style.css.ts', `import { ds } from 'installed/system.ts'
export const button = ds.class({ color: ds.t.color.brand })
`)
      await writeFixture(root, 'entry.ts', `import { button } from './style.css.ts'
export { button }
`)

      const result = await build({
        configFile: false,
        logLevel: 'silent',
        root,
        plugins: [vanityPlugin({ compiler: { identifiers: 'debug' } })],
        resolve: { alias: aliases },
        build: {
          write: false,
          minify: false,
          lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: 'entry' },
        },
      })
      const output = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
      const css = getAssets(output)
        .filter(asset => asset.fileName.endsWith('.css'))
        .map(asset => String(asset.source))
        .join('\n')

      expect(css).toContain('--installed-color-brand:')
      expect(css).toContain('var(--installed-color-brand)')
      expect(css).toMatch(/button__|button_[\w-]+/)
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('keeps installed source package style diagnostics at their authored range', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-installed-style-diagnostic-')))

    try {
      await writeFixture(root, 'package.json', '{ "name": "vanity-installed-style-app", "type": "module" }')
      await writeFixture(root, 'node_modules/installed/package.json', '{ "name": "installed-design", "type": "module" }')
      await writeFixture(root, 'node_modules/installed/system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#654321' } })
  .consolidate({ prefix: 'installed-diagnostic' })
`)
      await writeFixture(root, 'node_modules/installed/card.css.ts', `import { ds } from './system'
export const card = ds.class({
  borderRadius: '8pxx',
})
`)
      await writeFixture(root, 'entry.ts', `export { card } from 'installed/card.css.ts'
`)

      await expect(build({
        configFile: false,
        logLevel: 'silent',
        root,
        plugins: [vanityPlugin({ compiler: { identifiers: 'debug' } })],
        resolve: { alias: aliases },
        build: {
          write: false,
          minify: false,
          lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: 'entry' },
        },
      })).rejects.toThrow(/VANITY_CSS_INVALID_VALUE.*card\.css\.ts:3:3/s)
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('resolves configured aliases through the host and keeps system CSS semantic', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-configured-system-alias-')))

    try {
      const system = await writeFixture(root, 'design/system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#abcdef' } })
  .consolidate({ prefix: 'alias', root: ':root' })
`)
      await writeFixture(root, 'package.json', '{ "name": "vanity-system-alias-app", "type": "module" }')
      await writeFixture(root, 'card.css.ts', `import { ds } from '@design/system'
export const card = ds.class({ color: ds.t.color.brand })
`)
      await writeFixture(root, 'entry.ts', `export { card } from './card.css.ts'
`)

      const result = await build({
        configFile: false,
        logLevel: 'silent',
        root,
        plugins: [vanityPlugin({ compiler: { identifiers: 'debug', system: '@design/system' } })],
        resolve: { alias: { ...aliases, '@design/system': system } },
        build: {
          write: false,
          minify: false,
          lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: 'entry' },
        },
      })
      const output = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
      const css = getAssets(output)
        .filter(asset => asset.fileName.endsWith('.css'))
        .map(asset => String(asset.source))
        .join('\n')

      expect(css).toContain('--alias-color-brand:')
      expect(css).toContain('var(--alias-color-brand)')
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('emits out-of-root style CSS in production at root, non-root, and relative bases', async () => {
    for (const base of ['/', '/_nuxt/', '.']) {
      const fixture = await writeOutsideStyleFixture()

      try {
        const result = await build({
          configFile: false,
          logLevel: 'silent',
          root: fixture.app,
          base,
          plugins: [vanityPlugin({ compiler: { identifiers: 'debug', system: fixture.system } })],
          resolve: { alias: aliases },
          build: {
            write: false,
            minify: false,
            lib: { entry: join(fixture.app, 'entry.ts'), formats: ['es'], fileName: 'entry' },
          },
        })
        const output = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
        const css = getAssets(output)
          .filter(asset => asset.fileName.endsWith('.css'))
          .map(asset => String(asset.source))
          .join('\n')

        expectOutsideStyleCss(css)
      }
      finally {
        await rm(fixture.base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
      }
    }
  }, 180000)

  it('serves out-of-root style CSS over HTTP in development at root and non-root bases', async () => {
    for (const base of ['/', '/_nuxt/']) {
      const fixture = await writeOutsideStyleFixture()
      const prefix = base === '/' ? '/' : `${base.replace(/\/$/, '')}/`

      const server = await createServer({
        configFile: false,
        logLevel: 'silent',
        root: fixture.app,
        base,
        plugins: [vanityPlugin({ compiler: { identifiers: 'debug', system: fixture.system } })],
        resolve: { alias: aliases },
        server: {
          middlewareMode: true,
          hmr: false,
          ws: false,
          watch: null,
          fs: { allow: [fixture.base] },
        },
        optimizeDeps: { noDiscovery: true },
      })
      const httpServer = createHttpServer(server.middlewares)
      await new Promise<void>(resolve => httpServer.listen(0, resolve))

      try {
        const { port } = httpServer.address() as AddressInfo
        const fetchBody = async (url: string): Promise<{ readonly status: number, readonly body: string }> => {
          const response = await fetch(`http://localhost:${port}${url}`)
          return { status: response.status, body: await response.text() }
        }
        const styleHrefs = (code: string, suffix: string): string[] =>
          [...code.matchAll(/"([^"]+)"/g)].map(match => match[1]).filter(href => href.endsWith(suffix))

        const entry = await fetchBody(`${prefix}entry.ts`)
        expect(entry.status).toBe(200)
        const styleUrls = styleHrefs(entry.body, '.css.ts')
          .filter(href => href.includes('Button') || href.includes('Card') || href.endsWith('local.css.ts'))
        expect(styleUrls).toHaveLength(3)

        const cssBodies: string[] = []
        const styleCssUrls: string[] = []
        for (const styleUrl of styleUrls) {
          const style = await fetchBody(styleUrl)
          expect(style.status).toBe(200)
          const cssUrls = styleHrefs(style.body, '.vanity.css')
          expect(cssUrls.length).toBeGreaterThan(0)
          for (const cssUrl of cssUrls) {
            const css = await fetchBody(cssUrl)
            expect(css.status).toBe(200)
            cssBodies.push(css.body)
            if (cssUrl.includes('/style/'))
              styleCssUrls.push(cssUrl)
          }
        }

        expectOutsideStyleCss(cssBodies.join('\n'))

        // The HMR payload path equals the URL the host module graph actually
        // holds, for in-root and out-of-root sources alike.
        expect(styleCssUrls).toHaveLength(3)
        for (const cssUrl of styleCssUrls) {
          const virtualId = resolveViteVirtualId(cssUrl, fixture.app, base)
          expect(virtualId).toBeDefined()
          const modules = server.moduleGraph.getModulesByFile(virtualId!)
          expect((modules?.size ?? 0)).toBeGreaterThan(0)
          for (const module of modules ?? []) {
            expect(getViteGraphModuleUrl(virtualId!, fixture.app, module.url)).toBe(module.url)
          }
        }
      }
      finally {
        await new Promise(resolve => httpServer.close(resolve))
        await server.close()
        await rm(fixture.base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
      }
    }
  }, 180000)
})
