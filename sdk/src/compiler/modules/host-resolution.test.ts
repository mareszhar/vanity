import type { Plugin, ViteDevServer } from 'vite'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vanityPlugin } from '@mszr/vanity/vite'
import { build, createServer } from 'vite'
import { describe, expect, it } from 'vitest'
import { installTestSdk } from '../../test-support/installedSdk'
import { invokeVanityHotUpdate } from '../../test-support/vite'

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-host-resolution-')))
  await installTestSdk(root)
  const put = async (file: string, contents: string) => {
    const path = join(root, file)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, contents)
    return path
  }
  await put('package.json', '{"name":"host-resolution-fixture","type":"module"}')
  await put('index.html', '<script type="module" src="/style.css.ts"></script>')
  await put('style.css.ts', 'import {ds,padding} from "./system"; export const card=ds.class({padding})')
  return { root, put }
}

const transportless = { middlewareMode: true, hmr: false as const, ws: false as const, watch: null }

describe('host-resolved style modules', () => {
  it('preserves compiler imports across concurrent client and server build resolution', async () => {
    const { root, put } = await fixture()
    const count = 12
    for (let index = 0; index < count; index++) {
      await put(`leaf${index}.ts`, 'import {createSystem} from "@mszr/vanity";export const value=createSystem')
      await put(`style${index}.css.ts`, `export const card=ds.class({padding:"${index + 1}px"})`)
    }
    const system = await put('system.ts', `${Array.from({ length: count }, (_, index) => `import {value as v${index}} from "./leaf${index}"`).join('\n')
    }\nexport const ds=v0().consolidate({prefix:"parallel"});export const values=[${Array.from({ length: count }, (_, index) => `v${index}`).join(',')}]`)
    const shared = await put('authoring.ts', 'export {ds} from "./system"')
    const entry = await put('main.ts', `${Array.from({ length: count }, (_, index) => `import {card as c${index}} from "./style${index}.css"`).join('\n')
    }\nconsole.log(${Array.from({ length: count }, (_, index) => `c${index}`).join(',')})`)
    await put('index.html', '<script type="module" src="/main.ts"></script>')
    const timing: Plugin = {
      name: 'fixture-concurrent-resolution',
      enforce: 'pre',
      async resolveId(id, importer) {
        if (id === '@mszr/vanity')
          await new Promise(resolve => setTimeout(resolve, Number(importer?.match(/leaf(\d+)/)?.[1] ?? 0) * 3 + 10))
        return null
      },
    }
    const plugins = [timing, vanityPlugin({ compiler: { system }, autoImports: { shared } })]
    try {
      const client = await build({ root, configFile: false, logLevel: 'silent', plugins, build: { write: false, minify: false } })
      if (!('output' in client))
        throw new Error('expected a client build')
      const css = client.output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.type === 'asset' ? String(item.source) : '').join('\n')
      expect(css).toMatch(/padding: ?1px/)
      expect(css).toMatch(/padding: ?12px/)
      await expect(build({ root, configFile: false, logLevel: 'silent', plugins, build: { write: false, ssr: entry } })).resolves.toBeDefined()
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it.each(['transitive', 'multiple', 'unmapped'])('reports browser-selected imports on evaluation failure, %s', async (kind) => {
    const { root, put } = await fixture()
    const system = await put('system.ts', 'import {createSystem} from "@mszr/vanity";export const ds=createSystem().consolidate({prefix:"failure"})')
    for (const name of ['entry', 'inner']) {
      await put(`node_modules/@fixture/${name}/package.json`, JSON.stringify({ name: `@fixture/${name}`, type: 'module', exports: { browser: './browser.js', node: './node.js', default: './node.js' } }))
      await put(`node_modules/@fixture/${name}/node.js`, 'export const selected="node"')
      await put(`node_modules/@fixture/${name}/browser.js`, name === 'entry' && kind === 'multiple' ? 'export {selected} from "plugin-inner"' : 'export {selected} from "./helper.js"')
      await put(`node_modules/@fixture/${name}/helper.js`, kind === 'unmapped'
        ? 'const error=new Error("original stackless failure");error.stack="Error: original stackless failure";throw error;export const selected="unused"'
        : 'export const selected=window.location.href')
    }
    await put('style.css.ts', 'import {ds} from "./system";import {selected} from "plugin-entry";export const card=ds.class({fontFamily:selected})')
    const route: Plugin = {
      name: 'fixture-browser-routes',
      async resolveId(id, importer) {
        if (id.startsWith('plugin-'))
          return this.resolve(`@fixture/${id.slice(7)}`, importer, { skipSelf: true })
      },
    }
    const server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system } }), route], optimizeDeps: { noDiscovery: true }, server: transportless })
    try {
      const error = await server.transformRequest('/style.css.ts').then(() => undefined, error => error as Error)
      expect(error?.message).toContain('plugin-entry')
      expect(error?.message).toContain('style.css.ts')
      expect(error?.message).toContain('import the package by name in the style module')
      if (kind === 'multiple') {
        expect(error?.message).toContain('plugin-inner')
        expect(error?.message).toContain('node_modules/@fixture/entry/browser.js')
        expect(error?.message).toContain('node_modules/@fixture/inner/browser.js')
      }
      if (kind === 'unmapped') {
        expect(error?.message).toContain('original stackless failure')
        expect(error?.message).toContain('Possible causes')
      }
      else {
        expect(error?.message).toContain('window is not defined')
        expect(error?.message).not.toContain('Possible causes')
      }
    }
    finally {
      await server.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('refreshes the configured system after a relevant watch-build edit', async () => {
    const { root, put } = await fixture()
    const source = (padding: string) => `import {createSystem} from "@mszr/vanity";export const ds=createSystem().consolidate({prefix:"watch"});export const padding="${padding}"`
    const system = await put('system.ts', source('2px'))
    const builds: string[] = []
    const capture: Plugin = {
      name: 'fixture-watch-css',
      generateBundle(_options, bundle) {
        builds.push(Object.values(bundle).filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.type === 'asset' ? String(item.source) : '').join('\n'))
      },
    }
    const watcher = await build({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system } }), capture], build: { write: false, minify: false, watch: {} } })
    if (!('on' in watcher))
      throw new Error('expected a watch build')
    const nextBuild = () => new Promise<void>((resolve, reject) => {
      const listener = async (event: Extract<Parameters<Parameters<typeof watcher.on>[1]>[0], { code: string }>) => {
        if (event.code === 'BUNDLE_END')
          await event.result.close()
        if (event.code === 'ERROR' || event.code === 'END') {
          watcher.off('event', listener)
          if (event.code === 'ERROR')
            reject(event.error)
          else
            resolve()
        }
      }
      watcher.on('event', listener)
    })
    try {
      await nextBuild()
      expect(builds).toHaveLength(1)
      expect(builds[0]).toMatch(/padding: ?2px/)
      const edited = nextBuild()
      await writeFile(system, source('4px'))
      await edited
      expect(builds).toHaveLength(2)
      expect(builds[1]).toMatch(/padding: ?4px/)
    }
    finally {
      await watcher.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('evaluates optimized named, alias, and plugin imports from original sources and updates after an edit', async () => {
    const { root, put } = await fixture()
    const system = await put('system.ts', 'import {createSystem} from "@mszr/vanity";export const ds=createSystem().consolidate({prefix:"optimized"})')
    await put('node_modules/@fixture/choice/package.json', JSON.stringify({ name: '@fixture/choice', type: 'module', exports: { browser: './browser.js', node: './node.js', default: './node.js' } }))
    const browser = await put('node_modules/@fixture/choice/browser.js', 'export const padding="2px"')
    await put('node_modules/@fixture/choice/node.js', 'export const padding="1px"')
    await put('style.css.ts', 'import {ds} from "./system";import {padding as named} from "@fixture/choice";import {padding as aliased} from "alias-choice";import {padding as plugin} from "plugin-choice";export const card=ds.class({padding:named,margin:aliased,width:plugin})')
    const choice: Plugin = {
      name: 'fixture-plugin-choice',
      async resolveId(id, importer) {
        if (id === 'plugin-choice')
          return this.resolve('@fixture/choice', importer, { skipSelf: true })
      },
    }
    const options = { root, configFile: false as const, logLevel: 'silent' as const, resolve: { alias: { 'alias-choice': '@fixture/choice' } } }
    let server: ViteDevServer | undefined
    const css = async () => {
      const transformed = await server!.transformRequest('/style.css.ts')
      const urls = [...transformed!.code.matchAll(/import "([^"]+\.vanity\.css)"/g)].map(match => match[1]!)
      const modules = await Promise.all(urls.map(url => server!.transformRequest(url)))
      return modules.map(module => JSON.parse(module!.code.match(/(?:const|let) __vite__css = (".*")/)![1]!)).join('\n')
    }
    try {
      server = await createServer({ ...options, plugins: [vanityPlugin({ compiler: { system } }), choice], server: transportless, optimizeDeps: { include: ['@fixture/choice'], holdUntilCrawlEnd: false } })
      const development = await css()
      const output = await build({ ...options, plugins: [vanityPlugin({ compiler: { system } }), choice], build: { write: false, minify: false, cssMinify: false } })
      if ('on' in output)
        throw new Error('expected a one-shot build')
      const production = (Array.isArray(output) ? output[0] : output).output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.type === 'asset' ? String(item.source) : '').join('\n')
      for (const result of [development, production]) {
        expect(result).toMatch(/padding: ?1px/)
        expect(result).toMatch(/margin: ?2px/)
        expect(result).toMatch(/width: ?2px/)
      }
      await writeFile(browser, 'export const padding="4px"')
      await invokeVanityHotUpdate(server, browser)
      const edited = await css()
      expect(edited).toMatch(/padding: ?1px/)
      expect(edited).toMatch(/margin: ?4px/)
      expect(edited).toMatch(/width: ?4px/)
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it.each([false, true])('evaluates the configured system after initialization, virtual=%s', async (virtual) => {
    const { root, put } = await fixture()
    let initialized = false
    const system = await put('system.ts', `import {createSystem} from '@mszr/vanity'; import {padding} from '${virtual ? 'virtual:padding' : 'phase-choice'}'; export {padding}; export const ds=createSystem().consolidate({prefix:'initialized'})`)
    await put('before.ts', 'export const padding="1px"')
    await put('client.ts', 'export const padding="2px"')
    const late: Plugin = {
      name: 'fixture-late-client',
      buildStart: { order: 'post', sequential: true, handler() { initialized = true } },
      resolveId(id) {
        if (id === 'phase-choice')
          return join(root, initialized ? 'client.ts' : 'before.ts')
        if (id === 'virtual:padding')
          return '\0virtual:padding'
      },
      load(id) {
        if (id === '\0virtual:padding')
          return 'export const padding="2px"'
      },
    }
    try {
      const output = await build({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system } }), late], build: { write: false, minify: false } })
      if ('on' in output)
        throw new Error('expected a one-shot build')
      const css = (Array.isArray(output) ? output[0] : output).output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.type === 'asset' ? item.source : '').join('\n')
      expect(css).toMatch(/padding: ?2px/)
      expect(css).not.toMatch(/padding: ?1px/)
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('shares a failed first attempt across consumers and retries only after an edit', async () => {
    const { root, put } = await fixture()
    const counter = '__vanityFirstAttempt'
    const globals = globalThis as unknown as Record<string, number>
    globals[counter] = 0
    const source = (fail: boolean) => `import {createSystem} from '@mszr/vanity';globalThis.${counter}++;${fail ? 'throw new Error("intentional system failure");' : ''}export const ds=createSystem().consolidate({prefix:'first'});export const padding='2px'`
    const system = await put('system.ts', source(true))
    const diagnostics: unknown[] = []
    let server: ViteDevServer | undefined
    try {
      server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system, diagnostics: diagnostic => diagnostics.push(diagnostic) } })], server: transportless, optimizeDeps: { noDiscovery: true } })
      expect(globals[counter]).toBe(0)
      const results = await Promise.all(['/style.css.ts', '/system.ts'].map(id => server!.transformRequest(id).then(() => undefined, error => error)))
      expect(results.every(error => error?.message.includes('intentional system failure'))).toBe(true)
      expect(globals[counter]).toBe(1)
      await expect(server.transformRequest('/style.css.ts?t=2')).rejects.toThrow('intentional system failure')
      expect(globals[counter]).toBe(1)
      expect(diagnostics).toHaveLength(1)
      await writeFile(system, source(false))
      await invokeVanityHotUpdate(server, system)
      expect((await server.transformRequest('/style.css.ts'))?.code).toContain('card')
      expect(globals[counter]).toBe(2)
    }
    finally {
      await server?.close()
      delete globals[counter]
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })
})
