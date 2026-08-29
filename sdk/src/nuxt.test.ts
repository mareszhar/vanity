import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import vanityNuxtModule from './nuxt'

const nuxtKit = vi.hoisted(() => ({
  addImports: vi.fn(),
  addPluginTemplate: vi.fn(),
  addTypeTemplate: vi.fn(({ filename, getContents }: { filename: string, getContents: () => string }) => ({
    dst: `/tmp/${filename}`,
    getContents,
  })),
  addVitePlugin: vi.fn(),
  resolveAlias: vi.fn((path: string) => path),
}))

vi.mock('@nuxt/kit', async () => ({
  ...await vi.importActual<typeof import('@nuxt/kit')>('@nuxt/kit'),
  ...nuxtKit,
}))

const roots: string[] = []

afterEach(async () => {
  nuxtKit.addImports.mockClear()
  nuxtKit.addPluginTemplate.mockClear()
  nuxtKit.addTypeTemplate.mockClear()
  nuxtKit.addVitePlugin.mockClear()
  nuxtKit.resolveAlias.mockClear()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('nuxt auto-import integration', () => {
  it('publishes documented Nuxt config types for the generated schema', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vanity-nuxt-'))
    roots.push(root)

    const nuxt = {
      options: {
        _requiredModules: {},
        alias: {},
        dev: false,
        experimental: {},
        postcss: {},
        rootDir: root,
        typescript: { tsConfig: {} },
      },
      hook: vi.fn(),
    }

    await vanityNuxtModule({}, nuxt as never)

    const template = nuxtKit.addTypeTemplate.mock.calls
      .find(([options]) => options.filename === 'vanity-config.d.ts')?.[0]
    expect(template).toBeDefined()
    expect(template!.getContents()).toContain('Vanity\'s Nuxt adapter configuration')
    expect(template!.getContents()).toContain('\nexport {}\n')
    expect(template!.getContents()).toContain(
      'type VanityNuxtConfigValue = Partial<import(\'@mszr/vanity/nuxt\').VanityNuxtOptions> | false',
    )
    expect(template!.getContents()).not.toContain('Record<string, any>')
  })

  it('rejects a global collision between style and runtime auto-imports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vanity-nuxt-'))
    roots.push(root)
    await writeFile(join(root, 'authoring.ts'), 'export const ds = {}\n')
    await writeFile(join(root, 'runtime.ts'), 'export const ds = {}\n')

    const nuxt = {
      options: {
        _requiredModules: {},
        alias: {},
        dev: false,
        experimental: {},
        postcss: {},
        rootDir: root,
        typescript: { tsConfig: {} },
      },
      hook: vi.fn(),
    }

    await expect(vanityNuxtModule({
      compiler: { styleAutoImports: './authoring.ts' },
      app: { runtimeAutoImports: './runtime.ts' },
    }, nuxt as never)).rejects.toThrow(
      '[vanity] auto-import \'ds\' is exposed by both compiler.styleAutoImports and app.runtimeAutoImports',
    )
  })
})
