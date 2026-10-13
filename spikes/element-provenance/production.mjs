// Native Vue production removal model. Run through run.mjs.
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { build } from 'vite'
import { emitSourceRegistration } from './registry.mjs'

const root = await mkdtemp(resolve(tmpdir(), 'vanity-provenance-production-'))
const spikeRoot = dirname(fileURLToPath(import.meta.url))
const vueEntry = resolve(dirname(fileURLToPath(import.meta.resolve('vue/package.json'))), 'dist/vue.runtime.esm-bundler.js')
await writeFile(`${root}/index.html`, '<div id="app"></div><script type="module" src="/main.js"></script>')
await writeFile(`${root}/main.js`, `import { createApp } from ${JSON.stringify(vueEntry)}
import App from './App.vue'
import './Row.css.ts'
import { createVariantDirective } from ${JSON.stringify(resolve(spikeRoot, 'binding.mjs'))}
const app = createApp(App)
if (import.meta.env.DEV) app.directive('vanity-variant', createVariantDirective())
app.mount('#app')`)
await writeFile(`${root}/Row.css.ts`, 'export const row = \"row-class\"')
await writeFile(`${root}/App.vue`, '<script setup>const selection = { size: "small" }</script><template><main v-vanity-variant="selection">Production row</main></template>')
const result = await build({ root, configFile: false, resolve: { alias: { vue: vueEntry } }, logLevel: 'silent', plugins: [{ name: 'source-registry-prototype', apply: 'serve', transform(code, id) {
  if (id.endsWith('.css.ts'))
    return code + emitSourceRegistration('Row.css.ts', code)
} }, vue({ template: { compilerOptions: { directiveTransforms: { 'vanity-variant': () => ({ props: [], needRuntime: false }) } } } })], build: { write: false, minify: false } })
const javascript = result.output.filter(chunk => chunk.type === 'chunk').map(chunk => chunk.code).join('\n')
for (const marker of ['vanity-variant', 'vanityVariant', 'createVariantDirective', 'validateSelection', 'Invalid selection:', 'Unknown selection:', '__vanitySources']) assert.ok(!javascript.includes(marker), `Production retained ${marker}`)
await writeFile(resolve(root, 'production-output.js'), javascript)
console.log('Production directive call, registration, validation model and source registry absent; output bytes:', Buffer.byteLength(javascript))
