import type { Plugin, ViteDevServer } from 'vite'
import { Buffer } from 'node:buffer'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { vanityPlugin } from '@mszr/vanity/vite'
import vue from '@vitejs/plugin-vue'
import { describe, expect, it, vi } from 'vitest'
import { installTestSdk } from '../../test-support/installedSdk'
import { createPromiseGate } from '../../test-support/promises'
import { invokeVanityHotUpdate } from '../../test-support/vite'
import * as styleBuild from '../modules/build'
import { createViteHmrHost, resolveViteVirtualId } from './viteHmr'
import { vanityViteHost } from './viteHost'

const flags = ['inline', 'used', 'url', 'raw', 'direct', 'import']
const cssQueryForms = Array.from({ length: 64 }, (_, bits) => flags.filter((_, index) => bits & (1 << index)).join('&'))
cssQueryForms.push('inline&used&t=123', 'inline=&used=', 'vue&type=style&index=0&src=true&lang.css', 'vue&type=style&index=0&src=true&direct&lang.css', 'transform-only', 'inline-css', 'vue&type=style&index=0&src=scope&scoped=scope&lang.css', 'vue&type=style&index=0&src=true&inline&lang.css', 'vue&type=style&index=0&src=true&lang.module.css')

const vanityRoot = fileURLToPath(new URL('../../', import.meta.url))
const alias = {
  '@mszr/vanity/runtime': join(vanityRoot, 'runtime.ts'),
  '@mszr/vanity': join(vanityRoot, 'index.ts'),
}

async function loadViteRuntime(): Promise<typeof import('vite')> {
  const entry = process.env.VANITY_VITE_TEST_ENTRY
  return entry === undefined
    ? import('vite')
    : await import(pathToFileURL(entry).href) as typeof import('vite')
}

async function put(root: string, file: string, contents: string): Promise<string> {
  const path = join(root, file)
  await mkdir(join(path, '..'), { recursive: true })
  if (file === 'package.json')
    await installTestSdk(root)
  await writeFile(path, contents)
  return path
}

/** Read the fixture's native default string without prescribing a quote style. */
function defaultExportedString(code: string): string {
  expect(code).toMatch(/^export default\s/)
  const value: unknown = runInNewContext(code.replace(/^export default\s+/, ''))
  expect(typeof value).toBe('string')
  return value as string
}

function bundleCode(result: unknown): string {
  const outputs = (Array.isArray(result) ? result : [result]) as Array<{
    output: Array<{ type: string, code?: string }>
  }>
  return outputs.flatMap(output => output.output
    .filter(chunk => chunk.type === 'chunk')
    .map(chunk => chunk.code ?? ''))
    .join('\n')
}

async function capture<T>(operation: () => Promise<T>): Promise<{ readonly value?: T, readonly error?: unknown }> {
  try {
    return { value: await operation() }
  }
  catch (error) {
    return { error }
  }
}

function errorText(error: unknown): string {
  const pending = [error]
  const seen = new Set<object>()
  const messages: string[] = []

  while (pending.length > 0) {
    const current = pending.shift()
    if (current === undefined)
      continue
    if (typeof current !== 'object' || current === null) {
      messages.push(String(current))
      continue
    }
    if (seen.has(current))
      continue
    seen.add(current)
    if ('message' in current && typeof current.message === 'string')
      messages.push(current.message)
    if ('diagnostics' in current && Array.isArray(current.diagnostics)) {
      for (const diagnostic of current.diagnostics) {
        if (diagnostic === null || typeof diagnostic !== 'object')
          continue
        if ('message' in diagnostic && typeof diagnostic.message === 'string')
          messages.push(diagnostic.message)
        if ('file' in diagnostic && typeof diagnostic.file === 'string')
          messages.push(diagnostic.file)
        if ('fix' in diagnostic && diagnostic.fix !== null && typeof diagnostic.fix === 'object'
          && 'message' in diagnostic.fix && typeof diagnostic.fix.message === 'string') {
          messages.push(diagnostic.fix.message)
        }
      }
    }
    if ('cause' in current)
      pending.push(current.cause)
    if ('errors' in current && Array.isArray(current.errors))
      pending.push(...current.errors)
  }

  return messages.join('\n')
}

function graphEnvironments(server: ViteDevServer) {
  const environments = Object.entries((server as ViteDevServer & {
    environments: Record<string, { moduleGraph: ViteDevServer['moduleGraph'] }>
  }).environments).map(([name, environment]) => ({
    name,
    moduleGraph: environment.moduleGraph,
  }))
  return environments
}

function importsIn(code: string): string[] {
  return [...code.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)]
    .map(match => match[1]!)
}

function graphNode(server: ViteDevServer, file: string, ssr: boolean): { id?: string } | undefined {
  const compatibleServer = server as unknown as {
    environments: Record<string, { moduleGraph?: { idToModuleMap: Map<string, { id?: string }> } }>
    moduleGraph: { idToModuleMap: Map<string, { id?: string }> }
  }
  const moduleGraph = compatibleServer.environments[ssr ? 'ssr' : 'client']!.moduleGraph!
  return [...moduleGraph.idToModuleMap.values()]
    .find(module => module.id?.split('?')[0] === file)
}

async function devHttpBase(server: ViteDevServer): Promise<string> {
  await server.listen()
  const url = server.resolvedUrls?.local?.[0]
  if (url === undefined)
    throw new Error('Vite did not report a local HTTP URL')
  return new URL('/', url).href
}

function wrapHook(
  plugin: Plugin,
  hookName: 'load' | 'resolveId' | 'transform',
  observe: (id: string, args: readonly unknown[]) => void,
): void {
  const pluginRecord = plugin as unknown as Record<string, unknown>
  const hook = pluginRecord[hookName]
  const hookRecord = typeof hook === 'object' && hook !== null
    ? hook as { handler?: (this: unknown, id: string, ...args: unknown[]) => unknown }
    : undefined
  const original = typeof hook === 'function'
    ? hook as (this: unknown, id: string, ...args: unknown[]) => unknown
    : hookRecord?.handler
  if (original === undefined)
    throw new Error(`${plugin.name} is missing its ${hookName} handler`)

  const wrapped = function (this: unknown, ...args: unknown[]) {
    const id = hookName === 'transform' ? args[1] : args[0]
    if (typeof id === 'string')
      observe(id, args)
    return Reflect.apply(original, this, args)
  }
  if (typeof hook === 'function')
    pluginRecord[hookName] = wrapped
  else if (hookRecord !== undefined)
    hookRecord.handler = wrapped
}

