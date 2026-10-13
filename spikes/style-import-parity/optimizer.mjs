// The client optimizer's own live record recovers source before a prebundle exists.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { directory } from './fixture.mjs'
import { compile, evaluate } from './model.mjs'

export async function observeOptimizer(vite) {
  const root = join(directory, '.vanity/optimizer-fixture')
  const packageRoot = join(root, 'node_modules/@fixture/choice')
  await mkdir(packageRoot, { recursive: true })
  await writeFile(join(root, 'package.json'), '{"name":"optimizer-fixture","type":"module"}')
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: '@fixture/choice', type: 'module', exports: { browser: './browser.js', node: './node.js', default: './node.js' } }))
  const browser = join(packageRoot, 'browser.js')
  await writeFile(browser, 'export const value="browser"')
  await writeFile(join(packageRoot, 'node.js'), 'export const value="node"')
  const entry = join(root, 'entry.js')
  await writeFile(entry, 'export {value as named} from "@fixture/choice";export {value as aliased} from "alias-choice";export {value as plugin} from "plugin-choice"')
  const answers = []
  const server = await vite.createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { 'alias-choice': '@fixture/choice' } },
    plugins: [{ name: 'optimizer-plugin-choice', async resolveId(id, importer) {
      if (id === 'plugin-choice')
        return this.resolve('@fixture/choice', importer, { skipSelf: true })
    } }],
    optimizeDeps: { include: ['@fixture/choice'], holdUntilCrawlEnd: false },
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  })
  try {
    const client = server.environments.client
    const resolve = async (request, importer) => {
      const answer = await client.pluginContainer.resolveId(request, importer)
      if (!answer)
        return answer
      const file = answer.id.replace(/[?#].*$/, '')
      if (!client.depsOptimizer?.isOptimizedDepFile(file))
        return answer
      const record = [...Object.values(client.depsOptimizer.metadata.optimized), ...Object.values(client.depsOptimizer.metadata.discovered)].find(record => record.file === file)
      assert.ok(record?.src, `no optimizer source for ${request}: ${answer.id}`)
      answers.push({ request, importer, client: answer.id, original: record.src })
      return { ...answer, id: record.src }
    }
    const bundle = await compile(entry, resolve, id => client.pluginContainer.load(id))
    const initial = evaluate(bundle)
    assert.deepEqual(initial, { named: 'node', aliased: 'browser', plugin: 'browser' })
    assert.equal(answers.length, 3)
    assert.ok(answers.every(answer => answer.original === browser))
    assert.ok(bundle.inputs.every(file => !file.includes('.vite/deps/')))
    await writeFile(browser, 'export const value="edited"')
    client.moduleGraph.onFileChange(browser)
    const edited = evaluate(await compile(entry, resolve, id => client.pluginContainer.load(id)))
    assert.deepEqual(edited, { named: 'node', aliased: 'edited', plugin: 'edited' })
    return { initial, edited, answers, inputs: bundle.inputs }
  }
  finally {
    await server.close()
  }
}
