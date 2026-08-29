import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defineVanityConfig } from './config'
import { loadVanityConfig, planAutoImportDeclarations, writeAutoImportDeclarations } from './prepare'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('prepare-time auto-import declarations', () => {
  it('plans both lanes statically with portable references', async () => {
    const root = await fixtureRoot()
    await writeFile(join(root, 'authoring.ts'), `
export const ds = { class: () => '', t: {} }
export const cls = ds.class
export const t = ds.t
`)
    await writeFile(join(root, 'helpers.ts'), `
export const visuallyHidden = 'visually-hidden'
export const minTarget = 'min-target'
`)
    await writeFile(join(root, 'styles.ts'), `export * from './helpers.ts'\n`)
    await mkdir(join(root, 'node_modules', 'design-utils'), { recursive: true })
    await writeFile(join(root, 'node_modules', 'design-utils', 'package.json'), JSON.stringify({
      type: 'module',
      exports: {
        '.': {
          types: './types.d.ts',
          import: './index.ts',
          default: './index.ts',
        },
      },
    }))
    await writeFile(join(root, 'node_modules', 'design-utils', 'types.d.ts'), 'export declare const typeOnly: string\n')
    await writeFile(join(root, 'node_modules', 'design-utils', 'index.ts'), 'export const packageUtility = "package-utility"\n')

    const plan = await planAutoImportDeclarations(defineVanityConfig({
      compiler: {
        system: './authoring.ts',
        styleAutoImports: true,
      },
      app: {
        runtimeAutoImports: {
          presets: ['core'],
          sources: ['./styles.ts', 'design-utils'],
        },
      },
    }), { root })

    expect(plan.style?.names).toEqual(['cls', 'ds', 't'])
    expect(plan.runtime?.names).toEqual([
      'minTarget',
      'packageUtility',
      'ports',
      'setCustomProperties',
      'setCustomProperty',
      'visuallyHidden',
    ])
    expect(plan.runtime?.names).not.toContain('typeOnly')
    expect(plan.style?.declaration.text).toContain('from "../../authoring.ts"')
    expect(plan.runtime?.declaration.text).toContain('import("../../styles.ts")')
    expect(plan.runtime?.declaration.text).toContain('import("design-utils").packageUtility')
    expect(plan.runtime?.declaration.text).not.toContain(root)
    expect(plan.style?.declaration.text).not.toContain(root)
    expect(plan.style?.declaration.typeScriptReference).toBe(true)
    expect(plan.style?.bridge.typeScriptReference).toBe(false)
    expect(plan.runtime?.declaration.typeScriptReference).toBe(true)
    expect(plan.bridges[0]?.text).toContain('../../../.vanity/types/')
  })

  it('writes deterministically, skips unchanged files, and removes disabled lanes', async () => {
    const root = await fixtureRoot()
    await writeFile(join(root, 'authoring.ts'), 'export const ds = {}\n')

    const options = defineVanityConfig({
      compiler: {
        system: './authoring.ts',
        styleAutoImports: true,
      },
    })
    const first = await writeAutoImportDeclarations(options, { root })
    const second = await writeAutoImportDeclarations(options, { root })

    expect(first.written).toHaveLength(2)
    expect(second.written).toHaveLength(0)
    expect(second.unchanged).toHaveLength(2)

    const declaration = join(root, '.vanity/types/style-auto-imports.d.ts')
    expect(await readFile(declaration, 'utf8')).toContain('const ds:')

    const removed = await writeAutoImportDeclarations(defineVanityConfig(), { root })
    expect(removed.removed).toEqual(expect.arrayContaining([
      declaration,
      join(root, 'node_modules/@types/vanity-style-auto-imports/index.d.ts'),
    ]))
  })

  it('rejects a global collision between the two lanes', async () => {
    const root = await fixtureRoot()
    await writeFile(join(root, 'authoring.ts'), 'export const ds = {}\n')
    await writeFile(join(root, 'helpers.ts'), 'export const ds = {}\n')

    await expect(planAutoImportDeclarations(defineVanityConfig({
      compiler: { system: './authoring.ts', styleAutoImports: true },
      app: { runtimeAutoImports: './helpers.ts' },
    }), { root })).rejects.toThrow(
      '[vanity] auto-import \'ds\' is exposed by both compiler.styleAutoImports and app.runtimeAutoImports',
    )
  })

  it('reports a missing config with a direct fix', async () => {
    const root = await fixtureRoot()
    const path = join(root, 'vanity.config.ts')

    await expect(loadVanityConfig(path)).rejects.toThrow(
      `[vanity] no Vanity config found at ${path}\n`
      + '  fix: create vanity.config.ts, pass --config <path>, or use the programmatic preparation API',
    )
  })
})

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vanity-prepare-'))
  roots.push(root)
  await writeFile(join(root, 'package.json'), '{ "name": "vanity-prepare-fixture", "type": "module" }')
  return root
}
