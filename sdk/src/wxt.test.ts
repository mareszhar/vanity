import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface WxtTypeEntry {
  path: string
  text: string
  tsReference: boolean
}

interface WxtContext {
  config: { root: string, wxtDir: string }
  hook: (name: string, callback: PrepareTypesHook) => void
}

type PrepareTypesHook = (context: WxtContext, entries: WxtTypeEntry[]) => Promise<void>

interface WxtModule {
  setup: (context: WxtContext, options?: unknown) => Promise<void>
}

const wxt = vi.hoisted(() => ({
  addViteConfig: vi.fn(),
  defineWxtModule: vi.fn((module: unknown) => module),
}))

vi.mock('wxt/modules', () => wxt)

const vite = vi.hoisted(() => ({ vanityPlugin: vi.fn() }))

vi.mock('./vite', async () => {
  const actual = await vi.importActual<typeof import('./vite')>('./vite')
  vite.vanityPlugin.mockImplementation(actual.vanityPlugin)
  return { ...actual, vanityPlugin: vite.vanityPlugin }
})

const roots: string[] = []

afterEach(async () => {
  vite.vanityPlugin.mockClear()
  wxt.addViteConfig.mockClear()
  wxt.defineWxtModule.mockClear()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('wxt integration', () => {
  it.each([
    { system: './app/design/system.ts' },
    { system: { entry: './dist/system.js', artifact: './dist/system.vanity.json', exportName: 'ds' } },
    { system: ['./app/design/system.ts', './app/design/embedded.ts'] },
    { system: [{ entry: './app/design/system.ts' }, { entry: '@acme/ds', artifact: '@acme/ds/system.vanity.json' }] },
    { system: ['./app/design/system.ts', { entry: './app/design/embedded.ts' }] },
  ])('forwards compiler.system %j unchanged to the Vite compiler', async ({ system }) => {
    const { default: module } = await import('./wxt')
    const context: WxtContext = {
      config: { root: '/project', wxtDir: '/project/.wxt' },
      hook: vi.fn(),
    }
    await (module as unknown as WxtModule).setup(context, { compiler: { system } })
    const config = wxt.addViteConfig.mock.calls[0]![1]()
    expect(config.plugins).toBeDefined()
    expect(vite.vanityPlugin).toHaveBeenCalledWith({ compiler: { system } })
  })

  it.each([42, '', { artifact: './system.json' }, ['./system.ts', null], [{ entry: './system.ts', exportName: false }]])('rejects malformed compiler.system %j at module setup', async (system) => {
    const { default: module } = await import('./wxt')
    const context: WxtContext = {
      config: { root: '/project', wxtDir: '/project/.wxt' },
      hook: vi.fn(),
    }
    await expect((module as unknown as WxtModule).setup(context, { compiler: { system } })).rejects.toThrow(expect.objectContaining({
      diagnostics: [expect.objectContaining({ code: 'VANITY_COMPILER_INVALID_INPUT', fix: expect.objectContaining({ message: expect.any(String) }) })],
    }))
    expect(wxt.addViteConfig).not.toHaveBeenCalled()
  })

  it('projects the shared declaration plan through prepare:types', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vanity-wxt-'))
    roots.push(root)
    await writeFile(join(root, 'authoring.ts'), 'export const ds = {}\n')

    const { default: module } = await import('./wxt')
    const hooks = new Map<string, PrepareTypesHook>()
    const context: WxtContext = {
      config: { root, wxtDir: join(root, '.wxt') },
      hook: (name, callback) => hooks.set(name, callback),
    }
    const options = {
      compiler: { system: './authoring.ts' },
      autoImports: { shared: '$system' },
    }

    await (module as unknown as WxtModule).setup(context, options)
    expect(wxt.addViteConfig).toHaveBeenCalledWith(context, expect.any(Function))

    const entries: WxtTypeEntry[] = []
    await hooks.get('prepare:types')!(context, entries)
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: join(root, '.wxt', 'types', 'vanity-style-auto-imports.d.ts'),
        tsReference: true,
        text: expect.stringContaining('declare global'),
      }),
      expect.objectContaining({
        path: join(root, '.wxt', 'types', 'vanity-app-auto-imports.d.ts'),
        tsReference: true,
        text: expect.stringContaining('var ds:'),
      }),
    ]))
  })

  it('loads the conventional vanity.config.ts when WXT receives only the module entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vanity-wxt-config-'))
    roots.push(root)
    await writeFile(join(root, 'authoring.ts'), 'export const ds = {}\n')
    await writeFile(join(root, 'vanity.config.ts'), `
export default {
  compiler: { system: './authoring.ts' },
  autoImports: { shared: '$system' },
}
`)

    const { default: module } = await import('./wxt')
    const hooks = new Map<string, PrepareTypesHook>()
    const context: WxtContext = {
      config: { root, wxtDir: join(root, '.wxt') },
      hook: (name, callback) => hooks.set(name, callback),
    }

    await (module as unknown as WxtModule).setup(context, {})
    const entries: WxtTypeEntry[] = []
    await hooks.get('prepare:types')!(context, entries)
    expect(entries[0]?.text).toContain('var ds:')
  })
})