describe('vite virtual CSS graph compatibility', () => {
  it('matches headless check CSS and diagnostics with the installed host compiler', async () => {
    const { build } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-check-host-parity-')))
    const receiptKey = Symbol.for(root)
    const receipts = globalThis as unknown as Record<symbol, { css: string[], diagnostics: unknown[], configure: number }>
    try {
      await put(root, 'package.json', '{"name":"check-host-parity","type":"module"}')
      const sdk = join(vanityRoot, '..')
      const installed = join(root, 'node_modules/@mszr/vanity')
      // A copied package binds check's Vite peer to the matrix host, rather
      // than silently using the workspace's Vite major through a symlink.
      await unlink(join(installed, 'dist'))
      await cp(join(sdk, 'dist'), join(installed, 'dist'), { recursive: true })
      const metadata = JSON.parse(await readFile(join(sdk, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
      for (const dependency of Object.keys(metadata.dependencies)) {
        const target = join(installed, 'node_modules', dependency)
        await mkdir(dirname(target), { recursive: true })
        await symlink(join(sdk, 'node_modules', dependency), target)
      }
      const entry = process.env.VANITY_VITE_TEST_ENTRY
      const vite = entry === undefined
        ? dirname(createRequire(import.meta.url).resolve('vite/package.json'))
        : dirname(dirname(dirname(entry)))
      await symlink(vite, join(installed, 'node_modules/vite'))
      await symlink(vite, join(root, 'node_modules/vite'))
      await put(root, 'system.ts', `import{createSystem}from'@mszr/vanity';export const ds=createSystem({declarations:{level:'discourage',tokens:['length']}}).consolidate()`)
      await put(root, 'chosen.ts', `export const chosen='client'`)
      await put(root, 'node_modules/@fixture/choice/package.json', JSON.stringify({ name: '@fixture/choice', type: 'module', exports: { browser: './browser.js', node: './node.js', default: './node.js' } }))
      await put(root, 'node_modules/@fixture/choice/browser.js', `export const chosen='browser'`)
      await put(root, 'node_modules/@fixture/choice/node.js', `export const chosen='node'`)
      await put(root, 'row.css.ts', `import{chosen as a}from'string-alias';import{chosen as b}from'regex-alias';import{chosen as c}from'plugin-choice';import{chosen as d}from'@fixture/choice';import{chosen as e}from'virtual-choice';export const row=ds.class({padding:'13px',fontFamily:JSON.stringify([a,b,c,d,e].join(' '))})`)
      const application = await put(root, 'entry.ts', `import{row}from'./row.css.ts';console.log(row)`)
      await put(root, 'vite.config.mjs', `
        import { vanityPlugin } from '@mszr/vanity/vite'
        import { fileURLToPath } from 'node:url'
        const root = fileURLToPath(new URL('.', import.meta.url))
        const receipt = globalThis[Symbol.for(${JSON.stringify(root)})] = { css: [], diagnostics: [], configure: 0 }
        export default {
          resolve: { alias: [
            { find: 'string-alias', replacement: root + 'chosen.ts' },
            { find: /^regex-alias$/, replacement: root + 'chosen.ts' },
          ] },
          plugins: [{
            name: 'parity-receipt', enforce: 'pre',
            configureServer() { receipt.configure++ },
            resolveId(id) {
              if (id === 'plugin-choice') return root + 'chosen.ts'
              if (id === 'virtual-choice') return '\\0virtual-choice'
            },
            load(id) { if (id === '\\0virtual-choice') return 'export const chosen="virtual"' },
            transform(code, id) { if (id.split('?')[0].endsWith('.vanity.css')) receipt.css.push(code) },
          }, ...vanityPlugin({ compiler: { system: './system.ts', diagnostics: d => receipt.diagnostics.push(d) }, autoImports: { style: '$system' } })],
        }
      `)
      const { checkProject } = await import(pathToFileURL(join(installed, 'dist/cli.mjs')).href) as typeof import('../../cli')
      const checked = await checkProject({ root })
      expect(checked.report.exitCode).toBe(0)
      expect(receipts[receiptKey]?.configure).toBe(1)
      await build({ root, logLevel: 'silent', build: { write: false, lib: { entry: application, formats: ['es'] } } })
      const host = receipts[receiptKey]!
      expect(host.css.toSorted()).toEqual([...checked.css.values()].toSorted())
      expect(host.diagnostics).toEqual(checked.report.diagnostics.map(({ identity: _identity, evidence: _evidence, accepted: _accepted, ...diagnostic }) => diagnostic))
    }
    finally {
      delete receipts[receiptKey]
      await rm(root, { recursive: true, force: true })
    }
  })

  it.each(['normal', 'scoped', 'custom-element', 'module'])('compiles the actual Vue %s stylesheet request as CSS', async (form) => {
    const { build } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vue-style-query-')))
    await put(root, 'package.json', '{"name":"vue-style-query","type":"module"}')
    await symlink(join(vanityRoot, '../node_modules/vue'), join(root, 'node_modules/vue'))
    await put(root, 'system.ts', `import{createSystem}from'@mszr/vanity';export const ds=createSystem().consolidate()`)
    await put(root, 'card.css.ts', `import{ds}from'./system';export const card=ds.class({padding:'13px'})`)
    const component = await put(root, 'Card.vue', `<template><main>Style</main></template><style src="./card.css.ts" ${form === 'scoped' ? 'scoped' : form === 'module' ? 'module' : ''}></style>`)
    const result = await build({ root, configFile: false, logLevel: 'silent', plugins: [...vanityPlugin({ compiler: { system: './system.ts' } }), vue({ customElement: form === 'custom-element' })], build: { write: false, minify: false, cssMinify: false, lib: { entry: component, formats: ['es'] }, rollupOptions: { external: ['vue'] } } })
    const outputs = Array.isArray(result) ? result : [result]
    const css = outputs.flatMap((part) => {
      if (!('output' in part))
        throw new Error('expected one-shot Vue build output')
      return part.output
    }).filter(item => item.type === 'asset').map(item => String(item.source)).join('\n')
    const contents = form === 'custom-element' ? bundleCode(result) : css
    expect(contents).toMatch(/padding:\s*13px/)
    expect(contents).toContain('@layer vanity')
  })

  it.each([undefined, 'accepted.json'])('reconciles baseline creation, edits and deletion in the same dev server (%s)', async (configured) => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-baseline-hmr-')))
    await put(root, 'package.json', '{"name":"baseline-hmr","type":"module"}')
    await put(root, 'system.ts', `import{createSystem}from'@mszr/vanity';export const ds=createSystem({declarations:{level:'forbid',tokens:['length']}}).consolidate()`)
    await put(root, 'row.css.ts', `import{ds}from'./system';export const card=ds.class({padding:'13px'})`)
    const baselineFile = join(root, configured ?? 'vanity.baseline.json')
    const baseline = JSON.stringify({ format: 'vanity.baseline/1', entries: [{ code: 'VANITY_DECLARATION_RAW', module: 'row.css.ts', style: { export: 'card', name: 'card' }, property: 'padding', condition: [], value: '13px', count: 1 }] })
    const server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: vanityPlugin({ compiler: { system: './system.ts', baseline: configured } }), server: { host: '127.0.0.1', port: 0 } })
    try {
      const origin = await devHttpBase(server)
      const response = async (accepted: boolean) => {
        await vi.waitFor(async () => {
          const result = await fetch(new URL('/row.css.ts', origin))
          const body = await result.text()
          expect(result.status, body).toBe(accepted ? 200 : 500)
          expect(body).toContain(accepted ? 'card' : configured && !await readFile(baselineFile).catch(() => undefined) ? 'VANITY_BASELINE_INVALID' : 'VANITY_DECLARATION_RAW')
        }, { timeout: 15_000 })
      }
      await response(false)
      await writeFile(baselineFile, baseline)
      await response(true)
      await writeFile(baselineFile, JSON.stringify({ format: 'vanity.baseline/1', entries: [] }))
      await response(false)
      await writeFile(baselineFile, baseline)
      await response(true)
      await unlink(baselineFile)
      await response(false)
      await writeFile(baselineFile, baseline)
      await response(true)
    }
    finally {
      await server.close()
    }
  })

  it('answers inline style requests with the client CSS and preserves raw source requests', async () => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-css-query-')))
    await put(root, 'package.json', '{"name":"css-query-contract","type":"module"}')
    const system = await put(root, 'system.ts', 'import {createSystem} from "@mszr/vanity";export const ds=createSystem().addTokens({space:{gap:"13px"}}).consolidate()')
    const authored = 'import {ds} from "./system";export const card=ds.class({padding:ds.t.space.gap})'
    await put(root, 'style.css.ts', authored)
    const server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system, layerOrder: ['vendor', 'vanity'] } })], optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } })
    try {
      const rawFirst = (await server.transformRequest('/style.css.ts?raw'))!.code
      expect(defaultExportedString(rawFirst)).toBe(authored)
      const ordinary = (await server.transformRequest('/style.css.ts'))!.code
      expect(ordinary).toMatch(/export (?:var|const) card/)
      const urls = importsIn(ordinary).filter(url => url.includes('/.vanity/virtual/'))
      const clientCss = (await Promise.all(urls.map(async url => (await server.transformRequest(`${url}?inline`))!.code)))
        .map(defaultExportedString)
        .join('\n')
      for (const query of ['inline', 'inline&used', 'inline&used&t=123']) {
        const code = (await server.transformRequest(`/style.css.ts?${query}`))!.code
        expect(code).toMatch(/^export default /)
        expect(defaultExportedString(code)).toBe(clientCss)
        expect(code).not.toContain('import.meta.hot')
      }
      for (const query of ['raw', 'raw&inline', 'raw&url', 'raw&direct']) {
        const code = (await server.transformRequest(`/style.css.ts?${query}`))!.code
        expect(defaultExportedString(code)).toBe(authored)
      }
    }
    finally {
      await server.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('applies host CSS processing to inline views and preserves vanilla-extract stylesheet identity', async () => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-query-processing-')))
    await put(root, 'package.json', '{"name":"query-processing-contract","type":"module"}')
    const system = await put(root, 'system.ts', 'import{createSystem}from"@mszr/vanity";export const ds=createSystem().consolidate()')
    await put(root, 'style.css.ts', 'import{ds}from"./system";export const card=ds.class({padding:"13px"})')
    await put(root, 'native.css.ts', 'import{style}from"@vanilla-extract/css";export const card=style({padding:"13px"})')
    const server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system } })], resolve: { alias: { '@vanilla-extract/css': join(vanityRoot, '../node_modules/@vanilla-extract/css') } }, css: { postcss: { plugins: [{ postcssPlugin: 'fixture-processing', Declaration(declaration: { prop: string, value: string }) {
      if (declaration.prop === 'padding' && declaration.value === '13px')
        declaration.value = '14px'
    } }] } }, optimizeDeps: { noDiscovery: true }, server: { host: '127.0.0.1', port: 0, hmr: false, ws: false, watch: null } })
    try {
      const origin = await devHttpBase(server)
      const compiled = (await server.transformRequest('/style.css.ts?inline'))!.code
      expect(compiled).toMatch(/padding: ?14px/)
      const ordinary = (await server.transformRequest('/native.css.ts'))!.code
      expect(ordinary).toMatch(/export (?:var|const) card/)
      const cssUrl = importsIn(ordinary).find(url => url.includes('.vanilla.css'))!
      const css = (await server.transformRequest(`${cssUrl}?inline`))!.code
      const queried = (await server.transformRequest('/native.css.ts?inline'))!.code
      expect(queried).toBe(css)
      const response = await fetch(new URL('/__vanity/manifest.json', origin))
      const manifest = await response.json() as { modules: Record<string, unknown> }
      expect(Object.keys(manifest.modules)).not.toContain('native.css.ts')
      await put(root, 'native.css.ts', 'import{style}from"@vanilla-extract/css";export const card=style({padding:"15px"})')
      for (const environment of Object.values(server.environments))
        environment.moduleGraph.invalidateAll()
      const updated = (await server.transformRequest('/native.css.ts?inline'))!.code
      expect(updated).toMatch(/padding: ?15px/)
    }
    finally {
      await server.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('answers CSS query combinations through the development stylesheet pipeline', async () => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-css-query-domain-')))
    await put(root, 'package.json', '{"name":"css-query-domain","type":"module"}')
    const system = await put(root, 'system.ts', 'import {createSystem} from "@mszr/vanity";export const ds=createSystem().consolidate()')
    const authored = 'import {ds} from "./system";export const card=ds.class({padding:"13px"})'
    await put(root, 'style.css.ts', authored)
    const options = () => ({ root, configFile: false as const, logLevel: 'silent' as const, plugins: [vanityPlugin({ compiler: { system, layerOrder: ['vendor', 'vanity'] } })], optimizeDeps: { noDiscovery: true } })
    const server = await createServer({ ...options(), server: { host: '127.0.0.1', port: 0, hmr: false, ws: false, watch: null } })
    try {
      const origin = await devHttpBase(server)
      for (const query of cssQueryForms) {
        const parameters = new URLSearchParams(query)
        const inline = parameters.has('inline') || parameters.has('inline-css')
        const id = `/style.css.ts${query ? `?${query}` : ''}`
        const code = (await server.transformRequest(id))!.code
        if (parameters.has('raw')) {
          expect(defaultExportedString(code), query).toBe(authored)
        }
        else if (parameters.has('url')) {
          const url = defaultExportedString(code)
          if (inline) {
            expect(url, query).toMatch(/^data:text\/css;base64,/)
            expect(Buffer.from(url.split(',')[1]!, 'base64').toString(), query).toMatch(/padding: ?13px/)
          }
          else {
            const response = await fetch(new URL(url, origin), { headers: { accept: 'text/css' } })
            expect(response.headers.get('content-type'), query).toContain('text/css')
            expect(await response.text(), query).toMatch(/padding: ?13px/)
          }
        }
        else if (parameters.has('direct')) {
          expect(code, query).toMatch(/padding: ?13px/)
          expect(code, query).not.toContain('export ')
          const response = await fetch(new URL(id, origin), { headers: { accept: 'text/css' } })
          expect(response.headers.get('content-type'), query).toContain('text/css')
        }
        else if (inline) {
          expect(defaultExportedString(code), query).toMatch(/padding: ?13px/)
          expect(defaultExportedString(code), query).toContain('@layer vendor, vanity;')
        }
        else if (parameters.has('vue') || parameters.has('transform-only')) {
          expect(code, query).toContain('__vite__updateStyle(')
        }
        else {
          expect(code, query).toMatch(/export (?:var|const) card/)
        }
      }
    }
    finally {
      await server.close()
    }
    await rm(root, { recursive: true, force: true })
  })

  it.each(cssQueryForms)('answers the CSS build query %j', async (query) => {
    const { build } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-css-build-query-')))
    await put(root, 'package.json', '{"name":"css-build-query-domain","type":"module"}')
    const system = await put(root, 'system.ts', 'import {createSystem} from "@mszr/vanity";export const ds=createSystem().consolidate()')
    await put(root, 'style.css.ts', 'import {ds} from "./system";export const card=ds.class({padding:"13px"})')
    const parameters = new URLSearchParams(query)
    const inline = parameters.has('inline') || parameters.has('inline-css')
    try {
      const entry = await put(root, 'entry.js', `import * as contents from './style.css.ts${query ? `?${query}` : ''}';export {contents}`)
      const outcome = await capture(() => build({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system, layerOrder: ['vendor', 'vanity'] } })], build: { write: false, minify: false, cssMinify: false, assetsInlineLimit: 0, lib: { entry, formats: ['es'] } } }))
      // Vite's native CSS URL hook cannot emit an inline transform-only stylesheet.
      if (parameters.has('url') && inline && !parameters.has('raw')) {
        expect(errorText(outcome.error), query).toMatch(/css content.*not found/s)
        return
      }
      expect(outcome.error, query).toBeUndefined()
      const code = bundleCode(outcome.value)
      if (parameters.has('raw')) {
        expect(code, query).toContain('ds.class')
      }
      else if (inline) {
        expect(code, query).toMatch(/padding: ?13px/)
        expect(code, query).toContain('@layer vendor, vanity;')
      }
      else {
        if (parameters.has('url')) {
          expect(code, query).not.toContain('ds.class')
          expect(code, query).toContain('.css')
        }
        else if (!parameters.has('vue') && !parameters.has('transform-only') && !parameters.has('direct')) {
          expect(code, query).toContain('card')
        }
        if (!parameters.has('transform-only')) {
          const outputs = (Array.isArray(outcome.value) ? outcome.value : [outcome.value]) as Array<{ output: Array<{ type: string, source?: unknown }> }>
          expect(outputs.flatMap(output => output.output).filter(item => item.type === 'asset').map(item => String(item.source)).join('\n'), query).toMatch(/padding: ?13px/)
        }
      }
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps authored filesystem builtins native and a builtin-named client polyfill installed', async () => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-builtins-')))
    await put(root, 'package.json', '{"name":"builtin-fixture","type":"module"}')
    const system = await put(root, 'system.ts', 'import {createSystem} from "@mszr/vanity";export const ds=createSystem().consolidate({prefix:"builtins"})')
    const data = await put(root, 'padding.txt', '5px')
    await put(root, 'node_modules/buffer/package.json', '{"name":"buffer","type":"module","exports":{"browser":"./browser.js","node":"./node.js","default":"./node.js"}}')
    await put(root, 'node_modules/buffer/browser.js', 'export const selected="7px"')
    await put(root, 'node_modules/buffer/node.js', 'export const selected="2px"')
    await put(root, 'style.css.ts', `import {ds} from "./system";import {readFileSync} from "node:fs";import {readFileSync as bare} from "fs";import {selected} from "buffer";if(bare!==readFileSync)throw new Error("native identity lost");export const card=ds.class({padding:readFileSync(${JSON.stringify(data)},"utf8"),width:selected})`)
    const server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system } })], optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } })
    try {
      const result = await server.transformRequest('/style.css.ts')
      const urls = importsIn(result!.code).filter(id => id.endsWith('.vanity.css'))
      const css = (await Promise.all(urls.map(id => server.transformRequest(id)))).map(result => result?.code ?? '').join('\n')
      expect(css).toMatch(/padding: ?5px/)
      expect(css).toMatch(/width: ?7px/)
    }
    finally {
      await server.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it.each(['exports-null', 'main-disabled', 'subpath-disabled'] as const)('resolves a named browser-disabled %s for Node while preserving package redirects', async (kind) => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-browser-null-')))
    await put(root, 'package.json', '{"name":"browser-null-fixture","type":"module"}')
    const system = await put(root, 'system.ts', 'import {createSystem} from "@mszr/vanity";export const ds=createSystem().consolidate({prefix:"browsernull"})')
    for (const name of ['disabled', 'redirected']) {
      await put(root, `node_modules/@fixture/${name}/package.json`, JSON.stringify({ name: `@fixture/${name}`, type: 'module', ...(kind === 'exports-null' ? { exports: { '.': { browser: null, node: './node.js', default: './node.js' } } } : { main: './node.js', browser: { [kind === 'main-disabled' ? './node.js' : './disabled.js']: false } }) }))
      await put(root, `node_modules/@fixture/${name}/node.js`, 'export const padding="1px"')
      if (kind === 'subpath-disabled')
        await put(root, `node_modules/@fixture/${name}/disabled.js`, 'export const padding="1px"')
    }
    const other = await put(root, 'node_modules/@fixture/other/index.js', 'export const padding="3px"')
    await put(root, 'node_modules/@fixture/other/package.json', '{"name":"@fixture/other","type":"module","exports":"./index.js"}')
    const suffix = kind === 'subpath-disabled' ? '/disabled.js' : ''
    await put(root, 'style.css.ts', `import {ds} from "./system";import {padding} from "@fixture/disabled${suffix}";import {padding as redirected} from "@fixture/redirected${suffix}";export const card=ds.class({padding,width:redirected})`)
    const server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system } })], resolve: { alias: { [`@fixture/redirected${suffix}`]: other } }, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } })
    try {
      const result = await server.transformRequest('/style.css.ts')
      const urls = importsIn(result!.code).filter(id => id.endsWith('.vanity.css'))
      const css = (await Promise.all(urls.map(id => server.transformRequest(id)))).map(result => result?.code ?? '').join('\n')
      expect(css).toMatch(/padding: ?1px/)
      expect(css).toMatch(/width: ?3px/)
    }
    finally {
      await server.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it.each(['/', '/sub/'].flatMap(base => [false, true].map(first => ({ base, first }))))('serves overlapping system saves without false errors under $base, first=$first', async ({ base, first }) => {
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch({ headless: true })
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-save-burst-')))
    let server: ViteDevServer | undefined
    const systemReady = createPromiseGate()
    const systemGate = createPromiseGate()
    let holdSystem = false
    const systemFile = join(root, 'system.ts')
    const build = styleBuild.buildStyleModule
    const spy = vi.spyOn(styleBuild, 'buildStyleModule').mockImplementation(async (params) => {
      const result = await build(params)
      if (params.filePath === systemFile && holdSystem) {
        holdSystem = false
        systemReady.resolve()
        await systemGate.promise
      }
      return result
    })
    try {
      await put(root, 'package.json', '{ "name": "save-burst", "type": "module" }')
      const system = (menu = false, missing = false) => `import { createSystem } from '@mszr/vanity'
const open = createSystem()
export const ds = open.addTokens(open.defineTokens({ text: {
  caption: { fontSize: '12px' }${menu ? ', menu: { fontSize: \'14px\' }' : ''}${missing ? ', missing: { fontSize: \'16px\' }' : ''},
} })).consolidate({ prefix: 'save-burst' })`
      await writeFile(systemFile, system())
      await put(root, 'authoring.ts', 'import { ds } from \'./system\'; export const { class: cls, t } = ds\n')
      await put(root, 'initial.css.ts', 'import { ds } from \'./system\'; export const initial = ds.class({ padding: \'1px\' })\n')
      const styleFiles = [1, 2, 3].map(index => join(root, `style${index}.css.ts`))
      const style = (role: string) => `export const card = cls({ ...t.text.${role}.$dec })\n`
      for (const file of styleFiles)
        await writeFile(file, style(first ? 'menu' : 'caption'))
      await put(root, 'main.ts', `import { card as a } from './style1.css'; import { card as b } from './style2.css'; import { card as c } from './style3.css';
document.body.innerHTML = '<p id="a">a</p><p id="b">b</p><p id="c">c</p>';
for (const [id, cls] of [['a', a], ['b', b], ['c', c]]) document.getElementById(id).className = cls;
`)
      await put(root, 'index.html', '<script type="module" src="/main.ts"></script>')
      const attempts = new Set<string>()
      const diagnostics: string[] = []
      const errors: string[] = []
      server = await createServer({
        root,
        base,
        configFile: false,
        logLevel: 'silent',
        plugins: [
          { name: 'observe-consumers', enforce: 'pre', transform(_code, id) {
            if (styleFiles.includes(id))
              attempts.add(id)
          } },
          vanityPlugin({ compiler: { system: './system.ts', diagnostics: diagnostic => diagnostics.push(diagnostic.message) }, autoImports: { shared: './authoring.ts' } }),
        ],
        resolve: { alias },
        optimizeDeps: { noDiscovery: true },
        server: { host: '127.0.0.1', port: 0, watch: null },
      })
      const logger = vi.spyOn(server.config.logger, 'error')
      const page = await browser.newPage()
      page.on('websocket', socket => socket.on('framereceived', (frame) => {
        const message = JSON.parse(String(frame.payload))
        if (message.type === 'error')
          errors.push(message.err.message)
      }))
      const origin = await devHttpBase(server)
      await server.transformRequest('/initial.css.ts')
      if (!first) {
        await page.goto(new URL(base, origin).href, { waitUntil: 'networkidle' })
        for (const id of ['a', 'b', 'c'])
          await expect.poll(() => page.locator(`#${id}`).evaluate(el => getComputedStyle(el).fontSize)).toBe('12px')
      }
      attempts.clear()
      holdSystem = true
      await writeFile(systemFile, system(true))
      server.watcher.emit('change', systemFile)
      await systemReady.promise
      const navigation = first ? page.goto(new URL(base, origin).href, { waitUntil: 'networkidle' }) : undefined
      if (!first) {
        for (const file of styleFiles) {
          await writeFile(file, style('menu'))
          server.watcher.emit('change', file)
        }
      }
      await vi.waitFor(() => expect(attempts.size).toBeGreaterThanOrEqual(first ? 3 : 1))
      systemGate.resolve()
      await navigation
      for (const id of ['a', 'b', 'c'])
        await expect.poll(() => page.locator(`#${id}`).evaluate(el => getComputedStyle(el).fontSize), { timeout: 10_000 }).toBe('14px')
      expect(errors).toEqual([])
      expect(diagnostics).toEqual([])
      expect(logger).not.toHaveBeenCalled()
      expect(await page.locator('vite-error-overlay').count()).toBe(0)

      // An absent role with no replacement in flight remains a real failure.
      for (const file of styleFiles) {
        await writeFile(file, style('missing'))
        server.watcher.emit('change', file)
      }
      await page.locator('vite-error-overlay').getByText('Last successful CSS is retained', { exact: false }).first().waitFor()
      expect(errors.some(error => error.includes('reading \'$dec\''))).toBe(true)
      expect(diagnostics.some(error => error.includes('reading \'$dec\''))).toBe(true)
      await vi.waitFor(() => {
        for (const index of [1, 2, 3])
          expect(diagnostics.some(error => error.includes(`style${index}.css.ts`))).toBe(true)
      })
      expect(await page.evaluate(url => fetch(url).then(response => response.status), `${base}style1.css.ts?t=${Date.now()}`)).toBe(500)
      expect(logger.mock.calls.some(([message]) => message.includes('Last successful CSS is retained'))).toBe(true)
      for (const id of ['a', 'b', 'c'])
        expect(await page.locator(`#${id}`).evaluate(el => getComputedStyle(el).fontSize)).toBe('14px')
      await writeFile(systemFile, system(true, true))
      server.watcher.emit('change', systemFile)
      for (const id of ['a', 'b', 'c'])
        await expect.poll(() => page.locator(`#${id}`).evaluate(el => getComputedStyle(el).fontSize), { timeout: 10_000 }).toBe('16px')
      expect(await page.locator('vite-error-overlay').count()).toBe(0)
      logger.mockRestore()
    }
    finally {
      systemGate.resolve()
      await browser.close()
      await server?.close()
      spy.mockRestore()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 30_000)

  it.each([false, true])('delivers accepted CSS after a partial failure, overlapping repair=%s', async (overlapping) => {
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch({ headless: true })
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-partial-recovery-')))
    let server: ViteDevServer | undefined
    const held = createPromiseGate()
    const release = createPromiseGate()
    const secondFile = join(root, 'second.css.ts')
    const firstFile = join(root, 'first.css.ts')
    let holdSecond = false
    const build = styleBuild.buildStyleModule
    const spy = vi.spyOn(styleBuild, 'buildStyleModule').mockImplementation(async (params) => {
      const result = await build(params)
      if (holdSecond && params.filePath === secondFile) {
        holdSecond = false
        held.resolve()
        await release.promise
      }
      return result
    })
    try {
      await put(root, 'package.json', '{ "name": "partial-recovery", "type": "module" }')
      const system = (font: string) => `import { createSystem } from '@mszr/vanity'; export const ds = createSystem().consolidate({ prefix: 'partial' }); export const font = '${font}'`
      const systemFile = await put(root, 'system.ts', system('12px'))
      const valueFile = await put(root, 'first-value.ts', 'export const padding = \'1px\'')
      await writeFile(firstFile, 'import { ds, font } from \'./system\'; import { padding } from \'./first-value\'; export const card = ds.class({ fontSize: font, padding })')
      await writeFile(secondFile, 'import { ds, font } from \'./system\'; export const card = ds.class({ fontSize: font })')
      await put(root, 'main.ts', `import { card as first } from './first.css'; import { card as second } from './second.css'; document.body.innerHTML='<p id="first">first</p><p id="second">second</p>'; document.getElementById('first').className=first; document.getElementById('second').className=second`)
      await put(root, 'index.html', '<script type="module" src="/main.ts"></script>')
      server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system: './system.ts' } })], resolve: { alias }, server: { host: '127.0.0.1', port: 0, watch: null }, optimizeDeps: { noDiscovery: true } })
      const initial = await server.transformRequest('/first.css.ts')
      await server.transformRequest('/second.css.ts')
      const cssUrl = initial?.code.match(/import ["']([^"']+\/style\/[^"']+\.vanity\.css)["']/)?.[1]
      expect(cssUrl).toBeDefined()
      const origin = await devHttpBase(server)
      const page = await browser.newPage()
      const errors: string[] = []
      page.on('websocket', socket => socket.on('framereceived', (frame) => {
        const message = JSON.parse(String(frame.payload))
        if (message.type === 'error')
          errors.push(message.err.message)
      }))
      await page.goto(origin, { waitUntil: 'networkidle' })
      for (const id of ['first', 'second'])
        await expect.poll(() => page.locator(`#${id}`).evaluate(el => getComputedStyle(el).fontSize)).toBe('12px')
      // Complete a normal native update before exercising recovery.
      await writeFile(valueFile, 'export const padding = \'2px\'')
      server.watcher.emit('change', valueFile)
      await expect.poll(() => page.locator('#first').evaluate(el => getComputedStyle(el).padding)).toBe('2px')
      await writeFile(valueFile, 'export const padding = (() => { throw new Error(\'authored style failure\') })()')
      server.moduleGraph.onFileChange(firstFile)
      for (const environment of Object.values(server.environments ?? {}))
        environment.moduleGraph.onFileChange(firstFile)
      expect((await fetch(new URL('/first.css.ts?t=1', origin))).status).toBe(500)
      await page.locator('vite-error-overlay').getByText('authored style failure', { exact: false }).first().waitFor()
      // The system update fails its first consumer, then pauses while the
      // second consumer is preparing valid replacement CSS.
      holdSecond = true
      await writeFile(systemFile, system('14px'))
      server.watcher.emit('change', systemFile)
      await held.promise
      if (!overlapping) {
        const reported = errors.length
        release.resolve()
        await expect.poll(() => errors.length, { timeout: 10_000 }).toBeGreaterThan(reported)
      }
      await writeFile(valueFile, 'export const padding = \'2px\'')
      // Invoke the actual compiler hook without Vite's separate fallback
      // reload for a bundled file; that reload would mask lost CSS delivery.
      const repair = invokeVanityHotUpdate(server, valueFile)
      // Public CSS requests establish that the repair has been accepted,
      // while the other known update is still held at its bundle boundary.
      await expect.poll(async () => (await fetch(new URL(`${cssUrl!}?t=${Date.now()}`, origin))).text(), { timeout: 10_000 }).toMatch(/font-size:\s*14px/)
      release.resolve()
      await repair
      for (const id of ['first', 'second'])
        await expect.poll(() => page.locator(`#${id}`).evaluate(el => getComputedStyle(el).fontSize), { timeout: 10_000 }).toBe('14px')
      await expect.poll(() => page.locator('vite-error-overlay').count()).toBe(0)
    }
    finally {
      release.resolve()
      await browser.close()
      await server?.close()
      spy.mockRestore()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 30_000)

  it.each([false, true])('repairs a failed system with one reload after prior hot update: %s', async (afterHotUpdate) => {
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch({ headless: true })
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-recovery-')))
    let server: ViteDevServer | undefined
    try {
      await put(root, 'package.json', '{ "name": "system-recovery", "type": "module" }')
      const theme = await put(root, 'theme.ts', 'export const brand = \'#123456\'\n')
      await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity';
import { brand } from './theme';
export const ds = createSystem().addTokens({ color: { brand } }).consolidate({ prefix: 'recovery' })`)
      const styleSource = 'import { ds } from \'./system\'; export const card = ds.class({ color: ds.t.color.brand, padding: \'1px\' })'
      const style = await put(root, 'card.css.ts', styleSource)
      const unloadedStyle = await put(root, 'unloaded.css.ts', styleSource)
      await put(root, 'main.ts', `import { ds } from './system';
import { card } from './card.css.ts';
sessionStorage.setItem('loads', String(Number(sessionStorage.getItem('loads') ?? 0) + 1));
import.meta.hot?.on('vite:beforeFullReload', () => {
  sessionStorage.setItem('reload-target', String(Number(sessionStorage.getItem('loads')) + 1))
});
document.body.innerHTML = '<p id="card">card</p>';
document.querySelector('#card').className = card;
document.body.dataset.token = ds.t.color.brand.$name`)
      await put(root, 'index.html', '<script type="module" src="/main.ts"></script>')
      server = await createServer({
        root,
        base: '/sub/',
        configFile: false,
        logLevel: 'silent',
        plugins: [
          vanityPlugin({ compiler: { system: './system.ts' } }),
          {
            name: 'slow-unloaded-consumer',
            async transform(_source, id) {
              if (id === unloadedStyle)
                await new Promise(resolve => setTimeout(resolve, 600))
            },
          },
        ],
        resolve: { alias },
        server: { host: '127.0.0.1', port: 0, watch: null },
        optimizeDeps: { noDiscovery: true },
      })
      const page = await browser.newPage()
      const origin = await devHttpBase(server)
      await server.transformRequest('/unloaded.css.ts')
      await server.transformRequest('/card.css.ts')
      await page.goto(new URL('/sub/', origin).href, { waitUntil: 'networkidle' })
      const color = () => page.locator('#card').evaluate(element => getComputedStyle(element).color)
      const loads = () => page.evaluate(() => Number(sessionStorage.getItem('loads')))
      await expect.poll(color, { timeout: 10_000 }).toBe('rgb(18, 52, 86)')
      expect(await loads()).toBe(1)
      if (afterHotUpdate) {
        await writeFile(style, styleSource.replace('\'1px\'', '\'2px\''))
        server.watcher.emit('change', style)
        await expect.poll(() => page.locator('#card').evaluate(element => getComputedStyle(element).padding), { timeout: 10_000 }).toBe('2px')
        expect(await loads()).toBe(1)
      }
      await writeFile(theme, 'throw new Error(\'broken theme\')\n')
      server.watcher.emit('change', theme)
      await page.locator('vite-error-overlay').getByText('broken theme', { exact: false }).first().waitFor()
      expect(await color()).toBe('rgb(18, 52, 86)')
      expect(await loads()).toBe(1)
      await writeFile(theme, 'export const brand = \'#654321\'\n')
      server.watcher.emit('change', theme)
      await page.waitForFunction(() => {
        const target = Number(sessionStorage.getItem('reload-target'))
        return target > 0 && Number(sessionStorage.getItem('loads')) >= target
      })
      await expect.poll(color, { timeout: 10_000 }).toBe('rgb(101, 67, 33)')
      await page.waitForLoadState('networkidle')
      expect(await loads()).toBe(2)
      expect(await page.locator('vite-error-overlay').count()).toBe(0)
    }
    finally {
      await browser.close()
      await server?.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 30_000)

  it.each(['/', '/sub/'])('retires only installed replacement CSS for each page under %s', async (base) => {
    const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch({ headless: true })
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-installed-css-')))
    let server: ViteDevServer | undefined
    let releaseSlowPage = () => {}
    try {
      await put(root, 'package.json', '{ "name": "installed-css", "type": "module" }')
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity';
export const padding = '1px';
export const ds = createSystem().addTokens({ color: { brand: '#123456' } })
.addRules({ reset: { layer: 'reset', css: { p: { padding: 0 } } } }).consolidate({ prefix: 'installed' })`)
      for (const entry of ['first', 'second', 'unloaded']) {
        await put(root, `${entry}.css.ts`, `import { ds, padding } from './system'; export const card = ds.class({ color: ds.t.color.brand, padding })`)
        await put(root, `${entry}.ts`, `import { card } from './${entry}.css.ts'; document.body.innerHTML='<p id="card">card</p>'; document.querySelector('#card').className = card`)
        await put(root, `${entry}.html`, `<script type="module" src="/${entry}.ts"></script>`)
      }
      server = await createServer({ root, base, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system: './system.ts' } })], resolve: { alias }, server: { host: '127.0.0.1', port: 0, watch: null }, optimizeDeps: { noDiscovery: true } })
      const origin = await devHttpBase(server)
      const pages = [await browser.newPage(), await browser.newPage()]
      for (const [index, page] of pages.entries()) {
        await page.goto(new URL(`${base}${index === 0 ? 'first' : 'second'}.html`, origin).href, { waitUntil: 'networkidle' })
        await page.waitForSelector('#card')
        expect(await page.locator('#card').evaluate(el => getComputedStyle(el).padding)).toBe('1px')
        await page.evaluate(() => {
          const state = { gap: false, early: false, expected: '2px' }
          ;(globalThis as any).installation = state
          const old = [...document.styleSheets].map(sheet => (sheet.ownerNode as Element)?.getAttribute('data-vite-dev-id')).find(id => id?.includes('/virtual/system/'))
          if (!old)
            throw new Error('no installed system CSS')
          new MutationObserver(() => {
            const ids = [...document.styleSheets].map(sheet => (sheet.ownerNode as Element)?.getAttribute('data-vite-dev-id'))
            if (!ids.some(id => id?.includes('/virtual/system/')))
              state.gap = true
            if (!ids.includes(old) && getComputedStyle(document.querySelector('#card')!).padding !== state.expected)
              state.early = true
          }).observe(document.head, { childList: true })
        })
      }
      // Materialize an unloaded client and SSR consumer, with no browser import.
      await server.transformRequest('/unloaded.css.ts')
      await server.transformRequest('/unloaded.css.ts', { ssr: true })
      const slowPage = new Promise<void>((resolve) => {
        releaseSlowPage = resolve
      })
      await pages[0]!.route('**/*.vanity.css*', async (route) => {
        await new Promise(resolve => setTimeout(resolve, route.request().url().includes('/virtual/style/') ? 900 : 600))
        await route.continue()
      })
      await pages[1]!.route('**/*.vanity.css*', async (route) => {
        await slowPage
        await route.continue()
      })
      const initial = await pages[0]!.evaluate(() => [...document.styleSheets].map(sheet => (sheet.ownerNode as Element)?.getAttribute('data-vite-dev-id')).find(id => id?.includes('/virtual/system/'))!)
      const original = await readFile(system, 'utf8')
      await writeFile(system, original.replace('#123456', '#654321').replace('\'1px\'', '\'2px\''))
      server.watcher.emit('change', system)
      await pages[0]!.waitForFunction(old => ![...document.styleSheets].some(sheet => (sheet.ownerNode as Element)?.getAttribute('data-vite-dev-id') === old), initial)
      expect(await pages[1]!.evaluate(old => [...document.styleSheets].some(sheet => (sheet.ownerNode as Element)?.getAttribute('data-vite-dev-id') === old), initial)).toBe(true)
      releaseSlowPage()
      for (const page of pages) {
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#card')!).color === 'rgb(101, 67, 33)' && getComputedStyle(document.querySelector('#card')!).padding === '2px')
        await page.waitForFunction(old => ![...document.styleSheets].some(sheet => (sheet.ownerNode as Element)?.getAttribute('data-vite-dev-id') === old), initial)
        expect(await page.evaluate(() => ({ gap: (globalThis as any).installation.gap, early: (globalThis as any).installation.early }))).toEqual({ gap: false, early: false })
      }
      // Capture the old response bytes before publishing the next generation.
      let capturedFirst = () => {}
      const captured = new Promise<void>((resolve) => {
        capturedFirst = resolve
      })
      for (const page of pages) {
        await page.unroute('**/*.vanity.css*')
        await page.evaluate(() => {
          (globalThis as any).installation.expected = '4px'
        })
        await page.route('**/*.vanity.css*', async (route) => {
          const response = await route.fetch()
          if (route.request().url().includes('/virtual/system/'))
            capturedFirst()
          await new Promise(resolve => setTimeout(resolve, 600))
          await route.fulfill({ response })
        })
      }
      await writeFile(system, original.replace('#123456', '#abcdef').replace('\'1px\'', '\'3px\''))
      server.watcher.emit('change', system)
      await captured
      await writeFile(system, original.replace('#123456', '#fedcba').replace('\'1px\'', '\'4px\''))
      server.watcher.emit('change', system)
      for (const page of pages) {
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#card')!).color === 'rgb(254, 220, 186)' && getComputedStyle(document.querySelector('#card')!).padding === '4px')
        await page.waitForFunction(() => [...document.styleSheets].filter(sheet => (sheet.ownerNode as Element)?.getAttribute('data-vite-dev-id')?.includes('/virtual/system/')).length === 1)
        expect(await page.evaluate(() => (globalThis as any).installation.gap)).toBe(false)
      }
    }
    finally {
      releaseSlowPage()
      await browser.close()
      await server?.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it.each([
    { layerOrder: undefined, nuxt: false },
    { layerOrder: [], nuxt: false },
    { layerOrder: ['vendor'], nuxt: true },
  ])('leaves document CSS to the host when no Vite layer statement is needed %j', async ({ layerOrder, nuxt }) => {
    const { build } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-host-css-')))
    try {
      await put(root, 'package.json', '{ "name": "vite-host-css", "type": "module" }')
      await put(root, 'index.html', '<!doctype html><html><head></head><body><script type="module" src="/main.ts"></script></body></html>')
      await put(root, 'main.ts', `import './main.css'`)
      await put(root, 'main.css', 'body { color: red }')
      const plugins = vanityPlugin({ compiler: { layerOrder }, ...(nuxt ? { [vanityViteHost]: { name: 'nuxt' as const, root } } : {}) })
      let entered = 0
      let release = () => {}
      const bothHtmlHosts = new Promise<void>((resolve) => {
        release = resolve
      })
      const holdHtml: Plugin = {
        name: 'hold-shared-html-input',
        transformIndexHtml: { order: 'pre', async handler() {
          if (++entered === 2)
            release()
          await bothHtmlHosts
        } },
      }
      const runBuild = () => build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [holdHtml, ...plugins],
        build: { write: false, minify: false, cssMinify: false },
      })
      // Vite 6 has no HTML environment. Shared inputs are ambiguous only when
      // Vanity needs a build-specific asset; otherwise both builds are valid.
      const results = await Promise.all([runBuild(), runBuild()])
      for (const result of results) {
        const outputs = (Array.isArray(result) ? result : [result]) as Array<{
          output: Array<{ type: string, fileName: string, source?: string | Uint8Array }>
        }>
        const assets = outputs.flatMap(output => output.output).filter(output => output.type === 'asset')
        const html = String(assets.find(asset => asset.fileName === 'index.html')?.source)
        const href = html.match(/<link\b[^>]+rel="stylesheet"[^>]*href="([^"]+)"/)?.[1]
        expect(href).toBeDefined()
        const css = assets.find(asset => `/${asset.fileName}` === href)
        expect(String(css?.source)).toContain('color: red')
        expect(assets.some(asset => asset.fileName.includes('vanity-layer-order'))).toBe(false)
        expect(html).not.toContain('__VITE_ASSET__')
      }
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it.each(['/sub/', './'])('resolves the first layer-order stylesheet through the host under base %s', async (base) => {
    const { build, createLogger } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-layer-link-')))
    const warnings: string[] = []
    const logger = createLogger('silent')
    logger.warn = message => warnings.push(message)

    try {
      await put(root, 'package.json', '{ "name": "vite-layer-link", "type": "module" }')
      await put(root, 'index.html', '<!doctype html><html><head></head><body><script type="module" src="/main.ts"></script></body></html>')
      await put(root, 'about.html', '<!doctype html><html><head></head><body><script type="module" src="/main.ts"></script></body></html>')
      await put(root, 'main.ts', `import './main.css'`)
      await put(root, 'main.css', 'body { color: red }')
      const plugins = vanityPlugin({ compiler: { layerOrder: ['vendor', 'app'] } })
      for (let buildNumber = 0; buildNumber < 2; buildNumber++) {
        const result = await build({
          root,
          base,
          configFile: false,
          customLogger: logger,
          plugins,
          build: { write: false, assetsDir: 'static', minify: false, cssMinify: false, rollupOptions: { input: { index: join(root, 'index.html'), about: join(root, 'about.html') } } },
        })
        const outputs = (Array.isArray(result) ? result : [result]) as Array<{
          output: Array<{ type: string, fileName: string, source?: string | Uint8Array }>
        }>
        const assets = outputs.flatMap(output => output.output).filter(output => output.type === 'asset')
        const htmlAssets = assets.filter(asset => asset.fileName.endsWith('.html'))
        expect(htmlAssets.map(asset => asset.fileName).sort()).toEqual(['about.html', 'index.html'])
        const layerAsset = assets.find(asset => String(asset.source) === '@layer vendor, app;\n')
        expect(layerAsset?.fileName).toMatch(/^static\/vanity-layer-order-[\w-]+\.css$/)
        for (const htmlAsset of htmlAssets) {
          const html = String(htmlAsset.source)
          const firstStylesheet = [...html.matchAll(/<link\b[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)][0]?.[1]
          expect(firstStylesheet).toBeDefined()
          const url = new URL(firstStylesheet!, 'https://fixture.test/sub/index.html')
          expect(url.pathname).toBe(`/sub/${layerAsset!.fileName}`)
          expect(warnings).toEqual([])
        }
      }
      const otherRoot = join(root, 'other-root')
      for (const file of ['package.json', 'index.html', 'main.ts', 'main.css'])
        await put(otherRoot, file, await readFile(join(root, file), 'utf8'))
      let entered = 0
      let release = () => {}
      const bothHtmlHosts = new Promise<void>((resolve) => {
        release = resolve
      })
      const holdHtml: Plugin = {
        name: 'hold-overlapping-html-inputs',
        transformIndexHtml: { order: 'pre', async handler() {
          if (++entered === 2)
            release()
          await bothHtmlHosts
        } },
      }
      const results = await Promise.all([root, otherRoot].map((buildRoot, index) => build({
        root: buildRoot,
        base,
        configFile: false,
        customLogger: logger,
        plugins: [holdHtml, ...plugins],
        build: { write: false, assetsDir: `static-${index}`, minify: false, cssMinify: false },
      })))
      for (const [index, result] of results.entries()) {
        const assets = (result as { output: Array<{ type: string, fileName: string, source?: string | Uint8Array }> }).output.filter(output => output.type === 'asset')
        const html = String(assets.find(asset => asset.fileName === 'index.html')?.source)
        const firstHref = [...html.matchAll(/<link\b[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)][0]?.[1]
        const firstPath = new URL(firstHref!, 'https://fixture.test/sub/index.html').pathname.slice('/sub/'.length)
        const firstAsset = assets.find(asset => asset.fileName === firstPath)
        expect(firstAsset?.fileName).toMatch(new RegExp(`^static-${index}/vanity-layer-order-[\\w-]+\\.css$`))
        expect(String(firstAsset?.source)).toBe('@layer vendor, app;\n')
      }
      expect(warnings).toEqual([])
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('returns a virtual scan ID for a configured system member', async () => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-scan-shield-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "vite-scan-shield", "type": "module" }')
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#123456' } }).consolidate()
`)
      const importer = await put(root, 'main.ts', 'import { ds } from "./system.ts"\nexport { ds }\n')
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system } })],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })

      const devServer = server as ViteDevServer & {
        environments: Record<string, { pluginContainer: {
          resolveId: (source: string, importer: string, options: { scan: true }) => Promise<string | { id: string } | null>
        } }>
        pluginContainer?: {
          resolveId: (source: string, importer: string, options: { scan: true }) => Promise<string | { id: string } | null>
        }
      }
      const client = devServer.environments.client.pluginContainer
      if (client === undefined)
        throw new Error('the Vite development environment has no plugin container')
      const resolveForScan = client.resolveId as unknown as (
        source: string,
        importer: string,
        options: { scan: true },
      ) => Promise<string | { id: string } | null>
      const result = await resolveForScan.call(client, './system.ts', importer, { scan: true })
      const resolvedId = typeof result === 'string' ? result : result?.id
      expect(resolvedId).toEqual(expect.stringMatching(/^\0vanity:/))
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('names application authoring imports in client/SSR dev and build, while leaving host-owned inputs alone', async () => {
    const { build, createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-app-authoring-')))
    const system = await put(root, 'src/system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#112233' } }).consolidate({ prefix: 'app-authoring-configured' })
`)
    const authoring = await put(root, 'src/authoring.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#445566' } }).consolidate({ prefix: 'app-authoring-unconfigured' })
`)
    await put(root, 'src/entry.ts', `import { ds } from './authoring'
export const brandName = ds.t.color.brand.$name
`)
    await put(root, 'src/card.css.ts', `import { length } from '@mszr/vanity'
import { ds } from './system'
export const card = ds.class({ color: ds.t.color.brand, padding: length.rem(1) })
`)
    await put(root, 'src/raw.css.ts', `import { length } from '@mszr/vanity'
import { style } from '@vanilla-extract/css'
export const raw = style({ color: 'rebeccapurple', padding: length.rem(1).css })
`)
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "vite-app-authoring", "type": "module" }')
      const vanillaExtractPackage = join(vanityRoot, '../node_modules/@vanilla-extract/css')
      await mkdir(join(root, 'node_modules/@vanilla-extract'), { recursive: true })
      await symlink(vanillaExtractPackage, join(root, 'node_modules/@vanilla-extract/css'), 'dir')
      const plugins = vanityPlugin({ compiler: { system } })
      await put(root, 'node_modules/@mszr/vanity/package.json', JSON.stringify({
        name: '@mszr/vanity',
        type: 'module',
        exports: {
          '.': './index.ts',
          './runtime': './runtime.ts',
        },
      }))
      await put(root, 'node_modules/@mszr/vanity/index.ts', `export * from '${join(vanityRoot, 'index.ts')}'\n`)
      await put(root, 'node_modules/@mszr/vanity/runtime.ts', `export * from '${join(vanityRoot, 'runtime.ts')}'\n`)
      const resolve = { alias: {} }
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins,
        resolve,
        optimizeDeps: { noDiscovery: true },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })

      const configuredMember = await server.transformRequest('/src/system.ts')
      const vanityStyle = await server.transformRequest('/src/card.css.ts')
      const rawStyle = await server.transformRequest('/src/raw.css.ts')
      const compatibleServer = server as {
        environments: Record<string, { pluginContainer: {
          resolveId: (source: string, importer: string, options: { scan?: boolean }) => Promise<string | { id: string } | null>
        } }>
        pluginContainer?: {
          resolveId: (source: string, importer: string, options: { scan?: boolean }) => Promise<string | { id: string } | null>
        }
      }
      const client = compatibleServer.environments.client.pluginContainer
      if (client === undefined)
        throw new Error('the Vite development environment has no plugin container')
      const scan = await capture(() => client.resolveId('@mszr/vanity', authoring, { scan: true }))
      const runtimeSubpath = await capture(() => client.resolveId('@mszr/vanity/runtime', authoring, {}))
      const clientDev = await capture(() => server!.transformRequest('/src/authoring.ts'))
      const ssrDev = await capture(() => server!.ssrLoadModule('/src/entry.ts'))

      const buildFailure = await capture(() => build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: vanityPlugin({ compiler: { system } }),
        resolve,
        build: { write: false, minify: false, lib: { entry: join(root, 'src/entry.ts'), formats: ['es'] } },
      }))
      const results = [clientDev.error, ssrDev.error, buildFailure.error].map((error) => {
        const text = errorText(error)
        return {
          code: text.includes('VANITY_AUTHORING_IN_APP_MODULE'),
          importingModule: text.includes('authoring.ts'),
          actionableFix: text.includes('compiler.system') && text.includes('*.css.ts'),
        }
      })

      expect({
        results,
        configuredMemberProjected: configuredMember?.code.includes('vanity:system-runtime:browser:')
          && !configuredMember.code.includes('createSystem'),
        vanityStyleResolved: vanityStyle !== null && vanityStyle !== undefined,
        rawVanillaExtractResolved: rawStyle !== null && rawStyle !== undefined,
        dependencyScanSilent: scan.error === undefined && scan.value !== null,
        runtimeSubpathSilent: runtimeSubpath.error === undefined && runtimeSubpath.value !== null,
      }).toEqual({
        results: [0, 1, 2].map(() => ({ code: true, importingModule: true, actionableFix: true })),
        configuredMemberProjected: true,
        vanityStyleResolved: true,
        rawVanillaExtractResolved: true,
        dependencyScanSilent: true,
        runtimeSubpathSilent: true,
      })
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 120_000)

  it('projects installed system members across client, SSR, and shared build/dev hosts', async () => {
    const { build, createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-member-hosts-')))
    const packageRoot = join(root, 'node_modules/conditional-member-design')
    const browserMember = join(packageRoot, 'browser.ts')
    const serverMember = join(packageRoot, 'server.ts')
    const entry = await put(root, 'src/entry.ts', `import { ds } from 'conditional-member-design'
export const brandName = ds.t.color.brand.$name
console.log(brandName)
`)
    await put(root, 'index.html', '<!doctype html><html><head></head><body><script type="module" src="/src/entry.ts"></script></body></html>')
    let server: ViteDevServer | undefined
    let releaseClientBuild: () => void = () => {}
    let clientBuildPromise: Promise<unknown> | undefined

    try {
      await put(root, 'package.json', JSON.stringify({
        name: 'vite-member-hosts',
        type: 'module',
        dependencies: { 'conditional-member-design': '1.0.0' },
      }))
      await put(packageRoot, 'package.json', JSON.stringify({
        name: 'conditional-member-design',
        type: 'module',
        peerDependencies: { '@mszr/vanity': '*' },
        exports: {
          '.': {
            'node': './server.ts',
            'vanity-dev': './development.ts',
            'browser': './browser.ts',
            'default': './browser.ts',
          },
        },
      }))
      await put(root, 'node_modules/conditional-member-design/browser.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#112233' } }).consolidate({ prefix: 'compat-browser' })
`)
      await put(root, 'node_modules/conditional-member-design/server.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#445566' } }).consolidate({ prefix: 'compat-server' })
