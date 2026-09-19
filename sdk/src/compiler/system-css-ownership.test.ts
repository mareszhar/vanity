/** Compiler integration coverage for configured and source-shipping systems. */

import type { Rollup } from 'vite'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vanityPlugin } from '@mszr/vanity/vite'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'

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

  it('keeps installed source-shipping style diagnostics at their authored range', async () => {
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
})
