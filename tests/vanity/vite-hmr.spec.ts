import type { Page } from '@playwright/test'
import type { ViteDevServer } from 'vite'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { createServer } from 'vite'
import { createViteHmrHost } from '../../sdk/src/compiler/hosts/viteHmr'
import { vanityPlugin } from '../../sdk/src/vite'

const sdkRoot = fileURLToPath(new URL('../../sdk/', import.meta.url))
const alias = {
  '@mszr/vanity/runtime': join(sdkRoot, 'src/runtime.ts'),
  '@mszr/vanity': join(sdkRoot, 'src/index.ts'),
  '@vanilla-extract/css': join(sdkRoot, 'node_modules/@vanilla-extract/css'),
}

interface BrowserFixture {
  readonly root: string
  readonly appRoot: string
  readonly origin: string
  readonly base: string
  readonly system: string
  readonly theme: string
  readonly barrel: string
  readonly constants: string
  readonly style: string
  readonly secondStyle: string
  readonly outsideStyle: string
  readonly brokenStyle: string
  readonly watchEvents: string[]
  readonly hmrUpdates: string[]
  readonly server: ViteDevServer
}

interface BrowserSystemArtifact {
  readonly prefix: string
  readonly identities: {
    readonly css: string
    readonly compatibility: string
    readonly runtime: string
    readonly docs: string
  }
}

interface OrdinaryNamespaceFixture {
  readonly root: string
  readonly origin: string
  readonly base: string
  readonly values: string
  readonly server: ViteDevServer
}

async function put(root: string, file: string, source: string): Promise<string> {
  const path = join(root, file)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, source)
  return path
}

async function startFixture(base: string, options: {
  alternateLayerProbe?: boolean
  unloadedStyleDelayMs?: number
} = {}): Promise<BrowserFixture> {
  const { alternateLayerProbe = false, unloadedStyleDelayMs = 0 } = options
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-browser-hmr-')))
  const appRoot = join(root, 'app')
  const designRoot = join(root, 'packages', 'design')
  await mkdir(appRoot, { recursive: true })
  await put(appRoot, 'package.json', '{ "name": "browser-hmr-app", "type": "module" }')
  await put(designRoot, 'package.json', JSON.stringify({
    name: '@fixture/design',
    type: 'module',
    exports: { './system': './system.ts', './barrel': './barrel.ts', './spot.css.ts': './spot.css.ts' },
  }))
  await mkdir(join(appRoot, 'node_modules/@fixture'), { recursive: true })
  await symlink(designRoot, join(appRoot, 'node_modules/@fixture/design'), 'dir')
  const system = await put(designRoot, 'system.ts', `import { createSystem } from '@mszr/vanity'
import { brand } from './theme'

const open = createSystem()
export const ds = open
  .addTokens({ color: { brand: open.tdef.color({ val: brand, mutable: true, description: 'system-docs-v1' }) } })
  .addRules({
    reset: { layer: 'reset', description: 'system-docs-v1', css: { ':root': { '--browser-layer-probe': 'reset' } } },
    resetPadding: { layer: 'reset', css: { div: { padding: 0 } } },
    recipe: { layer: 'recipes', css: { ':root': { '--browser-layer-probe': 'recipe' } } },
    orderProbe: { layer: 'recipes', css: { '#order-probe': { margin: '1px', marginTop: '2px' } } },
  })
  .consolidate({ prefix: 'browser-hmr' })
`)
  const theme = await put(designRoot, 'theme.ts', 'export const brand = \'#112233\'\n')
  const constants = await put(designRoot, 'constants.ts', 'export const unrelated = \'kept\'\n')
  const barrel = await put(designRoot, 'barrel.ts', `export { ds as theme } from './system'
export { unrelated as renamedUnrelated } from './constants'
`)
  await put(appRoot, 'alternate.ts', `import { createSystem } from '@mszr/vanity'

const open = createSystem()
export const alternate = open
  .addTokens({ color: { brand: '#aa00bb' } })
  ${alternateLayerProbe ? '.addRules({ resetPadding: { layer: \'reset\', css: { p: { padding: 0 } } } })' : ''}
  .consolidate({ prefix: 'browser-hmr-alternate' })
`)
  if (alternateLayerProbe) {
    await put(appRoot, 'alternate.css.ts', `import { alternate } from './alternate'
export const alternateCard = alternate.class({ padding: '2px' })
`)
  }
  const hmrUpdates: string[] = []
  const style = await put(appRoot, 'style.css.ts', `import { ds } from '@fixture/design/system'

export const card = ds.class({
  color: ds.t.color.brand,
  padding: '1px',
  borderStyle: 'solid',
})
`)
  const secondStyle = await put(appRoot, 'second.css.ts', `import { ds } from '@fixture/design/system'

export const card = ds.class({ color: ds.t.color.brand })
`)
  const outsideStyle = await put(designRoot, 'spot.css.ts', `import { ds } from './system'

export const spot = ds.class({
  color: ds.t.color.brand,
  padding: '4px',
})
`)
  const brokenStyle = await put(appRoot, 'broken.css.ts', `import { ds } from '@fixture/design/system'

export const broken = ds.class({ color: ds.t.color.brand
`)
  await put(appRoot, 'main.ts', `${alternateLayerProbe ? 'import { alternateCard } from \'./alternate.css.ts\'\n' : ''}import { card } from './style.css.ts'
import { card as second } from './second.css.ts'
import { spot } from '@fixture/design/spot.css.ts'
import { ds } from '@fixture/design/system'
import { theme, renamedUnrelated } from '@fixture/design/barrel'
import * as applicationNamespace from '@fixture/design/barrel'

const loads = Number(sessionStorage.getItem('vanity-browser-loads') ?? 0) + 1
sessionStorage.setItem('vanity-browser-loads', String(loads))
import.meta.hot?.on('vite:beforeFullReload', () => {
  sessionStorage.setItem('vanity-browser-reload-target', String(loads + 1))
})
const runtime = ds.runtime()
runtime.t.color.brand.$set('#778899')
;(globalThis as any).__vanityRuntime = runtime
;(globalThis as any).__vanityNamespace = {
  shared: theme === ds,
  unrelated: renamedUnrelated,
  variable: theme.t.color.brand.$name,
  added: Reflect.get(applicationNamespace, 'added') ?? null,
}
document.body.innerHTML = '<main><div id="first"></div><div id="second"></div><div id="third"></div><div id="order-probe"></div></main>'
document.querySelector('#first')!.className = card
document.querySelector('#second')!.className = second
document.querySelector('#third')!.className = spot
${alternateLayerProbe ? 'document.body.insertAdjacentHTML(\'beforeend\', \'<p id="fourth"></p>\')\ndocument.querySelector(\'#fourth\')!.className = alternateCard' : ''}
document.body.insertAdjacentHTML('beforeend', '<output id="namespace-proof"></output>')
document.querySelector('#namespace-proof')!.textContent = JSON.stringify((globalThis as any).__vanityNamespace)
`)
  await put(appRoot, 'index.html', '<!doctype html><html><body><script type="module" src="/main.ts"></script></body></html>\n')

  await put(appRoot, 'unloaded.css.ts', `import { ds } from '@fixture/design/system'; export const ghost = ds.class({ color: ds.t.color.brand })`)
  const server = await createServer({
    root: appRoot,
    base,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      vanityPlugin({ compiler: { system: ['@fixture/design/barrel', './alternate.ts'] } }),
      {
        name: 'vanity-browser-hmr-observer',
        async transform(_source, id) {
          if (id === join(appRoot, 'unloaded.css.ts') && unloadedStyleDelayMs > 0)
            await new Promise(resolve => setTimeout(resolve, unloadedStyleDelayMs))
        },
        handleHotUpdate(context) {
          hmrUpdates.push(`${context.file} → ${context.modules.map(module => module.file ?? module.url).join(', ')}`)
        },
      },
    ],
    resolve: { alias },
    server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [root] } },
    optimizeDeps: { noDiscovery: true },
  })
  const watchEvents: string[] = []
  server.watcher.on('all', (event, file) => watchEvents.push(`${event} ${file}`))
  await server.listen()
  const localUrl = server.resolvedUrls?.local[0]
  if (localUrl === undefined)
    throw new Error('Vite did not expose a local browser URL')

  return {
    root,
    appRoot,
    origin: new URL(localUrl).origin,
    base,
    system,
    theme,
    barrel,
    constants,
    style,
    secondStyle,
    outsideStyle,
    brokenStyle,
    watchEvents,
    hmrUpdates,
    server,
  }
}