`)
      const developmentMember = await put(root, 'node_modules/conditional-member-design/development.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#778899' } }).consolidate({ prefix: 'compat-development' })
`)

      const plugin = vanityPlugin({ compiler: { system: 'conditional-member-design', layerOrder: ['vendor'] } })
      const hostPlugin = plugin.find((candidate) => {
        return typeof candidate === 'object'
          && candidate !== null
          && !Array.isArray(candidate)
          && 'name' in candidate
          && candidate.name === 'vanity-css-ts'
      }) as import('vite').Plugin | undefined
      if (hostPlugin === undefined)
        throw new Error('missing the Vanity host plugin')
      const loadHook = hostPlugin.load as {
        handler: (this: unknown, id: string, ...args: unknown[]) => unknown
      }
      const loadCalls: string[] = []
      const originalLoad = loadHook.handler
      loadHook.handler = function (this: unknown, id: string, ...args: unknown[]) {
        if (id === entry || id.startsWith(packageRoot))
          loadCalls.push(id)
        return originalLoad.call(this, id, ...args)
      }

      let resolveClientFilterReady!: () => void
      let rejectClientFilterReady!: (error: unknown) => void
      const clientFilterReady = new Promise<void>((resolve, reject) => {
        resolveClientFilterReady = resolve
        rejectClientFilterReady = reject
      })
      const clientGate = new Promise<void>((resolve) => {
        releaseClientBuild = resolve
      })
      const filterGate: Plugin = {
        name: 'vanity-vite-compat-client-filter-gate',
        enforce: 'post',
        transformIndexHtml: { order: 'pre', async handler() {
          resolveClientFilterReady()
          await clientGate
        } },
      }
      clientBuildPromise = build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin, filterGate],
        resolve: { alias },
        build: { write: false, minify: false },
      }).catch((error: unknown) => {
        rejectClientFilterReady(error)
        throw error
      })
      await clientFilterReady
      const ssrBuild = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin],
        resolve: { alias },
        build: { write: false, minify: false, ssr: entry, rollupOptions: { input: entry } },
      })
      releaseClientBuild()
      const clientBuild = await clientBuildPromise
      const outputs = (Array.isArray(clientBuild) ? clientBuild : [clientBuild]) as Array<{ output: Array<{ fileName: string, source?: string | Uint8Array }> }>
      const assets = outputs.flatMap(output => output.output)
      const html = String(assets.find(asset => asset.fileName === 'index.html')?.source)
      const layerAsset = assets.find(asset => String(asset.source) === '@layer vendor;\n')
      expect(html).toContain(`href="/${layerAsset!.fileName}"`)
      const clientCode = bundleCode(clientBuild)
      const ssrOutputs = (Array.isArray(ssrBuild) ? ssrBuild : [ssrBuild]) as Array<{ output: Array<{ type: string, source?: string | Uint8Array }> }>
      expect(ssrOutputs.flatMap(output => output.output).filter(output => output.type === 'asset' && String(output.source) === '@layer vendor;\n')).toEqual([])
      const ssrCode = bundleCode(ssrBuild)
      expect({
        browserProjection: clientCode.includes('--compat-browser-color-brand'),
        serverProjection: ssrCode.includes('--compat-server-color-brand'),
        authoringExcluded: !clientCode.includes('createSystem') && !ssrCode.includes('createSystem'),
        onlyMembersReachedLoad: loadCalls.filter(id => id.startsWith(packageRoot)).sort(),
        bothMembersLoaded: loadCalls.includes(browserMember)
          && loadCalls.includes(serverMember),
        entrySkipped: !loadCalls.includes(entry),
      }).toEqual({
        browserProjection: true,
        serverProjection: true,
        authoringExcluded: true,
        onlyMembersReachedLoad: [browserMember, serverMember].sort(),
        bothMembersLoaded: true,
        entrySkipped: true,
      })

      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin],
        resolve: { alias, conditions: ['vanity-dev'] },
        optimizeDeps: { noDiscovery: true },
        server: { port: 0, strictPort: false, hmr: false },
      })
      expect(server.config.optimizeDeps.exclude).toContain('conditional-member-design')
      expect(server.config.ssr.noExternal).toContain('conditional-member-design')

      const base = await devHttpBase(server)
      const entryResponse = await fetch(new URL('src/entry.ts', base))
      expect(entryResponse.status).toBe(200)
      const entryCode = await entryResponse.text()
      const memberImport = importsIn(entryCode).find(specifier => specifier.includes('conditional-member-design'))
      expect(memberImport).toBeDefined()
      expect(memberImport).not.toContain('/.vite/deps/')
      const clientMemberResponse = await fetch(new URL(memberImport!, base))
      expect(clientMemberResponse.status).toBe(200)
      const clientMemberCode = await clientMemberResponse.text()
      expect(clientMemberCode).not.toMatch(/createSystem|addTokens|consolidate/)
      expect(clientMemberCode).toContain('vanity:system-runtime:browser:')
      expect(graphNode(server, developmentMember, false)?.id?.split('?')[0]).toBe(developmentMember)
      const serverExports = await server.ssrLoadModule('/src/entry.ts') as { brandName?: string }
      expect(serverExports.brandName).toContain('compat-server')
      expect(graphNode(server, serverMember, true)?.id?.split('?')[0]).toBe(serverMember)
    }
    finally {
      releaseClientBuild()
      await clientBuildPromise?.catch(() => undefined)
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 120_000)

  it('keeps a cached development filter absent across later servers after builds narrow the plugin hooks', async () => {
    const { build, createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-dev-after-build-')))
    const packageRoot = join(root, 'node_modules/conditional-dev-design')
    const browserMember = join(packageRoot, 'browser.ts')
    const serverMember = join(packageRoot, 'server.ts')
    const developmentMember = join(packageRoot, 'development.ts')
    const entry = await put(root, 'src/entry.ts', `import { ds } from 'conditional-dev-design'
export const brandName = ds.t.color.brand.$name
`)
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', JSON.stringify({
        name: 'vite-dev-after-build',
        type: 'module',
        dependencies: { 'conditional-dev-design': '1.0.0' },
      }))
      await put(packageRoot, 'package.json', JSON.stringify({
        name: 'conditional-dev-design',
        type: 'module',
        peerDependencies: { '@mszr/vanity': '*' },
        exports: {
          '.': {
            'vanity-dev': './development.ts',
            'node': './server.ts',
            'browser': './browser.ts',
            'default': './browser.ts',
          },
        },
      }))
      await writeFile(browserMember, `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#112233' } }).consolidate({ prefix: 'dev-after-build-browser' })
`)
      await writeFile(serverMember, `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#445566' } }).consolidate({ prefix: 'dev-after-build-server' })
`)
      await writeFile(developmentMember, `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#778899' } }).consolidate({ prefix: 'dev-after-build-development' })
`)

      const plugin = vanityPlugin({ compiler: { system: 'conditional-dev-design' } })
      const hostPlugin = plugin.find(candidate => typeof candidate === 'object' && candidate !== null
        && !Array.isArray(candidate) && 'name' in candidate && candidate.name === 'vanity-css-ts') as import('vite').Plugin | undefined
      if (hostPlugin === undefined)
        throw new Error('missing the Vanity host plugin')
      const loadHook = hostPlugin.load as {
        handler: (this: unknown, id: string, ...args: unknown[]) => unknown
      }
      const loadCalls: string[] = []
      const resolveCalls: string[] = []
      const originalLoad = loadHook.handler
      loadHook.handler = function (this: unknown, id: string, ...args: unknown[]) {
        loadCalls.push(id)
        return originalLoad.call(this, id, ...args)
      }
      wrapHook(hostPlugin, 'resolveId', id => resolveCalls.push(id))

      const built = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin],
        resolve: { alias },
        build: { write: false, minify: false, ssr: true, rollupOptions: { input: entry } },
      })
      expect(bundleCode(built)).toContain('--dev-after-build-server-color-brand')

      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin],
        resolve: { alias, conditions: ['vanity-dev'] },
        optimizeDeps: { noDiscovery: true },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })

      const dev = server as ViteDevServer & {
        environments: Record<string, { pluginContainer: {
          load: (id: string) => Promise<string | { code?: string } | null>
          resolveId: (source: string, importer: string, options: { scan: true }) => Promise<{ id: string } | null>
        } }>
        pluginContainer?: {
          load: (id: string) => Promise<string | { code?: string } | null>
          resolveId: (source: string, importer: string, options: { scan: true }) => Promise<{ id: string } | null>
        }
      }
      const client = dev.environments.client.pluginContainer
      if (client === undefined)
        throw new Error('the Vite development environment has no plugin container')
      const projected = await client.load(developmentMember)
      const projectedCode = typeof projected === 'string' ? projected : projected?.code ?? ''
      expect(projectedCode).not.toMatch(/createSystem|addTokens|consolidate/)
      expect(projectedCode).toContain('vanity:system-runtime:browser:')
      expect(loadCalls).toContain(developmentMember)
      const resolveForScan = client.resolveId as unknown as (
        source: string,
        importer: string,
        options: { scan: true },
      ) => Promise<{ id: string } | null>
      const scan = await resolveForScan.call(client, 'conditional-dev-design', entry, { scan: true })
      expect(scan?.id).toMatch(/^\0vanity:system-scan:/)

      // The first dev calls have now compiled both development filters while
      // they were absent. Closing that server and narrowing in a one-shot
      // build must not change the cached copy used by a later server.
      await server.close()
      server = undefined
      const entryCallsBeforeBuild = loadCalls.filter(id => id === entry).length
      const ordinaryResolvesBeforeBuild = resolveCalls.filter(id => id === 'conditional-dev-design').length
      const narrowedBuild = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin],
        resolve: { alias },
        build: { write: false, minify: false, lib: { entry, formats: ['es'] } },
      })
      expect(bundleCode(narrowedBuild)).toContain('--dev-after-build-browser-color-brand')
      expect(loadCalls.filter(id => id === entry)).toHaveLength(entryCallsBeforeBuild)
      expect(resolveCalls.filter(id => id === 'conditional-dev-design')).toHaveLength(ordinaryResolvesBeforeBuild)

      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin],
        resolve: { alias, conditions: ['vanity-dev'] },
        optimizeDeps: { noDiscovery: true },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })
      const secondDev = server as ViteDevServer & {
        environments: Record<string, { pluginContainer: {
          load: (id: string) => Promise<string | { code?: string } | null>
          resolveId: (source: string, importer: string, options: { scan: true }) => Promise<{ id: string } | null>
        } }>
        pluginContainer?: {
          load: (id: string) => Promise<string | { code?: string } | null>
          resolveId: (source: string, importer: string, options: { scan: true }) => Promise<{ id: string } | null>
        }
      }
      const secondClient = secondDev.environments.client.pluginContainer
      if (secondClient === undefined)
        throw new Error('the later Vite development environment has no client plugin container')
      const developmentCallsBeforeSecondServer = loadCalls.filter(id => id === developmentMember).length
      const secondProjection = await secondClient.load(developmentMember)
      const secondProjectionCode = typeof secondProjection === 'string'
        ? secondProjection
        : secondProjection?.code ?? ''
      const resolveScanInLaterServer = secondClient.resolveId as unknown as (
        source: string,
        importer: string,
        options: { scan: true },
      ) => Promise<{ id: string } | null>
      const secondScan = await resolveScanInLaterServer.call(
        secondClient,
        'conditional-dev-design',
        entry,
        { scan: true },
      )
      expect({
        projectedUnseenMember: secondProjectionCode.includes('vanity:system-runtime:browser:')
          && !/createSystem|addTokens|consolidate/.test(secondProjectionCode),
        cachedLoadReachedUnseenMember: loadCalls.filter(id => id === developmentMember).length
          === developmentCallsBeforeSecondServer + 1,
        cachedResolveReachedScan: secondScan?.id.startsWith('\0vanity:system-scan:') ?? false,
      }).toEqual({
        projectedUnseenMember: true,
        cachedLoadReachedUnseenMember: true,
        cachedResolveReachedScan: true,
      })
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 120_000)

  it('holds filters across the first serve config only on hosts with a development filter cache', async () => {
    const { build, createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-dev-filter-cache-window-')))
    const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#123456' } }).consolidate({ prefix: 'filter-cache-window' })
`)
    const entry = await put(root, 'entry.ts', `import { ds } from './system.ts'
import './plain.ts'
export const brandName = ds.t.color.brand.$name
`)
    await put(root, 'plain.ts', 'export const plain = true\n')
    let server: ViteDevServer | undefined
    let serverPromise: Promise<ViteDevServer> | undefined
    let releaseConfig!: () => void
    let signalConfigGate!: () => void
    const configGate = new Promise<void>((resolve) => {
      releaseConfig = resolve
    })
    const configPaused = new Promise<void>((resolve) => {
      signalConfigGate = resolve
    })

    try {
      await put(root, 'package.json', '{ "name": "vite-dev-filter-cache-window", "type": "module" }')
      const plugin = vanityPlugin({ compiler: { system } })
      const hostPlugin = plugin.find(candidate => typeof candidate === 'object' && candidate !== null
        && !Array.isArray(candidate) && 'name' in candidate && candidate.name === 'vanity-css-ts') as import('vite').Plugin | undefined
      if (hostPlugin === undefined)
        throw new Error('missing the Vanity host plugin')
      const entryLoadCalls: string[] = []
      const plainResolveCalls: string[] = []
      wrapHook(hostPlugin, 'load', (id) => {
        if (id === entry)
          entryLoadCalls.push(id)
      })
      wrapHook(hostPlugin, 'resolveId', (source) => {
        if (source === './plain.ts')
          plainResolveCalls.push(source)
      })

      serverPromise = createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
          ...plugin,
          {
            name: 'vanity-vite-dev-filter-cache-window-gate',
            enforce: 'post',
            async config() {
              signalConfigGate()
              await configGate
            },
          },
        ],
        resolve: { alias },
        optimizeDeps: { noDiscovery: true },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })
      await configPaused

      const result = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin],
        resolve: { alias },
        build: { write: false, minify: false, lib: { entry, formats: ['es'] } },
      })
      const code = bundleCode(result)
      expect({
        projection: code.includes('--filter-cache-window-color-brand'),
        theBuildSawUnservedEntry: entryLoadCalls.includes(entry),
        theBuildSawOrdinaryImport: plainResolveCalls.includes('./plain.ts'),
      }).toEqual({
        projection: true,
        theBuildSawUnservedEntry: true,
        theBuildSawOrdinaryImport: true,
      })
    }
    finally {
      releaseConfig()
      server = await serverPromise?.catch(() => undefined)
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 120_000)

  it('releases each development filter hold only after that hook has its first dev call', async () => {
    const { build, createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-filter-first-call-')))
    const packageRoot = join(root, 'node_modules/conditional-first-call-design')
    const browserMember = await put(packageRoot, 'browser.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#112233' } }).consolidate({ prefix: 'first-call-browser' })
`)
    await put(packageRoot, 'server.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#445566' } }).consolidate({ prefix: 'first-call-server' })
