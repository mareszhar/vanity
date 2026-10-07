import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VanityError } from './diagnostics'
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

const vite = vi.hoisted(() => ({ vanityPlugin: vi.fn() }))

vi.mock('./vite', async () => {
  const actual = await vi.importActual<typeof import('./vite')>('./vite')
  vite.vanityPlugin.mockImplementation(actual.vanityPlugin)
  return { ...actual, vanityPlugin: vite.vanityPlugin }
})

const roots: string[] = []

afterEach(async () => {
  nuxtKit.addImports.mockClear()
  nuxtKit.addPluginTemplate.mockClear()
  nuxtKit.addTypeTemplate.mockClear()
  nuxtKit.addVitePlugin.mockClear()
  nuxtKit.resolveAlias.mockClear()
  vite.vanityPlugin.mockClear()
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

  it('rejects a global collision between style and app auto-imports', async () => {
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
      autoImports: { style: './authoring.ts', app: './runtime.ts' },
    }, nuxt as never)).rejects.toThrow(
      /VANITY_AUTO_IMPORT_INVALID[\s\S]*auto-import 'ds' is exposed by different autoImports module roles/,
    )
  })

  it('projects one shared source into Nuxt style and application module roles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vanity-nuxt-'))
    roots.push(root)
    await writeFile(join(root, 'authoring.ts'), 'export const ds = {}\n')

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

    await vanityNuxtModule({ autoImports: { shared: './authoring.ts' } }, nuxt as never)

    expect(nuxtKit.addImports).toHaveBeenCalledWith([{ name: 'ds', from: join(root, 'authoring.ts') }])
    const template = nuxtKit.addTypeTemplate.mock.calls
      .find(([options]) => options.filename === 'vanity-style-auto-imports.d.ts')?.[0]
    expect(template?.getContents()).not.toContain('var ds:')
    expect(template?.getContents()).toContain('declare global')
  })
})

describe('nuxt compiler.system', () => {
  async function createNuxt() {
    const root = await mkdtemp(join(tmpdir(), 'vanity-nuxt-'))
    roots.push(root)
    return {
      root,
      nuxt: {
        options: {
          _requiredModules: {},
          alias: {},
          app: { head: {} },
          dev: false,
          experimental: {},
          postcss: {},
          rootDir: root,
          srcDir: join(root, 'app'),
          typescript: { tsConfig: {} },
        },
        hook: vi.fn(),
      },
    }
  }

  it.each([
    {
      form: 'a path',
      system: './app/design/system.ts',
      expected: (root: string) => join(root, 'app/design/system.ts'),
    },
    {
      form: 'a source object',
      system: { entry: './dist/system.js', artifact: './dist/system.vanity.json', packageName: '@acme/ds', exportName: 'acme' },
      expected: (root: string) => ({
        entry: join(root, 'dist/system.js'),
        artifact: join(root, 'dist/system.vanity.json'),
        packageName: '@acme/ds',
        exportName: 'acme',
      }),
    },
    {
      form: 'an array of paths',
      system: ['./app/design/system.ts', './app/design/embedded.ts'],
      expected: (root: string) => [join(root, 'app/design/system.ts'), join(root, 'app/design/embedded.ts')],
    },
    {
      form: 'an array of source objects',
      system: [{ entry: './app/design/system.ts' }, { entry: './app/design/embedded.ts', exportName: 'embedded' }],
      expected: (root: string) => [
        { entry: join(root, 'app/design/system.ts') },
        { entry: join(root, 'app/design/embedded.ts'), exportName: 'embedded' },
      ],
    },
    {
      form: 'an array of paths, package specifiers, and source objects',
      system: ['./app/design/system.ts', '@acme/ds', { entry: '@acme/ds/embedded', artifact: '@acme/ds/embedded.vanity.json' }],
      expected: (root: string) => [
        join(root, 'app/design/system.ts'),
        '@acme/ds',
        { entry: '@acme/ds/embedded', artifact: '@acme/ds/embedded.vanity.json' },
      ],
    },
  ])('forwards $form to the Vite compiler resolved from rootDir', async ({ system, expected }) => {
    const { root, nuxt } = await createNuxt()

    await vanityNuxtModule({ compiler: { system } }, nuxt as never)

    expect(vite.vanityPlugin).toHaveBeenCalledOnce()
    expect(vite.vanityPlugin.mock.calls[0]![0].compiler.system).toEqual(expected(root))
    expect(nuxtKit.addVitePlugin).toHaveBeenCalledOnce()
  })

  it.each([
    { system: 42, path: ['compiler', 'system'] },
    { system: '', path: ['compiler', 'system'] },
    { system: { artifact: './dist/system.vanity.json' }, path: ['compiler', 'system'] },
    { system: ['./app/design/system.ts', null], path: ['compiler', 'system', '1'] },
    { system: ['./app/design/system.ts', ['./app/design/embedded.ts']], path: ['compiler', 'system', '1'] },
    { system: [{ entry: './app/design/system.ts', artifact: 1 }], path: ['compiler', 'system', '0'] },
  ])('rejects compiler.system $system as configuration', async ({ system, path }) => {
    const { nuxt } = await createNuxt()

    const error = await Promise.resolve(vanityNuxtModule({ compiler: { system: system as never } }, nuxt as never))
      .then(() => undefined, (error: unknown) => error)

    expect(error).toBeInstanceOf(VanityError)
    expect((error as VanityError).diagnostics[0]).toMatchObject({ code: 'VANITY_COMPILER_INVALID_INPUT', path })
    expect(nuxtKit.addVitePlugin).not.toHaveBeenCalled()
  })
})