async function startOrdinaryNamespaceFixture(base: string): Promise<OrdinaryNamespaceFixture> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-browser-ordinary-')))
  const appRoot = join(root, 'app')
  const packageRoot = join(root, 'packages', 'ordinary')
  await mkdir(appRoot, { recursive: true })
  await put(appRoot, 'package.json', JSON.stringify({ name: 'ordinary-namespace-app', type: 'module' }))
  await put(packageRoot, 'package.json', JSON.stringify({
    name: '@fixture/ordinary',
    type: 'module',
    exports: {
      './system': './system.ts',
      './barrel': './barrel.ts',
      './values': './values.ts',
    },
  }))
  await mkdir(join(appRoot, 'node_modules/@fixture'), { recursive: true })
  await symlink(packageRoot, join(appRoot, 'node_modules/@fixture/ordinary'), 'dir')

  await put(packageRoot, 'system.ts', `import { createSystem } from '@mszr/vanity'

const open = createSystem()
export const ds = open
  .addTokens({ color: { brand: '#123456' } })
  .consolidate({ prefix: 'browser-ordinary' })
`)
  const values = await put(packageRoot, 'values.ts', `export const value = { label: 'kept' }
export const alias = value
export const callable = () => value.label
export let live = 'v1'
export const setLive = (next: string) => { live = next }
export const unused = () => 'unused'
export const revision = 'v1'
`)
  await put(packageRoot, 'barrel.ts', `export { ds as theme } from './system'
export { value as renamedValue, callable as renamedCallable, live as renamedLive } from './values'
export { unused } from './values'
export { revision as renamedRevision } from './values'
`)
  await put(appRoot, 'main.ts', `import { theme } from '@fixture/ordinary/barrel'
import { ds } from '@fixture/ordinary/system'
import { renamedValue, renamedCallable, renamedLive, renamedRevision } from '@fixture/ordinary/barrel'
import { value, alias, callable, live, setLive, revision } from '@fixture/ordinary/values'

renamedValue.label = 'mutated'
setLive('v2')
const loads = Number(sessionStorage.getItem('vanity-ordinary-loads') ?? 0) + 1
sessionStorage.setItem('vanity-ordinary-loads', String(loads))
;(globalThis as any).__vanityOrdinary = {
  systemShared: theme === ds,
  objectIdentity: renamedValue === value && value === alias,
  objectMutation: value.label,
  functionIdentity: renamedCallable === callable,
  functionResult: renamedCallable(),
  liveDirect: live,
  liveBarrel: renamedLive,
  revisionDirect: revision,
  revisionBarrel: renamedRevision,
}
document.body.innerHTML = '<output id="ordinary-proof"></output>'
document.querySelector('#ordinary-proof')!.textContent = JSON.stringify((globalThis as any).__vanityOrdinary)
`)
  await put(appRoot, 'index.html', '<!doctype html><html><body><script type="module" src="/main.ts"></script></body></html>\n')

  const server = await createServer({
    root: appRoot,
    base,
    configFile: false,
    logLevel: 'silent',
    plugins: [vanityPlugin({ compiler: { system: '@fixture/ordinary/barrel' } })],
    resolve: { alias },
    server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [root] } },
    optimizeDeps: { noDiscovery: true },
  })
  await server.listen()
  const localUrl = server.resolvedUrls?.local[0]
  if (localUrl === undefined)
    throw new Error('Vite did not expose a local browser URL')

  return {
    root,
    origin: new URL(localUrl).origin,
    base,
    values,
    server,
  }
}