`)
    const entry = await put(root, 'entry.ts', `import { ds } from 'conditional-first-call-design'
import './plain.ts'
export const brandName = ds.t.color.brand.$name
`)
    let server: ViteDevServer | undefined
    let serverPromise: Promise<ViteDevServer> | undefined
    let releaseConfigResolved!: () => void
    let signalConfigResolved!: () => void
    const configResolvedGate = new Promise<void>((resolve) => {
      releaseConfigResolved = resolve
    })
    const configResolvedPaused = new Promise<void>((resolve) => {
      signalConfigResolved = resolve
    })

    try {
      await put(root, 'plain.ts', 'export const plain = true\n')
      await put(root, 'package.json', JSON.stringify({
        name: 'vanity-vite-filter-first-call',
        type: 'module',
        dependencies: { 'conditional-first-call-design': '1.0.0' },
      }))
      await put(packageRoot, 'package.json', JSON.stringify({
        name: 'conditional-first-call-design',
        type: 'module',
        peerDependencies: { '@mszr/vanity': '*' },
        exports: { '.': { node: './server.ts', browser: './browser.ts', default: './browser.ts' } },
      }))
      const plugin = vanityPlugin({ compiler: { system: 'conditional-first-call-design' } })
      const hostPlugin = plugin.find(candidate => typeof candidate === 'object' && candidate !== null
        && !Array.isArray(candidate) && 'name' in candidate && candidate.name === 'vanity-css-ts') as Plugin | undefined
      if (hostPlugin === undefined)
        throw new Error('missing the Vanity Vite plugin')
      const unservedEntryLoads: string[] = []
      const ordinaryResolves: string[] = []
      wrapHook(hostPlugin, 'load', (id) => {
        if (id === entry)
          unservedEntryLoads.push(id)
      })
      wrapHook(hostPlugin, 'resolveId', (source) => {
        if (source === './plain.ts')
          ordinaryResolves.push(source)
      })

      serverPromise = createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
          ...plugin,
          {
            name: 'vanity-vite-filter-first-call-gate',
            enforce: 'post',
            async configResolved() {
              signalConfigResolved()
              await configResolvedGate
            },
          },
        ],
        resolve: { alias },
        optimizeDeps: { noDiscovery: true },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })
      await configResolvedPaused

      let serverCode = ''
      let buildWasUnfiltered = false
      const serverBuild = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin],
        resolve: { alias },
        build: { write: false, minify: false, ssr: true, rollupOptions: { input: entry } },
      })
      serverCode = bundleCode(serverBuild)
      buildWasUnfiltered = unservedEntryLoads.includes(entry)
        && ordinaryResolves.includes('./plain.ts')

      // If a build hook releases the hold before a dev hook runs, this
      // second build narrows the plugin object before the dev cache exists.
      const secondServerBuild = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin],
        resolve: { alias },
        build: { write: false, minify: false, ssr: true, rollupOptions: { input: entry } },
      })
      expect(bundleCode(secondServerBuild)).toContain('--first-call-server-color-brand')

      releaseConfigResolved()
      server = await serverPromise
      const client = (server as ViteDevServer & {
        environments: Record<string, { pluginContainer: {
          load: (id: string) => Promise<string | { code?: string } | null>
          resolveId: (source: string, importer?: string, options?: object) => Promise<{ id: string } | null>
        } }>
      }).environments.client.pluginContainer
      if (client === undefined)
        throw new Error('the Vite development server has no client plugin container')

      const projected = await client.load(browserMember)
      const projectedCode = typeof projected === 'string' ? projected : projected?.code ?? ''
      const resolveForScan = client.resolveId as unknown as (
        source: string,
        importer: string,
        options: { scan: true },
      ) => Promise<{ id: string } | null>
      const scan = await resolveForScan.call(client, 'conditional-first-call-design', entry, { scan: true })
      expect({
        serverProjection: serverCode.includes('--first-call-server-color-brand'),
        clientProjection: !/createSystem|addTokens|consolidate/.test(projectedCode)
          && projectedCode.includes('vanity:system-runtime:browser:'),
        scanShield: scan?.id.startsWith('\0vanity:system-scan:') ?? false,
        buildDuringWindowStayedUnfiltered: buildWasUnfiltered === true,
      }).toEqual({
        serverProjection: true,
        clientProjection: true,
        scanShield: true,
        buildDuringWindowStayedUnfiltered: true,
      })

      const entryCallsBeforeNarrowBuild = unservedEntryLoads.length
      const ordinaryResolvesBeforeNarrowBuild = ordinaryResolves.length
      const narrowedBuild = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [plugin],
        resolve: { alias },
        build: { write: false, minify: false, lib: { entry, formats: ['es'] } },
      })
      expect({
        clientProjectionAfterFirstCalls: bundleCode(narrowedBuild).includes('--first-call-browser-color-brand'),
        skippedUnservedEntry: unservedEntryLoads.length === entryCallsBeforeNarrowBuild,
        skippedOrdinaryResolve: ordinaryResolves.length === ordinaryResolvesBeforeNarrowBuild,
      }).toEqual({
        clientProjectionAfterFirstCalls: true,
        skippedUnservedEntry: true,
        skippedOrdinaryResolve: true,
      })
    }
    finally {
      releaseConfigResolved()
      server = await serverPromise?.catch(() => undefined)
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 120_000)

  it('holds both late filters for the watch lifetime, then narrows the next one-shot build', async () => {
    const { build } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-watch-filter-hold-')))
    const packageRoot = join(root, 'node_modules/watch-filter-design')
    const entry = join(root, 'entry.ts')
    const memberLoadResults: string[] = []
    let watcher: {
      close: () => Promise<void>
      on: (event: 'event', listener: (event: { code: string, error?: unknown, result?: { close: () => Promise<void> } }) => void) => void
    } | undefined

    try {
      await put(root, 'package.json', JSON.stringify({
        name: 'vanity-vite-watch-filter-hold',
        type: 'module',
        dependencies: { 'watch-filter-design': '1.0.0' },
      }))
      await put(packageRoot, 'package.json', JSON.stringify({
        name: 'watch-filter-design',
        type: 'module',
        peerDependencies: { '@mszr/vanity': '*' },
        exports: { '.': { node: './server.ts', browser: './browser.ts', default: './browser.ts' } },
      }))
      const browserFile = await put(packageRoot, 'browser.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#123456' } }).consolidate({ prefix: 'watch-filter-client' })
`)
      await put(packageRoot, 'server.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#123456' } }).consolidate({ prefix: 'watch-filter-server' })
