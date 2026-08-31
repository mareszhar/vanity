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

const roots: string[] = []

afterEach(async () => {
  wxt.addViteConfig.mockClear()
  wxt.defineWxtModule.mockClear()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('wxt integration', () => {
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