async function stopFixture(fixture: BrowserFixture): Promise<void> {
  await fixture.server.close()
  await rm(fixture.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
}

async function stopOrdinaryNamespaceFixture(fixture: OrdinaryNamespaceFixture): Promise<void> {
  await fixture.server.close()
  await rm(fixture.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
}

async function loadOrdinaryNamespaceFixture(page: Page, fixture: OrdinaryNamespaceFixture): Promise<string[]> {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(`page: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error')
      failures.push(`console: ${message.text()}`)
  })
  page.on('requestfailed', request => failures.push(`${request.url()} — ${request.failure()?.errorText ?? 'failed'}`))

  await page.goto(`${fixture.origin}${fixture.base}`, { waitUntil: 'networkidle' })
  await expect(page.locator('#ordinary-proof')).toHaveText(JSON.stringify({
    systemShared: true,
    objectIdentity: true,
    objectMutation: 'mutated',
    functionIdentity: true,
    functionResult: 'mutated',
    liveDirect: 'v2',
    liveBarrel: 'v2',
    revisionDirect: 'v1',
    revisionBarrel: 'v1',
  }))
  return failures
}

async function loadFixture(page: Page, fixture: BrowserFixture) {
  const cssRequests: string[] = []
  const hmrFrames: string[] = []
  const failures: string[] = []
  page.on('websocket', (socket) => {
    socket.on('framesent', frame => hmrFrames.push(`sent ${String(frame.payload)}`))
    socket.on('framereceived', frame => hmrFrames.push(`received ${String(frame.payload)}`))
  })
  page.on('request', (request) => {
    if (request.url().includes('.vanity.css'))
      cssRequests.push(request.url())
  })
  page.on('requestfailed', request => failures.push(`${request.url()} — ${request.failure()?.errorText ?? 'failed'}`))
  page.on('pageerror', error => failures.push(`page: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error')
      failures.push(`console: ${message.text()}`)
  })

  await page.goto(`${fixture.origin}${fixture.base}`, { waitUntil: 'networkidle' })
  await expect(page.locator('#first')).toBeVisible()
  await expect.poll(() => page.locator('#first').evaluate(element => getComputedStyle(element).color))
    .toBe('rgb(119, 136, 153)')
  await expect.poll(() => page.locator('#second').evaluate(element => getComputedStyle(element).color))
    .toBe('rgb(119, 136, 153)')
  await expect.poll(() => page.locator('#third').evaluate(element => getComputedStyle(element).padding))
    .toBe('4px')
  await expect(page.locator('#namespace-proof')).toHaveText(
    JSON.stringify({ shared: true, unrelated: 'kept', variable: '--browser-hmr-color-brand', added: null }),
  )
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement)
    .getPropertyValue('--browser-layer-probe')
    .trim()))
    .toBe('recipe')

  return { cssRequests, failures, hmrFrames }
}

function loadCount(page: Page, key = 'vanity-browser-loads'): Promise<number> {
  return page.evaluate(loadKey => Number(sessionStorage.getItem(loadKey)), key)
}

/** Let Vite run its ordinary watcher and module-graph HMR path for host-owned files. */
function emitHostFileChange(server: ViteDevServer, file: string): void {
  server.watcher.emit('change', file)
}

async function readSystemArtifact(fixture: BrowserFixture, prefix: string): Promise<BrowserSystemArtifact> {
  const artifactRoot = join(fixture.appRoot, '.vanity')
  const manifest = JSON.parse(await readFile(join(artifactRoot, 'manifest.json'), 'utf8')) as {
    system: BrowserSystemArtifact
    systems: Record<string, BrowserSystemArtifact>
  }
  const current = [manifest.system, ...Object.values(manifest.systems)]
    .find(candidate => candidate.prefix === prefix)
  if (current === undefined)
    throw new Error(`expected a current system artifact for ${prefix}`)
  return JSON.parse(await readFile(join(artifactRoot, 'systems', `${current.identities.compatibility}.json`), 'utf8')) as BrowserSystemArtifact
}

test('configured barrel preserves ordinary module binding semantics in the browser', async ({ page }) => {
  const fixture = await startOrdinaryNamespaceFixture('/dashboard/')
  try {
    const failures = await loadOrdinaryNamespaceFixture(page, fixture)
    const loads = await loadCount(page, 'vanity-ordinary-loads')
    const source = await readFile(fixture.values, 'utf8')
    await fixture.server.watcher.unwatch(fixture.values)
    await writeFile(fixture.values, source.replace('export const revision = \'v1\'', 'export const revision = \'v2\''))
    const reload = page.waitForNavigation({ waitUntil: 'networkidle' })
    emitHostFileChange(fixture.server, fixture.values)
    await reload
    await expect.poll(() => page.locator('#ordinary-proof').textContent()).toBe(JSON.stringify({
      systemShared: true,
      objectIdentity: true,
      objectMutation: 'mutated',
      functionIdentity: true,
      functionResult: 'mutated',
      liveDirect: 'v2',
      liveBarrel: 'v2',
      revisionDirect: 'v2',
      revisionBarrel: 'v2',
    }))
    expect(await loadCount(page, 'vanity-ordinary-loads')).toBe(loads + 1)
    const transformedMain = await page.evaluate(async url => await (await fetch(url)).text(), `${fixture.base}main.ts`)
    expect(transformedMain).not.toContain('createSystem')
    expect(transformedMain).not.toContain('addTokens')
    expect(failures, failures.join('\n')).toEqual([])
  }
  finally {
    await stopOrdinaryNamespaceFixture(fixture)
  }
})