`)
      await put(root, 'plain.ts', 'export const plain = "before"\n')
      await put(root, 'entry.ts', `import { ds } from 'watch-filter-design'
import { plain } from './plain.ts'
export const result = [ds.t.color.brand.$name, plain]
console.log(result)
`)

      await put(root, 'index.html', '<!doctype html><html><head></head><body><script type="module" src="/entry.ts"></script></body></html>')
      const sharedPlugin = vanityPlugin({ compiler: { system: 'watch-filter-design', layerOrder: ['vendor'] } })
      const hostPlugin = sharedPlugin.find(candidate => typeof candidate === 'object' && candidate !== null
        && !Array.isArray(candidate) && 'name' in candidate && candidate.name === 'vanity-css-ts') as Plugin | undefined
      if (hostPlugin === undefined)
        throw new Error('missing the Vanity host plugin')
      const loadHook = hostPlugin.load as {
        handler: (this: unknown, id: string, ...args: unknown[]) => unknown
      }
      const resolveHook = hostPlugin.resolveId as {
        handler: (this: unknown, source: string, importer?: string, options?: unknown) => unknown
      }
      const unservedEntryCalls: string[] = []
      const unservedPackageResolveCalls: string[] = []
      const originalLoad = loadHook.handler
      const originalResolve = resolveHook.handler
      loadHook.handler = async function (this: unknown, id: string, ...args: unknown[]) {
        if (id === entry)
          unservedEntryCalls.push(id)
        const result = await originalLoad.call(this, id, ...args)
        if (id === browserFile) {
          const code = typeof result === 'string'
            ? result
            : typeof result === 'object' && result !== null && 'code' in result && typeof result.code === 'string'
              ? result.code
              : ''
          memberLoadResults.push(code)
        }
        return result
      }
      resolveHook.handler = function (this: unknown, source: string, importer?: string, options?: unknown) {
        if (source === 'watch-filter-design' && (options as { scan?: boolean } | undefined)?.scan !== true)
          unservedPackageResolveCalls.push(source)
        return originalResolve.call(this, source, importer, options)
      }

      let completedBuilds = 0
      const buildWaiters = new Map<number, { resolve: () => void, reject: (error: unknown) => void }>()

      const watcherResult = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [sharedPlugin],
        resolve: { alias },
        build: {
          watch: { clearScreen: false },
          lib: { entry, formats: ['es'], fileName: 'entry' },
        },
      })
      watcher = watcherResult as unknown as typeof watcher
      if (watcher === undefined)
        throw new Error('Vite did not return the configured watch host')

      watcher.on('event', async (event) => {
        if (event.code === 'BUNDLE_END')
          await event.result!.close()
        if (event.code === 'END') {
          completedBuilds++
          for (const [target, waiter] of buildWaiters) {
            if (completedBuilds >= target) {
              waiter.resolve()
              buildWaiters.delete(target)
            }
          }
        }
        if (event.code === 'ERROR') {
          const failure = event.error ?? new Error('the Vite watch build failed')
          for (const waiter of buildWaiters.values())
            waiter.reject(failure)
          buildWaiters.clear()
        }
      })
      const waitForBuild = (target: number): Promise<void> => {
        if (completedBuilds >= target)
          return Promise.resolve()
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            buildWaiters.delete(target)
            reject(new Error(`Vite watch did not complete build ${target}`))
          }, 15_000)
          buildWaiters.set(target, {
            resolve: () => {
              clearTimeout(timeout)
              resolve()
            },
            reject: (error) => {
              clearTimeout(timeout)
              reject(error)
            },
          })
        })
      }

      await waitForBuild(1)
      expect(unservedEntryCalls.length).toBeGreaterThan(0)
      expect(unservedPackageResolveCalls.length).toBeGreaterThan(0)
      expect(memberLoadResults[0]).toContain('vanity:system-runtime:')

      const entryCallsBeforeConcurrentBuild = unservedEntryCalls.length
      const resolveCallsBeforeConcurrentBuild = unservedPackageResolveCalls.length
      const whileWatching = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [sharedPlugin],
        resolve: { alias },
        build: {
          write: false,
          minify: false,
          ssr: true,
          rollupOptions: { input: entry },
        },
      })
      expect(bundleCode(whileWatching)).toContain('--watch-filter-server-color-brand')
      expect(unservedEntryCalls.length).toBeGreaterThan(entryCallsBeforeConcurrentBuild)
      expect(unservedPackageResolveCalls.length).toBeGreaterThan(resolveCallsBeforeConcurrentBuild)

      await put(root, 'plain.ts', 'export const plain = "after"\n')
      await waitForBuild(2)
      expect(await readFile(join(root, 'dist/entry.js'), 'utf8')).toContain('after')
      await watcher.close()
      watcher = undefined
      const entryCallsAfterWatch = unservedEntryCalls.length
      const resolveCallsAfterWatch = unservedPackageResolveCalls.length
      const afterWatching = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [sharedPlugin],
        resolve: { alias },
        build: {
          write: false,
          minify: false,
          ssr: true,
          rollupOptions: { input: entry },
        },
      })
      expect({
        projection: bundleCode(afterWatching).includes('--watch-filter-server-color-brand'),
        unservedEntrySkipped: unservedEntryCalls.length === entryCallsAfterWatch,
        unservedResolveSkipped: unservedPackageResolveCalls.length === resolveCallsAfterWatch,
      }).toEqual({
        projection: true,
        unservedEntrySkipped: true,
        unservedResolveSkipped: true,
      })
      const htmlBuild = await build({ root, configFile: false, logLevel: 'silent', plugins: [sharedPlugin], resolve: { alias }, build: { write: false, minify: false } })
      const outputs = (Array.isArray(htmlBuild) ? htmlBuild : [htmlBuild]) as Array<{ output: Array<{ fileName: string, source?: string | Uint8Array }> }>
      const html = outputs.flatMap(output => output.output).find(output => output.fileName === 'index.html')
      expect(String(html?.source)).toMatch(/href="\/assets\/vanity-layer-order-[^"]+\.css"/)
    }
    finally {
      await watcher?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 120_000)

  it('skips every non-serving handler on a generated app graph and an installed dependency', async () => {
    const { build } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-zero-handler-')))
    const plainFiles = new Set<string>()
    const dependencyFiles = new Set<string>()

    try {
      await put(root, 'package.json', JSON.stringify({
        name: 'vanity-vite-zero-handler',
        type: 'module',
        dependencies: { 'plain-installed-dependency': '1.0.0' },
      }))
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem().addTokens({ color: { brand: '#635bff' } }).consolidate({ prefix: 'zero-handler' })
`)
      const style = await put(root, 'card.css.ts', `import { ds } from './system.ts'
export const card = ds.class({ color: ds.t.color.brand, padding: '8px' })
`)
      await put(root, 'auto.ts', 'export const appOnly = () => "app-only"\n')
      for (let index = 0; index < 24; index++) {
        const next = index + 1 < 24
          ? `import { value as next } from './module-${String(index + 1).padStart(2, '0')}.ts'\n`
          : ''
        const file = await put(root, `plain/module-${String(index).padStart(2, '0')}.ts`, `${next}export const value = ${index}${next ? ' + next' : ''}\n`)
        plainFiles.add(file)
      }
      const dependencyRoot = join(root, 'node_modules/plain-installed-dependency')
      await put(dependencyRoot, 'package.json', JSON.stringify({
        name: 'plain-installed-dependency',
        type: 'module',
        exports: './index.js',
      }))
      for (let index = 0; index < 8; index++) {
        const next = index + 1 < 8
          ? `import { value as next } from './module-${String(index + 1).padStart(2, '0')}.js'\n`
          : ''
        const file = await put(dependencyRoot, `module-${String(index).padStart(2, '0')}.js`, `${next}export const value = ${index}${next ? ' + next' : ''}\n`)
        dependencyFiles.add(file)
      }
      await put(dependencyRoot, 'index.js', 'export { value } from "./module-00.js"\n')
      const entry = await put(root, 'entry.ts', `import { ds } from './system.ts'
import { card } from './card.css.ts'
import { value as appValue } from './plain/module-00.ts'
import { value as dependencyValue } from 'plain-installed-dependency'
export const result = [ds.t.color.brand.$name, card, appValue, dependencyValue, appOnly()]
`)

      const plugins = vanityPlugin({
        autoImports: { app: './auto.ts' },
        compiler: { system },
      })
      const pluginNamed = (name: string): Plugin | undefined => plugins.find(candidate =>
        typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
        && 'name' in candidate && candidate.name === name) as Plugin | undefined
      const host = pluginNamed('vanity-css-ts')
      const cssInstallation = pluginNamed('vanity:css-installation')
      const substrate = pluginNamed('vite-plugin-vanilla-extract')
      const autoImport = pluginNamed('vanity:app-auto-imports')
      if (host === undefined || cssInstallation === undefined || substrate === undefined || autoImport === undefined)
        throw new Error('the Vite host, CSS installation, vanilla-extract, and application auto-import plugins are required')

      const hostLoadIds: string[] = []
      const hostResolveCalls: Array<{ readonly source: string, readonly importer?: string }> = []
      const hostTransformIds: string[] = []
      const cssInstallationIds: string[] = []
      const vanityRuntimeAddressInputs: string[] = []
      const substrateCalls: Record<'load' | 'resolveId' | 'transform', string[]> = {
        load: [],
        resolveId: [],
        transform: [],
      }
      const autoImportIds: string[] = []
      const recordVanityRuntimeAddress = (id: string): void => {
        const [withoutQuery] = id.split(/[?#]/, 1)
        if (withoutQuery?.startsWith('vanity:') || withoutQuery?.startsWith('\0vanity:'))
          vanityRuntimeAddressInputs.push(withoutQuery)
      }
      wrapHook(host, 'load', (id) => {
        hostLoadIds.push(id)
        recordVanityRuntimeAddress(id)
      })
      wrapHook(host, 'resolveId', (source, args) => {
        recordVanityRuntimeAddress(source)
        hostResolveCalls.push({
          source,
          ...(typeof args[1] === 'string' ? { importer: args[1] } : {}),
        })
      })
      wrapHook(host, 'transform', id => hostTransformIds.push(id))
      wrapHook(cssInstallation, 'transform', id => cssInstallationIds.push(id))
      for (const hookName of ['load', 'resolveId', 'transform'] as const)
        wrapHook(substrate, hookName, id => substrateCalls[hookName].push(id))
      wrapHook(autoImport, 'transform', id => autoImportIds.push(id))

      const result = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins,
        resolve: { alias },
        build: { write: false, minify: false, lib: { entry, formats: ['es'] } },
      })
      const code = bundleCode(result)
      const outputs = (Array.isArray(result) ? result : [result]) as Array<{
        output: Array<{ type: string, source?: string | Uint8Array }>
      }>
      const css = outputs.flatMap(output => output.output)
        .filter(asset => asset.type === 'asset' && typeof asset.source !== 'undefined')
        .map(asset => String(asset.source))
        .join('\n')
      const normalizeId = (id: string): string => id.replace(/[?#].*$/, '')
      const isGeneratedPlain = (id: string): boolean => plainFiles.has(normalizeId(id))
      const isInstalledDependency = (id: string): boolean => dependencyFiles.has(normalizeId(id))
      const plainResolveReachedHost = hostResolveCalls.some(({ source, importer }) =>
        source === 'plain-installed-dependency'
        || (importer !== undefined && (isGeneratedPlain(importer) || isInstalledDependency(importer))))
      const plainResolveReachedSubstrate = substrateCalls.resolveId.some(source =>
        source === 'plain-installed-dependency' || /(?:^|\/)module-\d+\.(?:js|ts)$/.test(source))
      const nonServingHandlerCalls = [
        ...hostLoadIds.filter(id => isGeneratedPlain(id) || isInstalledDependency(id)),
        ...hostTransformIds.filter(id => isGeneratedPlain(id) || isInstalledDependency(id)),
        ...cssInstallationIds.filter(id => isGeneratedPlain(id) || isInstalledDependency(id)),
        ...substrateCalls.load.filter(id => isGeneratedPlain(id) || isInstalledDependency(id)),
        ...substrateCalls.transform.filter(id => isGeneratedPlain(id) || isInstalledDependency(id)),
        ...autoImportIds.filter(id => isInstalledDependency(id) || normalizeId(id) === style),
      ]

      expect({
        projectedSystem: code.includes('--zero-handler-color-brand') && !code.includes('createSystem'),
        styleCss: css.includes('--zero-handler-color-brand: #635bff')
          && css.includes('color: var(--zero-handler-color-brand)'),
        autoImportServesApp: autoImportIds.includes(entry) && code.includes('app-only'),
        autoImportSkipsStyleAndDependency: !autoImportIds.some(id =>
          isInstalledDependency(id) || normalizeId(id) === style),
        hostResolverSkipsUnservedModules: !plainResolveReachedHost,
        substrateResolverSkipsUnservedModules: !plainResolveReachedSubstrate,
        resolvedVirtualIdsUseNullPrefix: vanityRuntimeAddressInputs.length > 0
          && vanityRuntimeAddressInputs.every(id => id.startsWith('\0vanity:')),
        nonServingHandlerCalls,
      }).toEqual({
        projectedSystem: true,
        styleCss: true,
        autoImportServesApp: true,
        autoImportSkipsStyleAndDependency: true,
        hostResolverSkipsUnservedModules: true,
        substrateResolverSkipsUnservedModules: true,
        resolvedVirtualIdsUseNullPrefix: true,
        nonServingHandlerCalls: [],
      })
    }
    finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 120_000)

  it.each([false, true])('retires a deleted style and recovers its importers without restarting (imported=%s)', async (imported) => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-retirement-')))
    let server: ViteDevServer | undefined
    try {
      await put(root, 'package.json', '{"name":"retirement-contract","type":"module"}')
      const system = await put(root, 'system.ts', `import {createSystem} from '@mszr/vanity';export const ds=createSystem().consolidate()`)
      const helper = await put(root, 'helper.ts', 'export const padding=4')
      const source = `import {ds} from './system';import {padding} from './helper';export const row=ds.class({padding})`
      const style = await put(root, 'row.css.ts', source)
      await put(root, 'entry.ts', `import {row} from './row.css.ts';console.log(row)`)
      server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system } })], optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } })
      const first = await server.transformRequest('/row.css.ts')
      const cssUrl = first!.code.match(/import ["']([^"']+\/virtual\/style\/[^"']+)["']/)?.[1]
      expect(cssUrl).toBeDefined()
      await server.transformRequest(cssUrl!)
      const cssId = resolveViteVirtualId(cssUrl!, root)!
      if (imported)
        await server.transformRequest('/entry.ts')
      await unlink(style)
      await Promise.all(Object.values(server.environments).map(environment => environment.pluginContainer.watchChange(style, { event: 'delete' })))
      expect(server.moduleGraph.getModulesByFile(cssId)?.size ?? 0).toBe(0)
      expect(server.moduleGraph.getModulesByFile(style)?.size ?? 0).toBe(0)
      await writeFile(helper, 'export const padding=8')
      await expect(invokeVanityHotUpdate(server, helper)).resolves.not.toThrow()
      if (imported) {
        const missing = await capture(() => server!.transformRequest('/entry.ts'))
        expect(errorText(missing.error)).toContain('Failed to resolve import "./row.css.ts"')
        expect(missing.error).toMatchObject({ plugin: 'vite:import-analysis', id: join(root, 'entry.ts') })
      }
      await writeFile(style, source)
      await Promise.all(Object.values(server.environments).map(environment => environment.pluginContainer.watchChange(style, { event: 'create' })))
      expect((await server.transformRequest('/row.css.ts'))?.code).toContain('export var row')
      if (imported)
        await expect(server.transformRequest('/entry.ts')).resolves.toBeTruthy()
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('retires deleted styles from the manifest when a watch rebuild removes their last consumer', async () => {
    const { build } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-retirement-watch-')))
    let watcher: { on: (event: string, listener: (event: any) => void) => void, close: () => Promise<void> } | undefined
    let nextBuild: (() => void) | undefined
    let buildError: unknown
    try {
      await put(root, 'package.json', '{"name":"retirement-watch-contract","type":"module"}')
      const system = await put(root, 'system.ts', `import {createSystem} from '@mszr/vanity';export const ds=createSystem().consolidate()`)
      const style = await put(root, 'row.css.ts', `import {ds} from './system';export const row=ds.class({padding:4})`)
      const entry = await put(root, 'entry.ts', `import {row} from './row.css.ts';console.log(row)`)
      watcher = await build({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system } })], build: { write: false, watch: {}, lib: { entry, formats: ['es'] } } }) as unknown as typeof watcher
      watcher!.on('event', async (event) => {
        if (event.code === 'BUNDLE_END')
          await event.result.close()
        if (event.code === 'ERROR')
          buildError = event.error
        if (event.code === 'END' || event.code === 'ERROR') {
          const finish = nextBuild
          nextBuild = undefined
          finish?.()
        }
      })
      const wait = () => new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('watch retirement did not finish')), 15000)
        nextBuild = () => {
          clearTimeout(timeout)
          resolve()
        }
      })
      await wait()
      const initial = JSON.parse(await readFile(join(root, '.vanity/manifest.json'), 'utf8'))
      expect(initial.modules).toHaveProperty('row.css.ts')
      const removed = wait()
      await writeFile(entry, 'console.log("removed")')
      await unlink(style)
      await removed
      expect(buildError).toBeUndefined()
      const manifest = JSON.parse(await readFile(join(root, '.vanity/manifest.json'), 'utf8'))
      expect(Object.keys(manifest.modules)).not.toContain('row.css.ts')
    }
    finally {
      await watcher?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it.each(['create', 'update'] as const)('restores substrate CSS when the host reports the restored source as %s', async (event) => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-substrate-restore-event-')))
    let server: ViteDevServer | undefined
    try {
      await put(root, 'package.json', '{"name":"substrate-restore-event","type":"module"}')
      const system = await put(root, 'system.ts', `import {createSystem} from '@mszr/vanity';export const ds=createSystem().consolidate()`)
      await mkdir(join(root, 'node_modules/@vanilla-extract'), { recursive: true })
      await symlink(join(vanityRoot, '../node_modules/@vanilla-extract/css'), join(root, 'node_modules/@vanilla-extract/css'), 'dir')
      const source = `import {style} from '@vanilla-extract/css';export const row=style({padding:4})`
      const style = await put(root, 'row.css.ts', source)
      server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system } })], optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } })
      const first = await server.transformRequest('/row.css.ts')
      const cssUrl = first!.code.match(/import\s+["']([^"']+\.vanilla\.css(?:\?[^"']*)?)["']/)?.[1]
      expect(cssUrl).toBeDefined()
      expect((await server.transformRequest(cssUrl!))?.code).toContain('padding: 4px')
      await unlink(style)
      await Promise.all(Object.values(server.environments).map(environment => environment.pluginContainer.watchChange(style, { event: 'delete' })))
      await writeFile(style, source.replace('padding:4', 'padding:8'))
      await Promise.all(Object.values(server.environments).map(environment => environment.pluginContainer.watchChange(style, { event })))
      const restored = await server.transformRequest('/row.css.ts')
      expect(restored?.code).toContain(cssUrl)
      expect((await server.transformRequest(cssUrl!))?.code).toContain('padding: 8px')
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  })

  it('retires and restores substrate styles with current CSS through one watch build without substrate filesystem events', async () => {
    const { build } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-substrate-retirement-watch-')))
    let watcher: { on: (event: string, listener: (event: any) => void) => void, close: () => Promise<void> } | undefined
    let finish: (() => void) | undefined
    let error: unknown
    let css = ''
    const next = () => new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('substrate watch rebuild did not finish')), 15000)
      finish = () => {
        clearTimeout(timeout)
        resolve()
      }
    })
    try {
      await put(root, 'package.json', '{"name":"substrate-retirement-watch-contract","type":"module"}')
      const system = await put(root, 'system.ts', `import {createSystem} from '@mszr/vanity';export const ds=createSystem().consolidate()`)
      await mkdir(join(root, 'node_modules/@vanilla-extract'), { recursive: true })
      await symlink(join(vanityRoot, '../node_modules/@vanilla-extract/css'), join(root, 'node_modules/@vanilla-extract/css'), 'dir')
      const authored = `import {style} from '@vanilla-extract/css';export const row=style({padding:4})`
      const style = await put(root, 'row.css.ts', authored)
      const entry = await put(root, 'entry.ts', `import {row} from './row.css.ts';console.log(row)`)
      watcher = await build({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system } }), {
        name: 'substrate-retirement-output',
        generateBundle(_options, bundle) {
          css = Object.values(bundle).filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.type === 'asset' ? item.source : '').join('\n')
        },
      }], server: { watch: null, hmr: false, ws: false }, build: { write: false, minify: false, watch: {}, rollupOptions: { input: entry } } }) as unknown as typeof watcher
      watcher!.on('event', async (event) => {
        if (event.code === 'START')
          error = undefined
        if (event.code === 'BUNDLE_END')
          await event.result.close()
        if (event.code === 'ERROR')
          error = event.error
        if (event.code === 'END') {
          const done = finish
          finish = undefined
          done?.()
        }
      })
      await next()
      expect(error).toBeUndefined()
      expect(css).toMatch(/padding: 4px/)
      let rebuilt = next()
      await writeFile(style, authored.replace('padding:4', 'padding:6'))
      await rebuilt
      expect(error).toBeUndefined()
      expect(css).toMatch(/padding: 6px/)
      rebuilt = next()
      await writeFile(entry, 'console.log("removed")')
      await unlink(style)
      await rebuilt
      expect(error).toBeUndefined()
      expect(css).not.toMatch(/padding:/)
      const renamed = join(root, 'renamed.css.ts')
      rebuilt = next()
      await writeFile(renamed, authored)
      await writeFile(entry, `import {row} from './renamed.css.ts';console.log(row)`)
      await rebuilt
      expect(error).toBeUndefined()
      expect(css).toMatch(/padding: 4px/)
      rebuilt = next()
      await unlink(renamed)
      await rebuilt
      expect(String(error)).toMatch(/renamed\.css\.ts/)
      rebuilt = next()
      await writeFile(renamed, authored.replace('padding:4', 'padding:8'))
      await rebuilt
      expect(error).toBeUndefined()
      expect(css).toMatch(/padding: 8px/)
    }
    finally {
      await watcher?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('discards CSS from a style capture that finishes after the source is deleted', async () => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-retirement-flight-')))
    const started = createPromiseGate()
    const held = createPromiseGate()
    let server: ViteDevServer | undefined
    let pending: Promise<unknown> | undefined
    try {
      await put(root, 'package.json', '{"name":"retirement-flight-contract","type":"module"}')
      const system = await put(root, 'system.ts', `import {createSystem} from '@mszr/vanity';export const ds=createSystem().consolidate()`)
      const style = await put(root, 'pending.css.ts', `import {ds} from './system';import {padding} from 'retirement-held';export const row=ds.class({padding})`)
      server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system } }), {
        name: 'retirement-held',
        resolveId(id) {
          if (id === 'retirement-held')
            return '\0retirement-held'
        },
        async load(id) {
          if (id !== '\0retirement-held')
            return
          started.resolve()
          await held.promise
          return 'export const padding=12'
        },
      }], optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } })
      pending = capture(() => server!.transformRequest('/pending.css.ts'))
      await started.promise
      await unlink(style)
      await Promise.all(Object.values(server.environments).map(environment => environment.pluginContainer.watchChange(style, { event: 'delete' })))
      held.resolve()
      const result = await pending as { value?: { code: string }, error?: unknown }
      expect(result.value?.code ?? '').not.toContain('.vanity.css')
      await vi.waitFor(async () => {
        const manifest = JSON.parse(await readFile(join(root, '.vanity/manifest.json'), 'utf8'))
        expect(Object.keys(manifest.modules)).not.toContain('pending.css.ts')
      })
      expect([...server.moduleGraph.idToModuleMap.keys()].filter(id => id.includes('pending.css.ts.vanity.css'))).toEqual([])
    }
    finally {
      held.resolve()
      await pending?.catch(() => {})
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('retires an old system identity from the actual client and SSR graphs', async () => {
    const { createServer } = await loadViteRuntime()
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-vite-graph-')))
    let server: ViteDevServer | undefined

    try {
      await put(root, 'package.json', '{ "name": "vite-graph-compat", "type": "module" }')
      const system = await put(root, 'system.ts', `import { createSystem } from '@mszr/vanity'
export const ds = createSystem()
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'graph-compat' })
`)
      await put(root, 'style.css.ts', `import { ds } from './system'
export const card = ds.class({ color: ds.t.color.brand })
`)

      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [vanityPlugin({ compiler: { system } })],
        resolve: { alias },
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      })

      const first = await server.transformRequest('/style.css.ts')
      const firstSystemUrl = first?.code.match(/import ['"]([^'"]+\.vanity\.css)['"]/)?.[1]
      if (firstSystemUrl === undefined)
        throw new Error('expected a semantic system CSS import')
      expect((await server.transformRequest(firstSystemUrl))?.code).toContain('#123456')
      await server.transformRequest(firstSystemUrl, { ssr: true })

      const firstVirtualId = resolveViteVirtualId(firstSystemUrl, root)
      expect(firstVirtualId).toBeDefined()
      const graphs = graphEnvironments(server)
      expect(graphs.map(({ name, moduleGraph }) => ({
        name,
        loaded: (moduleGraph.getModulesByFile(firstVirtualId!)?.size ?? 0) > 0,
      }))).toEqual(graphs.map(({ name }) => ({ name, loaded: true })))

      await writeFile(system, (await readFile(system, 'utf8')).replace('#123456', '#445566'))
      const plugin = server.config.plugins.find(entry => entry.name === 'vanity-css-ts')
      if (plugin === undefined)
        throw new Error('missing Vanity Vite plugin')
      const modules = [...server.moduleGraph.getModulesByFile(system) ?? []]
      const compatibilityGraph = server.moduleGraph as typeof server.moduleGraph & {
        onFileChange?: (file: string) => void
      }
      compatibilityGraph.onFileChange?.(system)
      for (const { moduleGraph } of graphs) {
        const graph = moduleGraph as typeof moduleGraph & { onFileChange?: (file: string) => void }
        graph.onFileChange?.(system)
      }
      const hook = typeof plugin.handleHotUpdate === 'object'
        ? plugin.handleHotUpdate.handler
        : plugin.handleHotUpdate
      await (hook as (context: object) => Promise<unknown>)({
        file: system,
        server,
        modules,
        timestamp: Date.now(),
        read: () => readFile(system, 'utf8'),
      })

      expect(graphs.map(({ name, moduleGraph }) => ({
        name,
        retired: moduleGraph.getModulesByFile(firstVirtualId!)?.size ?? 0,
      }))).toEqual(graphs.map(({ name }) => ({ name, retired: 0 })))

      const next = await server.transformRequest('/style.css.ts')
      const nextSystemUrl = next?.code.match(/import ['"]([^'"]+\.vanity\.css)['"]/)?.[1]
      expect(nextSystemUrl).toBeDefined()
      expect(nextSystemUrl).not.toBe(firstSystemUrl)
      expect((await server.transformRequest(nextSystemUrl!))?.code).toContain('#445566')
    }
    finally {
      await server?.close()
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    }
  }, 60000)

  it('addresses style source paths for graph lookup inside and outside the root', () => {
    const host = createViteHmrHost({ root: '/app', base: '/' })
    expect(host.getGraphModuleUrl('/app/entry.css.ts', undefined)).toBe('/entry.css.ts')
    // A URL the host already holds passes through verbatim on every route.
    expect(host.getGraphModuleUrl('/app/entry.css.ts', '/app/entry.css.ts')).toBe('/app/entry.css.ts')
    expect(host.getGraphModuleUrl('/packages/ui/card.css.ts', undefined))
      .toBe(posix.join('/@fs/', '/packages/ui/card.css.ts'))
    expect(host.getGraphModuleUrl('/packages/ui/card.css.ts', '/@fs/packages/ui/card.css.ts'))
      .toBe('/@fs/packages/ui/card.css.ts')
    // The shape that breaks: a node seeded by an absolute-path transform
    // carries its own absolute path as its URL, and the lookup must keep it.
    expect(host.getGraphModuleUrl('/packages/ui/card.css.ts', '/packages/ui/card.css.ts'))
      .toBe('/packages/ui/card.css.ts')
    expect(host.getGraphModuleUrl('C:/ws/packages/ui/card.css.ts', undefined))
      .toBe(posix.join('/@fs/', 'C:/ws/packages/ui/card.css.ts'))
  })
})
