// Run: pnpm --filter spike-review-decision-reach test
// Same Nuxt fixture, with and without the serve-only model; compare production JS/CSS/HTML.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

await mkdir(new URL('test-results/', import.meta.url), { recursive: true })

const require = createRequire(import.meta.url)
const root = await realpath(await mkdtemp(join(tmpdir(), 'review-production-')))
const model = fileURLToPath(new URL('host.mjs', import.meta.url))
const cli = join(dirname(require.resolve('nuxt/package.json')), 'bin/nuxt.mjs')
function build(label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'build', root], { cwd: root, env: { ...process.env, NODE_ENV: 'production', NUXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    child.stdout.on('data', data => log += data)
    child.stderr.on('data', data => log += data)
    child.once('error', reject)
    child.once('exit', async (code) => {
      await writeFile(new URL(`test-results/production-${label}.log`, import.meta.url), log)
      code === 0 ? resolve() : reject(new Error(`${label} build exited ${code}`))
    })
  })
}
async function snapshot(directory) {
  const result = {}
  const visit = async (path, relative = '') => {
    for (const item of await readdir(path, { withFileTypes: true })) {
      const key = relative + item.name
      if (item.isDirectory()) {
        await visit(join(path, item.name), `${key}/`)
      }
      else if (/\.(?:m?js|css|html)$/.test(item.name)) {
        result[key] = await readFile(join(path, item.name), 'utf8')
      }
    }
  }
  await visit(directory)
  return result
}
// Nitro fills these generated lookup tables concurrently. Compare their keys and
// complete values, while keeping every other byte (including CSS) unchanged.
function canonicalArtifact(path, source) {
  if (path === 'server/chunks/nitro/nitro.mjs') {
    return source.replace(/const assets = (\{[\s\S]*?\n\});/, (_, body) => {
      const assets = JSON.parse(body)
      return `const assets = ${JSON.stringify(Object.fromEntries(Object.entries(assets).sort(([a], [b]) => a.localeCompare(b))))};`
    })
  }
  if (path === 'server/chunks/virtual/styles.mjs') {
    return source.replace(/const styles = \{\n([\s\S]*?)\n\};/, (_, body) => {
      const entries = body.split('\n').map(line => line.replace(/,$/, ''))
      assert(entries.every(line => /^ {2}"[^"\n]+": \(\) => import\('[^'\n]+'\)\.then\(interopDefault\)$/.test(line)), 'known generated style lookup entries')
      return `const styles = {\n${entries.sort().join(',\n')}\n};`
    }).replace(/const inlinedCSS = (\{[^\n]*\});/, (_, body) => {
      const entries = JSON.parse(body)
      return `const inlinedCSS = ${JSON.stringify(Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))))};`
    })
  }
  return source
}
try {
  await symlink(fileURLToPath(new URL('node_modules', import.meta.url)), join(root, 'node_modules'))
  await writeFile(join(root, 'package.json'), '{"name":"review-production-fixture","type":"module","private":true}')
  await mkdir(join(root, 'app/plugins'), { recursive: true })
  await writeFile(join(root, 'app/app.vue'), '<template lang="pug">\nmain Production review fixture\n</template>')
  await writeFile(join(root, 'app/plugins/review.client.ts'), 'export default defineNuxtPlugin(async()=>{if(import.meta.dev)await import(\'virtual:review-probe\')})')
  const config = enabled => `import {reviewPlugin} from ${JSON.stringify(model)};export default {buildId:'review-spike',devtools:{enabled:false},telemetry:false,experimental:{appManifest:false},hooks:{'nitro:build:public-assets':async nitro=>{const {readdir,utimes}=await import('node:fs/promises');const {join}=await import('node:path');const walk=async path=>{for(const entry of await readdir(path,{withFileTypes:true})){const full=join(path,entry.name);if(entry.isDirectory())await walk(full);else await utimes(full,new Date(0),new Date(0))}};await walk(nitro.options.output.publicDir)}},vite:{plugins:${enabled ? '[reviewPlugin()]' : '[]'}}}`
  await rm(join(root, '.nuxt'), { recursive: true, force: true })
  await rm(join(root, '.output'), { recursive: true, force: true })
  await writeFile(join(root, 'nuxt.config.mjs'), config(true))
  await build('clean-with')
  const cleanWith = await snapshot(join(root, '.output'))
  await rm(join(root, '.nuxt'), { recursive: true, force: true })
  await rm(join(root, '.output'), { recursive: true, force: true })
  await writeFile(join(root, 'nuxt.config.mjs'), config(false))
  await build('clean-without')
  const cleanWithout = await snapshot(join(root, '.output'))
  const differences = [...new Set([...Object.keys(cleanWith), ...Object.keys(cleanWithout)])].filter(path => cleanWith[path] !== cleanWithout[path])
  for (const path of differences) {
    await writeFile(new URL(`test-results/production-with-${path.split('/').at(-1)}`, import.meta.url), cleanWith[path] ?? '')
    await writeFile(new URL(`test-results/production-without-${path.split('/').at(-1)}`, import.meta.url), cleanWithout[path] ?? '')
  }
  assert(!JSON.stringify(cleanWith).includes('vanity-review-probe'), 'production overlay absent')
  const excerpts = differences.map((path) => {
    const a = cleanWith[path] ?? ''
    const b = cleanWithout[path] ?? ''
    let i = 0
    while (i < Math.min(a.length, b.length) && a[i] === b[i])i++
    return { path, index: i, with: a.slice(Math.max(0, i - 100), i + 300), without: b.slice(Math.max(0, i - 100), i + 300) }
  })
  await writeFile(new URL('test-results/production-results.json', import.meta.url), JSON.stringify({ nuxt: require('nuxt/package.json').version, files: Object.keys(cleanWith).length, differences, excerpts }, null, 2))
  const comparedDifferences = differences.filter(path => canonicalArtifact(path, cleanWith[path] ?? '') !== canonicalArtifact(path, cleanWithout[path] ?? ''))
  await writeFile(new URL('test-results/production-comparison.json', import.meta.url), JSON.stringify({ files: Object.keys(cleanWith).length, rawDifferences: differences, comparedDifferences, controls: ['fixed generated asset mtimes', 'unordered Nitro asset and Nuxt style lookup entries'] }, null, 2))
  assert.deepEqual(comparedDifferences, [], 'Nuxt production unchanged except generated lookup order')
  console.log('Nuxt production artifacts agree; host lookup order controlled')
}
finally { await rm(root, { recursive: true, force: true }) }