test('root and non-root bases apply local CSS edits through real browser requests', async ({ page }) => {
  for (const base of ['/', '/dashboard/']) {
    const fixture = await startFixture(base)
    try {
      const { cssRequests, failures } = await loadFixture(page, fixture)
      const loads = await loadCount(page)
      const before = await page.locator('#first').evaluate(element => getComputedStyle(element).padding)
      expect(before).toBe('1px')

      const source = await readFile(fixture.style, 'utf8')
      await writeFile(fixture.style, source.replace('padding: \'1px\'', 'padding: \'2px\''))
      await expect.poll(() => page.locator('#first').evaluate(element => getComputedStyle(element).padding))
        .toBe('2px')
      expect(await loadCount(page)).toBe(loads)
      expect(cssRequests.some(url => new URL(url).pathname.startsWith(base))).toBe(true)
      expect(failures, failures.join('\n')).toEqual([])
    }
    finally {
      await stopFixture(fixture)
    }
  }
})

test('out-of-root style edits hot-swap computed style without reload', async ({ page }) => {
  for (const base of ['/', '/dashboard/']) {
    const fixture = await startFixture(base)
    try {
      const { failures } = await loadFixture(page, fixture)
      const loads = await loadCount(page)

      const source = await readFile(fixture.outsideStyle, 'utf8')
      await writeFile(fixture.outsideStyle, source.replace('padding: \'4px\'', 'padding: \'6px\''))
      await expect.poll(() => page.locator('#third').evaluate(element => getComputedStyle(element).padding))
        .toBe('6px')
      expect(await loadCount(page)).toBe(loads)
      expect(failures, failures.join('\n')).toEqual([])
    }
    finally {
      await stopFixture(fixture)
    }
  }
})

test('configured barrel and leaf application imports share runtime backing in the browser', async ({ page }) => {
  const fixture = await startFixture('/dashboard/')
  try {
    const { failures } = await loadFixture(page, fixture)
    await expect.poll(() => page.evaluate(() => (globalThis as any).__vanityNamespace))
      .toEqual({ shared: true, unrelated: 'kept', variable: '--browser-hmr-color-brand', added: null })
    expect(failures, failures.join('\n')).toEqual([])
  }
  finally {
    await stopFixture(fixture)
  }
})

test('application namespace value and interface edits are not hidden behind stable runtime identity', async ({ page }) => {
  const fixture = await startFixture('/dashboard/')
  try {
    const { failures, hmrFrames } = await loadFixture(page, fixture)
    const loads = await loadCount(page)
    const before = await readSystemArtifact(fixture, 'browser-hmr')

    const constantsSource = await readFile(fixture.constants, 'utf8')
    await fixture.server.watcher.unwatch(fixture.constants)
    await writeFile(fixture.constants, constantsSource.replace('kept', 'updated'))
    const valueReload = page.waitForNavigation({ waitUntil: 'networkidle' })
    emitHostFileChange(fixture.server, fixture.constants)
    await valueReload
    await expect.poll(() => loadCount(page), {
      message: [...fixture.hmrUpdates, ...hmrFrames, ...failures].join('\n'),
    }).toBe(loads + 1)
    await expect.poll(
      () => page.locator('#namespace-proof').textContent(),
      {
        message: [
          ...fixture.watchEvents,
          ...fixture.hmrUpdates,
          ...hmrFrames,
          ...failures,
        ].join('\n'),
      },
    ).toBe(
      JSON.stringify({ shared: true, unrelated: 'updated', variable: '--browser-hmr-color-brand', added: null }),
    )
    const afterValue = await readSystemArtifact(fixture, 'browser-hmr')
    expect(afterValue.identities.runtime).toBe(before.identities.runtime)

    const barrelSource = await readFile(fixture.barrel, 'utf8')
    await fixture.server.watcher.unwatch(fixture.barrel)
    await writeFile(fixture.barrel, `${barrelSource}export const added = 'interface-change'\n`)
    const interfaceReload = page.waitForNavigation({ waitUntil: 'networkidle' })
    emitHostFileChange(fixture.server, fixture.barrel)
    await interfaceReload
    await expect.poll(() => page.locator('#namespace-proof').textContent()).toBe(
      JSON.stringify({ shared: true, unrelated: 'updated', variable: '--browser-hmr-color-brand', added: 'interface-change' }),
    )
    expect(await loadCount(page)).toBe(loads + 2)
    const afterInterface = await readSystemArtifact(fixture, 'browser-hmr')
    expect(afterInterface.identities.runtime).toBe(before.identities.runtime)
    expect(failures, failures.join('\n')).toEqual([])
  }
  finally {
    await stopFixture(fixture)
  }
})

