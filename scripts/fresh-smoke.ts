/**
 * Publication smoke: pack the SDK, install that tarball into two tiny apps,
 * then exercise strict types, production builds, and real dev HTTP lifecycles.
 * No workspace link or source alias is allowed to make this pass.
 */

import type { ChildProcess } from 'node:child_process'
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const workspaceDir = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const packageDir = join(workspaceDir, 'sdk')
const root = mkdtempSync(join(tmpdir(), 'vanity-fresh-'))
const plainDir = join(root, 'plain-vite')
const nuxtDir = join(root, 'nuxt-app')
const testingDir = join(root, 'testing-kit')

/** Mirror the workspace's own pnpm pin so the fresh consumer matches the repo toolchain. */
const rootPackageManager = (
  JSON.parse(readFileSync(join(workspaceDir, 'package.json'), 'utf8')) as { packageManager?: string }
).packageManager ?? 'pnpm'

interface DevPort {
  anyHost?: boolean
  label: string
  port: number
}

function write(path: string, source: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, source)
}

function run(command: string, args: string[], cwd = root): void {
  console.log(`$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

async function openPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

async function waitForHttp(url: string, child: ChildProcess, output: () => string): Promise<string> {
  const deadline = Date.now() + 30_000

  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Dev server exited before serving ${url}\n${output()}`)

    try {
      const response = await fetch(url)
      if (response.ok)
        return await response.text()
    }
    catch {}

    await new Promise(resolve => setTimeout(resolve, 100))
  }

  throw new Error(`Timed out waiting for ${url}\n${output()}`)
}

async function stop(child: ChildProcess): Promise<void> {
  const target = process.platform === 'win32' ? child.pid : child.pid === undefined ? undefined : -child.pid

  if (target === undefined)
    return

  try {
    process.kill(target, 'SIGTERM')
  }
  catch {
    return
  }

  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      process.kill(target, 0)
      await delay(50)
    }
    catch {
      return
    }
  }

  try {
    process.kill(target, 'SIGKILL')
  }
  catch {}
}

function canListen(port: number, anyHost = false): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolve(false))
    const options = anyHost ? { port } : { host: '127.0.0.1', port }
    server.listen(options, () => server.close(error => resolve(error === undefined)))
  })
}

async function assertPortFree({ anyHost = false, label, port }: DevPort): Promise<void> {
  if (!await canListen(port, anyHost))
    throw new Error(`${label} port ${port} became occupied before the fresh dev server started`)
}

async function waitForPort(port: DevPort, busy: boolean, output: string): Promise<void> {
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    const listening = await canListen(port.port, port.anyHost)
    if (busy ? !listening : listening)
      return

    await delay(50)
  }

  const state = busy ? 'claim' : 'release'
  throw new Error(`${port.label} did not ${state} port ${port.port}\n${output}`)
}

