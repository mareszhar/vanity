import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const directory = dirname(fileURLToPath(import.meta.url))
export const root = join(directory, '.vanity/fixture')
export const entry = join(root, 'matrix-entry.js')
export async function prepareFixture() {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'package.json'), '{"name":"style-import-fixture","type":"module"}')
  const packages = {
    'exact': { exports: { '.': { browser: './browser.js', node: './node.js', default: './node.js' }, './a': { browser: './browser.js', node: './node-a.js', default: './node-a.js' }, './b': { browser: './browser.js', node: './node-b.js', default: './node-b.js' } } },
    'pattern': { exports: { './a/*': { browser: './browser/*.js', node: './node-a/*.js', default: './node-a/*.js' }, './b/*': { browser: './browser/*.js', node: './node-b/*.js', default: './node-b/*.js' } } },
    'nested': { exports: { '.': { import: { browser: './browser.js', node: './node.js', default: './node.js' }, default: './fallback.js' } } },
    'browser-string': { main: './node.js', browser: './browser.js' },
    'browser-map': { main: './node.js', browser: { './node.js': './browser.js', './disabled.js': false } },
    'browser-false-main': { main: './node.js', browser: { './node.js': false } },
    'browser-null': { exports: { '.': { browser: null, node: './node.js', default: './node.js' } } },
    'unchanged': { main: './node.js', module: './module.js' },
    'throwing': { exports: { '.': { browser: './browser.js', node: './node.js', default: './node.js' } } },
    ...Object.fromEntries(['transitive', 'outer', 'inner', 'unmapped'].map(name => [name, { exports: { browser: './browser.js', node: './node.js', default: './node.js' } }])),
    'react': { main: './node.js' },
    'buffer': { main: './node.js', browser: './browser.js' },
  }
  for (const [name, metadata] of Object.entries(packages)) {
    const packageName = ['react', 'buffer'].includes(name) ? name : `@fixture/${name}`
    const packageDirectory = join(root, 'node_modules', packageName)
    await mkdir(packageDirectory, { recursive: true })
    await writeFile(join(packageDirectory, 'package.json'), JSON.stringify({ name: packageName, type: 'module', ...metadata }))
    for (const file of ['node.js', 'browser.js', 'node-a.js', 'node-b.js', 'disabled.js', 'module.js', 'fallback.js', 'browser/item.js', 'node-a/item.js', 'node-b/item.js']) {
      await mkdir(dirname(join(packageDirectory, file)), { recursive: true })
      await writeFile(join(packageDirectory, file), name === 'throwing' && file === 'browser.js' ? 'export const selected = window.location.href' : `export const selected = ${JSON.stringify(`${name}/${file}`)}`)
    }
  }
  for (const name of ['transitive', 'outer', 'inner', 'unmapped']) {
    const packageDirectory = join(root, 'node_modules/@fixture', name)
    await writeFile(join(packageDirectory, 'browser.js'), name === 'outer' ? 'export {selected} from "plugin-inner"' : 'export {selected} from "./helper.js"')
    await writeFile(join(packageDirectory, 'helper.js'), name === 'unmapped' ? 'const error=new Error("original stackless failure");error.stack="Error: original stackless failure";throw error;export const selected="unused"' : 'export const selected=window.location.href')
  }
  const compiler = join(root, 'node_modules/compiler-fixture')
  await mkdir(compiler, { recursive: true })
  await writeFile(join(compiler, 'package.json'), '{"name":"compiler-fixture","type":"module","exports":"./index.js"}')
  await writeFile(join(compiler, 'index.js'), 'import {Buffer} from "node:buffer"; export const createSystem = () => ({consolidate: () => ({kind: Buffer.from("system").toString()})})')
  await writeFile(join(root, 'client-only.js'), 'export const selected = "project/client"')
  await writeFile(entry, ['@fixture/exact', '@fixture/browser-false-main', '@fixture/browser-map/disabled.js', 'string-alias', 'regex-alias', 'plugin-choice', 'stateful-choice', 'virtual-choice'].map((specifier, index) => `export {selected as value${index}} from ${JSON.stringify(specifier)}`).join('\n'))
}
export function fixturePlugin() {
  const state = new WeakSet()
  const routes = new Map([
    ['plugin-choice', '@fixture/exact'],
    ['plugin-a', '@fixture/exact/a'],
    ['plugin-b', '@fixture/exact/b'],
    ['plugin-pattern-a', '@fixture/pattern/a/item'],
    ['plugin-pattern-b', '@fixture/pattern/b/item'],
    ['plugin-false', '@fixture/browser-map/disabled.js'],
    ['plugin-throw', '@fixture/throwing'],
    ...['transitive', 'outer', 'inner', 'unmapped'].map(name => [`plugin-${name}`, `@fixture/${name}`]),
    ['react', '@fixture/exact'],
  ])
  return {
    name: 'fixture-resolution',
    enforce: 'pre',
    perEnvironmentStartEndDuringDev: true,
    buildStart: { sequential: true, handler() {
      if (this.environment)
        state.add(this.environment)
    } },
    async resolveId(request, importer) {
      if (routes.has(request))
        return this.resolve(routes.get(request), importer, { skipSelf: true })
      if (request === 'plugin-direct-browser')
        return join(root, 'node_modules/@fixture/exact/browser.js')
      if (request === 'buffer')
        return join(root, 'node_modules/buffer/browser.js')
      if (request === 'stateful-choice') {
        if (this.environment && !state.has(this.environment))
          throw new Error('host initialization has not run')
        return join(root, 'client-only.js')
      }
      if (request === 'virtual-choice')
        return '\0virtual-choice'
    },
    load(id) {
      if (id === '\0virtual-choice')
        return 'export const selected = "virtual"'
    },
  }
}
export function configuration(plugins = []) {
  return {
    root,
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
    resolve: { alias: [{ find: 'string-alias', replacement: join(root, 'client-only.js') }, { find: /^regex-alias$/, replacement: join(root, 'client-only.js') }] },
    plugins: [fixturePlugin(), ...plugins],
  }
}