test('a changed-identity package system updates both consumers and preserves compatible runtime state', async ({ page }) => {
  const fixture = await startFixture('/dashboard/')
  try {
    const { cssRequests, failures, hmrFrames } = await loadFixture(page, fixture)
    const loads = await loadCount(page)
    const initialRequests = new Set(cssRequests)
    const before = await readSystemArtifact(fixture, 'browser-hmr')
    await fixture.server.transformRequest('/unloaded.css.ts')
    await page.route('**/*.vanity.css*', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 600))
      await route.continue()
    })
    await page.evaluate(() => {
      const systemStylesheets = () => [...document.styleSheets].filter(sheet =>
        (sheet.ownerNode as Element | null)?.getAttribute('data-vite-dev-id')?.includes('/.vanity/virtual/system/'))
      if (systemStylesheets().length === 0) {
        throw new Error('the fixture has no live system stylesheet before the edit')
      }
      ;(globalThis as any).__vanitySystemSheetGap = false
      const observer = new MutationObserver(() => {
        if (systemStylesheets().length === 0)
          (globalThis as any).__vanitySystemSheetGap = true
      })
      observer.observe(document.head, { childList: true })
    })
    const source = await readFile(fixture.theme, 'utf8')
    await fixture.server.watcher.unwatch(fixture.theme)
    await writeFile(fixture.theme, source.replace('#112233', '#445566'))
    emitHostFileChange(fixture.server, fixture.theme)

    await expect.poll(async () => (await readSystemArtifact(fixture, 'browser-hmr')).identities.css)
      .not
      .toBe(before.identities.css)
    await expect.poll(() => fixture.hmrUpdates.some(update => update.startsWith(fixture.theme)))
      .toBe(true)
    const after = await readSystemArtifact(fixture, 'browser-hmr')
    if (after.identities.css === before.identities.css)
      throw new Error('expected a new CSS identity after the token edit')
    await expect.poll(
      () => cssRequests.some(url => url.includes(after.identities.css)),
      { message: [...fixture.hmrUpdates, ...cssRequests, ...hmrFrames, ...failures].join('\n') },
    ).toBe(true)
    await expect.poll(() => page.evaluate(identity => [...document.styleSheets].some(sheet =>
      (sheet.ownerNode as Element | null)?.getAttribute('data-vite-dev-id')?.includes(identity)), after.identities.css))
      .toBe(true)
    await expect.poll(() => page.evaluate(identity => [...document.styleSheets].some(sheet =>
      (sheet.ownerNode as Element | null)?.getAttribute('data-vite-dev-id')?.includes(identity)), before.identities.css))
      .toBe(false)
    expect(await page.evaluate(() => (globalThis as any).__vanitySystemSheetGap)).toBe(false)

    await expect.poll(() => page.locator('#first').evaluate(element => getComputedStyle(element).color))
      .toBe('rgb(119, 136, 153)')
    await expect.poll(() => page.locator('#first').evaluate(element => getComputedStyle(element).padding))
      .toBe('1px')
    await expect.poll(() => page.locator('#second').evaluate(element => getComputedStyle(element).color))
      .toBe('rgb(119, 136, 153)')
    expect(await page.evaluate(() => (globalThis as any).__vanityRuntime.snapshot().overrides.find((entry: { token: string[] }) => entry.token.join('.') === 'color.brand')?.val))
      .toBe('#778899')
    expect(await loadCount(page), hmrFrames.join('\n')).toBe(loads)
    expect(new Set(cssRequests).size).toBeGreaterThan(initialRequests.size)
    expect(cssRequests.some(url => new URL(url).pathname.startsWith('/dashboard/'))).toBe(true)
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement)
      .getPropertyValue('--browser-layer-probe')
      .trim()))
      .toBe('recipe')

    await page.evaluate(() => (globalThis as any).__vanityRuntime.t.color.brand.$unset())
    await expect.poll(() => page.locator('#first').evaluate(element => getComputedStyle(element).color))
      .toBe('rgb(68, 85, 102)')
    expect(failures, failures.join('\n')).toEqual([])
  }
  finally {
    await stopFixture(fixture)
  }
})

test('a declaration-order-only system edit changes identity and shorthand cascade in the browser', async ({ page }) => {
  const fixture = await startFixture('/dashboard/')
  try {
    const { cssRequests, failures, hmrFrames } = await loadFixture(page, fixture)
    const loads = await loadCount(page)
    const before = await readSystemArtifact(fixture, 'browser-hmr')
    await expect.poll(() => page.locator('#order-probe').evaluate(element => getComputedStyle(element).marginTop))
      .toBe('2px')

    const source = await readFile(fixture.system, 'utf8')
    await fixture.server.watcher.unwatch(fixture.system)
    const reordered = source.replace(
      'margin: \'1px\', marginTop: \'2px\'',
      'marginTop: \'2px\', margin: \'1px\'',
    )
    expect(reordered).not.toBe(source)
    await writeFile(fixture.system, reordered)
    emitHostFileChange(fixture.server, fixture.system)

    await expect.poll(async () => (await readSystemArtifact(fixture, 'browser-hmr')).identities.css, {
      message: [...fixture.hmrUpdates, ...cssRequests, ...hmrFrames, ...failures].join('\n'),
    })
      .not
      .toBe(before.identities.css)
    const after = await readSystemArtifact(fixture, 'browser-hmr')
    await expect.poll(
      () => page.locator('#order-probe').evaluate(element => getComputedStyle(element).marginTop),
      { message: [...fixture.hmrUpdates, ...cssRequests, ...hmrFrames, ...failures].join('\n') },
    ).toBe('1px')
    expect(await loadCount(page)).toBe(loads)
    await expect.poll(() => cssRequests.some(url => url.includes(after.identities.css)))
      .toBe(true)
    expect(failures, failures.join('\n')).toEqual([])
  }
  finally {
    await stopFixture(fixture)
  }
})

test('a system layer-order edit applies without a reload', async ({ page }) => {
  const fixture = await startFixture('/dashboard/', { alternateLayerProbe: true })
  try {
    const alternate = join(fixture.appRoot, 'alternate.ts')
    const { failures } = await loadFixture(page, fixture)
    const loads = await loadCount(page)
    await expect.poll(() => page.locator('#fourth').evaluate(element => getComputedStyle(element).padding))
      .toBe('2px')

    const source = await readFile(alternate, 'utf8')
    await writeFile(alternate, source.replace(
      '.consolidate({ prefix: \'browser-hmr-alternate\' })',
      '.consolidate({ prefix: \'browser-hmr-alternate\', layerOrder: [\'tokens\', \'recipes\', \'reset\', \'utilities\', \'overrides\'] })',
    ))
    emitHostFileChange(fixture.server, alternate)

    await expect.poll(() => page.locator('#fourth').evaluate(element => getComputedStyle(element).padding), {
      timeout: 10_000,
      message: fixture.hmrUpdates.join('\n'),
    }).toBe('0px')
    expect(await loadCount(page)).toBe(loads)
    expect(failures, failures.join('\n')).toEqual([])
  }
  finally {
    await stopFixture(fixture)
  }
})