async function smokeDev(
  directory: string,
  command: string[],
  port: number,
  expected: RegExp,
): Promise<void> {
  let output = ''
  const ports = [{ label: 'HTTP', port }]

  for (const candidate of ports)
    await assertPortFree(candidate)

  const child = spawn('pnpm', ['--dir', directory, 'exec', ...command], {
    cwd: root,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      CHOKIDAR_INTERVAL: '100',
      CHOKIDAR_USEPOLLING: 'true',
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout?.on('data', chunk => output += String(chunk))
  child.stderr?.on('data', chunk => output += String(chunk))

  try {
    const html = await waitForHttp(`http://127.0.0.1:${port}/`, child, () => output)
    if (!expected.test(html))
      throw new Error(`Fresh dev response did not contain ${expected}\n${html.slice(0, 2_000)}`)

    if (/WebSocket server error|EADDRINUSE/.test(output))
      throw new Error(`Fresh dev server reported a port collision\n${output}`)
  }
  finally {
    await stop(child)
  }

  for (const candidate of ports)
    await waitForPort(candidate, false, output)
}

async function main(): Promise<void> {
  const tarballName = execFileSync('pnpm', ['pack', '--pack-destination', root], {
    cwd: packageDir,
    encoding: 'utf-8',
  }).trim().split('\n').at(-1)!
  const tarball = isAbsolute(tarballName) ? tarballName : join(root, tarballName)
  const packedDependency = `file:${tarball}`

  write(join(root, 'package.json'), JSON.stringify({ private: true, packageManager: rootPackageManager }, null, 2))
  write(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - plain-vite\n  - nuxt-app\n  - testing-kit\n')

  write(join(plainDir, 'package.json'), JSON.stringify({
    name: 'vanity-fresh-plain',
    private: true,
    type: 'module',
    dependencies: { '@mszr/vanity': packedDependency },
    devDependencies: { typescript: '5.8.3', vite: '8.1.5' },
  }, null, 2))
  write(join(plainDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      module: 'ESNext',
      moduleResolution: 'Bundler',
      target: 'ES2022',
      lib: ['ES2022', 'DOM'],
      plugins: [{ name: '@mszr/vanity/typescript' }],
    },
    include: ['src'],
  }, null, 2))
  write(join(plainDir, 'vanity.config.ts'), `import { defineVanityConfig } from '@mszr/vanity/config'

export default defineVanityConfig({
  compiler: {
    system: './src/system.ts',
  },
  autoImports: { style: './src/authoring.ts', app: ['core'] },
})
`)
  write(join(plainDir, 'vite.config.ts'), `import vanityConfig from './vanity.config.ts'
import { defineConfig } from 'vite'
import { vanityPlugin } from '@mszr/vanity/vite'

export default defineConfig({ plugins: [vanityPlugin(vanityConfig)] })
`)
  write(join(plainDir, 'index.html'), '<main id="app"></main><script type="module" src="/src/main.ts"></script>\n')
  write(join(plainDir, 'src/design-system.ts'), `import { createSystem } from '@mszr/vanity'
import { hail } from '@mszr/vanity/presets'

export const open = createSystem().addPlugin(hail({
  color: { ranges: { l: [0.08, 0.96], c: [0, 0.3] } },
}))
`)
  write(join(plainDir, 'src/palette.tokens.ts'), `import { open } from './design-system'

export const palette = open.defineTokens({
  color: { brand: open.tdef.color({ val: open.oklchx(0.58, 0.66, 285), mutable: true }) },
})
  .add(m => ({ color: { brandSoft: open.alpha(m.color.brand, 0.12) } }))
`)
  write(join(plainDir, 'src/system.ts'), `import { open } from './design-system'
import { palette } from './palette.tokens'

export const ds = open.addTokens(palette).consolidate()
`)
  write(join(plainDir, 'src/authoring.ts'), `export { ds } from './system'
`)
  write(join(plainDir, 'src/card.css.ts'), `

export const card = ds.class({ color: ds.t.color.brand, background: ds.t.color.brandSoft, padding: ds.length.rem(1) })
`)
  write(join(plainDir, 'src/main.ts'), `import { VANITY_CSS_CAPABILITIES } from '@mszr/vanity/capabilities'
import { card } from './card.css.ts'

void ports()
document.querySelector('#app')!.innerHTML = '<button class="' + card + '" data-color="' + VANITY_CSS_CAPABILITIES.oklch.maturity + '">Fresh Vite</button>'
`)

  write(join(nuxtDir, 'package.json'), JSON.stringify({
    name: 'vanity-fresh-nuxt',
    private: true,
    type: 'module',
    dependencies: { '@mszr/vanity': packedDependency, 'nuxt': '4.5.1', 'vue': '3.5.40' },
    devDependencies: { 'typescript': '5.8.3', 'vue-tsc': '3.2.0' },
  }, null, 2))
  write(join(nuxtDir, 'tsconfig.json'), '{ "extends": "./.nuxt/tsconfig.json" }\n')
  write(join(nuxtDir, 'vanity.config.ts'), `import { defineVanityConfig } from '@mszr/vanity/config'

export default defineVanityConfig({
  compiler: {
    system: './app/design/system.ts',
  },
  autoImports: { style: './app/design/authoring.ts', app: ['core', 'vue'] },
})
`)
  write(join(nuxtDir, 'nuxt.config.ts'), `import vanityConfig from './vanity.config.ts'

export default defineNuxtConfig({
  modules: ['@mszr/vanity/nuxt'],
  vanity: vanityConfig,
  devtools: { enabled: false },
  compatibilityDate: '2026-07-10',
  typescript: { tsConfig: { compilerOptions: { allowImportingTsExtensions: true } } },
  watchers: { chokidar: { usePolling: true, interval: 100 } },
  vite: { server: { watch: { usePolling: true, interval: 100 } } },
})
`)
  write(join(nuxtDir, 'app/design/design-system.ts'), `import { createSystem } from '@mszr/vanity'

export const open = createSystem()
`)
  write(join(nuxtDir, 'app/design/palette.tokens.ts'), `import { open } from './design-system'

export const palette = open.defineTokens({
  color: { brand: open.tdef.color({ val: open.oklch(0.58, 0.2, 285), mutable: true }) },
})
  .add(m => ({ color: { brandSoft: open.alpha(m.color.brand, 0.12) } }))
`)
  write(join(nuxtDir, 'app/design/system.ts'), `import { open } from './design-system'
import { palette } from './palette.tokens'

export const ds = open.addTokens(palette).consolidate()
`)
  write(join(nuxtDir, 'app/design/authoring.ts'), `export { ds } from './system'
`)
  write(join(nuxtDir, 'app/app.css.ts'), `

export const page = ds.class({ color: ds.t.color.brand, background: ds.t.color.brandSoft, padding: ds.length.rem(2) })
`)
  write(join(nuxtDir, 'app/app.vue'), `<script setup lang="ts">
import { page } from './app.css.ts'
</script>

<template><main :class="page">Fresh Nuxt</main></template>
`)

  write(join(testingDir, 'package.json'), JSON.stringify({
    name: 'vanity-fresh-testing',
    private: true,
    type: 'module',
    dependencies: {
      '@mszr/selenita': '0.2.2',
      '@mszr/vanity': packedDependency,
    },
    devDependencies: {
      typescript: '6.0.3',
      vitest: '4.1.9',
    },
  }, null, 2))
  write(join(testingDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      module: 'ESNext',
      moduleResolution: 'Bundler',
      target: 'ES2022',
      lib: ['ES2022'],
      skipLibCheck: true,
      types: ['vitest/globals'],
    },
    include: ['src', 'vitest.config.ts'],
  }, null, 2))
  write(join(testingDir, 'vitest.config.ts'), `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { globals: true, hookTimeout: 30_000, testTimeout: 30_000 },
})
`)
  write(join(testingDir, 'src/system.ts'), `import { createSystem } from '@mszr/vanity'

export const ds = createSystem()
  .addTokens({ color: { brand: '#635bff' }, space: { md: '16px' } })
  .consolidate({ prefix: 'consumer' })
`)
  write(join(testingDir, 'src/testing.test.ts'), `import { describe, expect, it } from 'vitest'
import {
  cursor,
  defineVanityProject,
  emitOf,
  foldOf,
  rendersLike,
} from '@mszr/vanity/testing'
import { ds } from './system'
import '@mszr/selenita/vitest'

const project = defineVanityProject({
  tsconfig: './tsconfig.json',
  system: "export { ds } from './src/system'",
})

describe('packed consumer testing kit', () => {
  it('captures output and build-time fold evidence', () => {
    expect(emitOf(() => ds.class({ color: ds.t.color.brand }, 'button')))
      .toMatch(/color:\\s*var\\(--consumer-color-brand\\)/)
    expect(foldOf(ds.t.space.md)).toBe('16px')
  })

  it('matches rendered custom properties', () => {
    const element = {
      ownerDocument: {
        defaultView: {
          getComputedStyle: () => ({
            getPropertyValue: (property: string) =>
              property === '--consumer-color-brand' ? ' #635bff ' : '',
          }),
        },
      },
    }

    expect(rendersLike(element, { '--consumer-color-brand': '#635bff' })(ds)).toBe(true)
  })

  it('prewires the consumer system for editor assertions', () => {
    const result = project.query\`
      import { ds } from '#vanity/system'
      void ds.\${cursor}class({})
    \`
    expect(result.errors).toBeClean()
    expect(result.completions).toContainCompletions(['class', 'recipe', 'runtime'])
    for (const name of ['class', 'recipe', 'runtime'])
      expect(result.completionItem(name)?.type, name).not.toMatch(/\\bany\\b/)
  })
})
`)

  run('pnpm', ['install', '--ignore-scripts'])

  run('pnpm', ['--dir', testingDir, 'exec', 'tsc', '--noEmit'])
  run('pnpm', ['--dir', testingDir, 'exec', 'vitest', 'run'])
  console.log('✓ fresh testing kit: packed emit/fold/render and Selenita DX')

  run('pnpm', ['--dir', plainDir, 'exec', 'vanity', 'prepare'])
  run('pnpm', ['--dir', plainDir, 'exec', 'tsc', '--noEmit'])
  run('pnpm', ['--dir', plainDir, 'exec', 'vite', 'build'])
  run('pnpm', ['--dir', plainDir, 'exec', 'vanity', 'inspect'])
  run('pnpm', ['--dir', plainDir, 'exec', 'vanity', 'explain', 'color.brand', '--json'])
  run('pnpm', ['--dir', plainDir, 'exec', 'vanity', 'diff', '.vanity/manifest.json', '.vanity/manifest.json'])
  run('node', [
    '-e',
    `const fs=require('node:fs');const s=JSON.parse(fs.readFileSync('node_modules/@mszr/vanity/manifest.schema.json','utf8'));if(s.$id!=='https://schemas.mszr.dev/vanity/manifest-4.schema.json')process.exit(1)`,
  ], plainDir)
  const vitePort = await openPort()
  await smokeDev(plainDir, ['vite', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], vitePort, /src\/main\.ts/)
  console.log('✓ fresh plain Vite: strict types, build, packed CLI/schema, and dev lifecycle')

  run('pnpm', ['--dir', nuxtDir, 'exec', 'vanity', 'prepare'])
  run('pnpm', ['--dir', nuxtDir, 'exec', 'nuxt', 'prepare'])
  run('pnpm', ['--dir', nuxtDir, 'exec', 'nuxi', 'typecheck'])
  run('pnpm', ['--dir', nuxtDir, 'exec', 'nuxt', 'build'])
  const nuxtHttpPort = await openPort()
  await smokeDev(
    nuxtDir,
    ['nuxt', 'dev', '--host', '127.0.0.1', '--port', String(nuxtHttpPort), '--no-fork'],
    nuxtHttpPort,
    /Fresh Nuxt/,
  )
  console.log('✓ fresh Nuxt: strict types, build, and HTTP/HMR lifecycle')
  console.log(`✓ packed SDK smoke passed (${tarballName})`)
}

try {
  await main()
}
finally {
  rmSync(root, { recursive: true, force: true })
}