test('documentation-only package edits refresh docs without requesting CSS', async ({ page }) => {
  const fixture = await startFixture('/dashboard/')
  try {
    const { cssRequests, failures } = await loadFixture(page, fixture)
    const loads = await loadCount(page)
    const before = await readSystemArtifact(fixture, 'browser-hmr')
    const requestsBefore = [...cssRequests]
    const source = await readFile(fixture.system, 'utf8')
    await fixture.server.watcher.unwatch(fixture.system)
    await writeFile(fixture.system, source.replaceAll('system-docs-v1', 'system-docs-v2'))
    emitHostFileChange(fixture.server, fixture.system)

    await expect.poll(async () => (await readSystemArtifact(fixture, 'browser-hmr')).identities.docs)
      .not
      .toBe(before.identities.docs)
    const after = await readSystemArtifact(fixture, 'browser-hmr')
    expect(after.identities).toMatchObject({
      css: before.identities.css,
      compatibility: before.identities.compatibility,
      runtime: before.identities.runtime,
    })
    expect(cssRequests).toEqual(requestsBefore)
    expect(await loadCount(page)).toBe(loads)
    expect(await page.locator('#second').evaluate(element => getComputedStyle(element).color))
      .toBe('rgb(119, 136, 153)')
    expect(failures, failures.join('\n')).toEqual([])
  }
  finally {
    await stopFixture(fixture)
  }
})

test('one consumer can leave a shared system stylesheet while another keeps it live', async ({ page }) => {
  const fixture = await startFixture('/dashboard/')
  try {
    const { cssRequests, failures, hmrFrames } = await loadFixture(page, fixture)
    const loads = await loadCount(page)
    const oldSystemUrl = cssRequests.find(url =>
      new URL(url).pathname.includes('/.vanity/virtual/system/'))
    if (oldSystemUrl === undefined)
      throw new Error('expected the shared configured system stylesheet request')
    const alternateStyle = `import { alternate } from './alternate'

export const card = alternate.class({ color: alternate.t.color.brand, padding: '3px' })
`
    await fixture.server.watcher.unwatch(fixture.style)
    await writeFile(fixture.style, alternateStyle)
    emitHostFileChange(fixture.server, fixture.style)
    await expect.poll(() => fixture.hmrUpdates.some(update => update.startsWith(fixture.style)), {
      message: fixture.hmrUpdates.join('\n'),
    }).toBe(true)
    await expect.poll(
      () => page.locator('#first').evaluate(element => getComputedStyle(element).padding),
      { message: [...failures, ...hmrFrames].join('\n') },
    )
      .toBe('3px')
    expect(await page.locator('#first').evaluate(element => getComputedStyle(element).color))
      .toBe('rgb(170, 0, 187)')
    expect(await page.locator('#second').evaluate(element => getComputedStyle(element).color))
      .toBe('rgb(119, 136, 153)')
    const retainedCss = await page.evaluate(async (url) => {
      const response = await fetch(url)
      return { status: response.status, css: await response.text() }
    }, oldSystemUrl)
    expect(retainedCss.status).toBe(200)
    expect(retainedCss.css).toContain('#112233')

    const source = await readFile(fixture.theme, 'utf8')
    await fixture.server.watcher.unwatch(fixture.theme)
    await writeFile(fixture.theme, source.replace('#112233', '#445566'))
    emitHostFileChange(fixture.server, fixture.theme)
    await expect.poll(() => fixture.hmrUpdates.some(update =>
      update.startsWith(fixture.theme) && update.includes(fixture.secondStyle)))
      .toBe(true)
    await page.evaluate(() => (globalThis as any).__vanityRuntime.t.color.brand.$unset())
    await expect.poll(() => page.locator('#second').evaluate(element => getComputedStyle(element).color))
      .toBe('rgb(68, 85, 102)')
    expect(await page.locator('#first').evaluate(element => getComputedStyle(element).color))
      .toBe('rgb(170, 0, 187)')
    expect(await page.locator('#first').evaluate(element => getComputedStyle(element).padding))
      .toBe('3px')
    expect(await loadCount(page)).toBe(loads)
  }
  finally {
    await stopFixture(fixture)
  }
})

for (const afterHotUpdate of [false, true]) {
  test(`a system dependency failure keeps last-good browser CSS and repairs without restart (${afterHotUpdate ? 'after a hot update' : 'before the first hot update'})`, async ({ page }) => {
    const fixture = await startFixture('/dashboard/', { unloadedStyleDelayMs: 600 })
    try {
      // A slow unloaded consumer keeps compilation in flight after the
      // page's own styles are ready; recovery must still reload only once.
      await fixture.server.transformRequest('/unloaded.css.ts')
      // Prepare CSS before the client connects, so initial compilation
      // notifications cannot consume Vite's first browser hot update.
      const host = createViteHmrHost({ root: fixture.appRoot, base: fixture.base, server: fixture.server })
      for (const source of [fixture.style, fixture.secondStyle, fixture.outsideStyle])
        await fixture.server.transformRequest(host.getGraphModuleUrl(source))
      const { cssRequests } = await loadFixture(page, fixture)
      const loads = await loadCount(page)
      if (afterHotUpdate) {
        const source = await readFile(fixture.style, 'utf8')
        await writeFile(fixture.style, source.replace('padding: \'1px\'', 'padding: \'2px\''))
        await expect.poll(() => page.locator('#first').evaluate(element => getComputedStyle(element).padding))
          .toBe('2px')
        expect(await loadCount(page)).toBe(loads)
      }
      const before = await page.locator('#first').evaluate(element => getComputedStyle(element).color)
      await page.evaluate(() => (globalThis as any).__vanityRuntime.t.color.brand.$unset())
      await expect.poll(() => page.locator('#first').evaluate(element => getComputedStyle(element).color))
        .toBe('rgb(17, 34, 51)')
      const identitiesBefore = (await readSystemArtifact(fixture, 'browser-hmr')).identities
      await fixture.server.watcher.unwatch(fixture.theme)
      await writeFile(fixture.theme, 'throw new Error(\'fixture dependency failure\')\n')
      emitHostFileChange(fixture.server, fixture.theme)

      await expect(page.locator('vite-error-overlay')).toContainText('fixture dependency failure')
      expect(await page.locator('#first').evaluate(element => getComputedStyle(element).color))
        .toBe('rgb(17, 34, 51)')
      expect(await loadCount(page)).toBe(loads)

      await fixture.server.watcher.unwatch(fixture.theme)
      await writeFile(fixture.theme, 'export const brand = \'#445566\'\n')
      emitHostFileChange(fixture.server, fixture.theme)
      await expect.poll(async () => (await readSystemArtifact(fixture, 'browser-hmr')).identities.css)
        .not
        .toBe(identitiesBefore.css)
      // An incidental overlay reload can finish while compilation is still
      // running. Wait for the completed generation's native reload as well.
      await page.waitForFunction(() => {
        const target = Number(sessionStorage.getItem('vanity-browser-reload-target'))
        return target > 0 && Number(sessionStorage.getItem('vanity-browser-loads')) >= target
      })
      await expect.poll(() => page.locator('#first').evaluate(element => getComputedStyle(element).color))
        .toBe('rgb(119, 136, 153)')
      await expect.poll(() => loadCount(page)).toBe(loads + 1)
      await expect(page.locator('vite-error-overlay')).toHaveCount(0)
      await expect.poll(async () => {
        const identity = (await readSystemArtifact(fixture, 'browser-hmr')).identities.css
        return cssRequests.some(url => url.includes(identity))
      })
        .toBe(true)
      await page.evaluate(() => (globalThis as any).__vanityRuntime.t.color.brand.$unset())
      await expect.poll(() => page.locator('#first').evaluate(element => getComputedStyle(element).color))
        .toBe('rgb(68, 85, 102)')
      expect(before).toBe('rgb(119, 136, 153)')
      expect(await loadCount(page)).toBe(loads + 1)
    }
    finally {
      await stopFixture(fixture)
    }
  })
}

test('an incompatible style export change triggers the documented browser reload', async ({ page }) => {
  const fixture = await startFixture('/dashboard/')
  try {
    const { failures } = await loadFixture(page, fixture)
    const loads = await loadCount(page)
    const source = await readFile(fixture.style, 'utf8')
    const reload = page.waitForNavigation({ waitUntil: 'networkidle' })
    await writeFile(fixture.style, `${source}\nexport const secondary = ds.class({ margin: '2px' })\n`)

    await reload
    expect(await loadCount(page)).toBe(loads + 1)
    await expect(page.locator('#first')).toHaveCSS('padding', '1px')
    expect(await page.locator('#first').evaluate(element => getComputedStyle(element).color))
      .toBe('rgb(119, 136, 153)')
    expect(failures, failures.join('\n')).toEqual([])
  }
  finally {
    await stopFixture(fixture)
  }
})

test('a failed first style request can be repaired and fetched on the same non-root server', async ({ page }) => {
  const fixture = await startFixture('/dashboard/')
  try {
    const { failures, cssRequests } = await loadFixture(page, fixture)
    const firstStatus = await page.evaluate(async () => (await fetch('./broken.css.ts?first-attempt')).status)
    expect(firstStatus).toBeGreaterThanOrEqual(400)
    const failureCount = failures.length

    const recoveredDocument = page.waitForNavigation({ waitUntil: 'networkidle' })
    await writeFile(fixture.brokenStyle, `import { ds } from '@fixture/design/system'

export const broken = ds.class({ color: ds.t.color.brand, padding: '7px' })
`)
    await recoveredDocument
    await expect(page.locator('#first')).toBeVisible()
    const repairedUrl = `${fixture.base}broken.css.ts?repaired`
    await expect.poll(async () => page.evaluate(async url => (await fetch(url)).status, repairedUrl))
      .toBe(200)
    await expect(page.locator('#first')).toBeVisible()
    const cssRequestsBeforeRepairImport = cssRequests.length
    const brokenClass = await page.evaluate(async (url) => {
      const module = await import(url)
      const element = document.createElement('div')
      element.id = 'repaired'
      element.className = module.broken
      document.body.append(element)
      return module.broken as string
    }, repairedUrl)
    expect(brokenClass).toBeTruthy()
    await expect(page.locator('#repaired')).toHaveCSS('padding', '7px')
    expect(cssRequests.length).toBeGreaterThan(cssRequestsBeforeRepairImport)
    expect(cssRequests.slice(cssRequestsBeforeRepairImport)
      .some(url => new URL(url).pathname.startsWith('/dashboard/'))).toBe(true)
    expect(failures.slice(failureCount), failures.slice(failureCount).join('\n')).toEqual([])
  }
  finally {
    await stopFixture(fixture)
  }
})

test('accepted identifier spellings preserve rules and direct/prebuilt axis runtime carriers through DOM and SSR', async ({ page }) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-identifiers-browser-')))
  let server: ViteDevServer | undefined
  const cases = [
    ['unset', 'unset'],
    ['-x', '-x'],
    ['--x', '--x'],
    ['é', 'é'],
    [String.raw`\64 ensity`, 'density'],
    [String.raw`\31 st`, '1st'],
    [String.raw`\61 `, 'a'],
    [String.raw`a\20 b`, 'a b'],
    [String.raw`a\;b`, 'a;b'],
    [String.raw`a\"b`, 'a"b'],
    [String.raw`a\'b`, 'a\'b'],
  ] as const
  const mounts = cases.flatMap(([name]) => [false, true].map(prebuilt => ({ name: String(name), prebuilt, native: false, mode: 'compact' })))
  mounts.push({ name: String.raw`\43 olorScheme`, prebuilt: true, native: true, mode: 'dark' }, { name: String.raw`scheme\20 mode`, prebuilt: true, native: true, mode: 'dark' })
  for (const name of ['__proto__', 'constructor', 'toString', 'ordinary']) {
    for (const prebuilt of [false, true]) mounts.push({ name, prebuilt, native: false, mode: name })
  }
  try {
    await put(root, 'package.json', '{"name":"identifier-browser","type":"module"}')
    const imports: string[] = []
    const classes: string[] = []
    const controls: string[] = []
    const snapshots: string[] = []
    const systems: string[] = []
    for (const [index, { name, prebuilt, native, mode }] of mounts.entries()) {
      const key = JSON.stringify(name)
      const prefix = `identifier-${index}`
      const modeKey = JSON.stringify(mode)
      const mount = native
        ? `.addAxis(${key}, colorSchemes({ locality: 'root' }))`
        : !prebuilt
            ? `.addAxis(${key}, { modes: { base: '&', [${modeKey}]: ${name === String.raw`a\20 b` ? `schemeIs('dark', ${key})` : 'thisMode'} }, default: 'base' })`
            : `.addAxes({ [${key}]: axis({ modes: { base: defaultMode(), [${modeKey}]: axisData(${key}, ${modeKey}) } }) })`
      await put(root, `system-${index}.ts`, `import { createSystem, thisMode, axis, defaultMode, colorSchemes, schemeIs } from '@mszr/vanity'; import { createAxisData as axisData } from '${join(sdkRoot, 'src/system/axes.ts')}';
export const ds = createSystem()${mount}.addTokens(h => ({ ink: h.tdef.color({ ${native ? 'val: h.lightDark(\'black\', \'red\')' : `val: 'black', axes: { [${key}]: { [${modeKey}]: 'red' } }`} }) })).consolidate({ prefix: '${prefix}', root: '#card-${index}', layerOrder: ['reset', 'tokens', 'recipes', 'utilities', 'overrides', ${key}] });`)
      systems.push(`./system-${index}.ts`)
      imports.push(`import { ds as ds${index} } from './system-${index}'`)
      classes.push(`ds${index}.inLayer(${key}).class({ color: ds${index}.t.ink })`)
      snapshots.push(`ds${index}.runtimeProps(ds${index}.snapshotFrom(rt => rt.axes[${key}].$switchTo(${modeKey}))).$system.attributes`)
      controls.push(`{ const snapshot = ds${index}.snapshotFrom(rt => rt.axes[${key}].$switchTo(${modeKey})); const props = ds${index}.runtimeProps(snapshot).$system; for (const [key, value] of Object.entries(props.attributes)) document.getElementById('card-${index}').setAttribute(key, value); }`)
    }
    await put(root, 'cards.css.ts', `${imports.join(';\n')}; export const cards = [${classes.join(',')}];`)
    await put(root, 'main.ts', `${imports.join(';\n')}; import { cards } from './cards.css.ts';
cards.forEach((card, index) => { const node = document.createElement('p'); node.id = 'card-' + index; node.className = card; node.textContent = 'card'; document.body.append(node); });
const button = document.createElement('button'); button.textContent = 'Compact'; button.onclick = () => { ${controls.join('\n')} }; document.body.append(button);`)
    await put(root, 'index.html', '<!doctype html><html><head></head><body><script type="module" src="/main.ts"></script></body></html>')
    await put(root, 'ssr.ts', `import { createSSRApp, h } from 'vue'; import { renderToString } from 'vue/server-renderer'; ${imports.join(';\n')}; import { cards } from './cards.css.ts';
export const render = () => renderToString(createSSRApp({ render: () => h('div', [${snapshots.join(',')}].map((attributes, index) => h('p', { id: 'card-' + index, class: cards[index], ...attributes }, 'card'))) }));`)
    server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system: systems } })], resolve: { alias: { ...alias, vue: join(sdkRoot, 'node_modules/vue') } }, optimizeDeps: { noDiscovery: true }, server: { host: '127.0.0.1', port: 0, watch: null } })
    await server.listen()
    await page.goto(server.resolvedUrls!.local[0]!, { waitUntil: 'networkidle' })
    for (let index = 0; index < mounts.length; index++)
      await expect(page.locator(`#card-${index}`)).toHaveCSS('color', 'rgb(0, 0, 0)')
    await page.getByRole('button', { name: 'Compact' }).click()
    for (let index = 0; index < mounts.length; index++)
      await expect(page.locator(`#card-${index}`)).toHaveCSS('color', 'rgb(255, 0, 0)')
    const selectors = await page.evaluate(() => {
      const collect = (rules: CSSRuleList): string[] => [...rules].flatMap(rule => [
        ...('selectorText' in rule ? [(rule as CSSStyleRule).selectorText] : []),
        ...('cssRules' in rule ? collect((rule as CSSGroupingRule).cssRules) : []),
      ])
      return [...document.styleSheets].flatMap(sheet => collect(sheet.cssRules))
    })
    for (let index = 0; index < mounts.length; index++) {
      const className = await page.locator(`#card-${index}`).getAttribute('class')
      expect(selectors).toContain(`.${className}`)
    }
    const styles = await page.locator('style').evaluateAll(nodes => nodes.map(node => node.outerHTML).join('\n'))
    const ssr = await server.ssrLoadModule('/ssr.ts')
    await page.setContent(`${styles}${await ssr.render()}`)
    for (let index = 0; index < mounts.length; index++)
      await expect(page.locator(`#card-${index}`)).toHaveCSS('color', 'rgb(255, 0, 0)')
  }
  finally {
    await server?.close()
    await rm(root, { recursive: true, force: true })
  }
})
