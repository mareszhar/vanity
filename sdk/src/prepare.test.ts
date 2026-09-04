import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { styleAutoImportDeclarations } from './compiler/auto-imports/autoImportDeclarations'
import { defineVanityConfig } from './config'
import { loadVanityConfig, planAutoImportDeclarations, writeAutoImportDeclarations } from './prepare'

const roots: string[] = []
const execFileAsync = promisify(execFile)

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('prepare-time auto-import declarations', () => {
  it('plans both module roles statically with portable references', async () => {
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
      },
      autoImports: {
        style: '$system',
        app: {
          presets: ['core'],
          sources: ['./styles.ts', 'design-utils'],
        },
      },
    }), { root })

    expect(plan.style?.names).toEqual(['cls', 'ds', 't'])
    expect(plan.app?.names).toEqual([
      'minTarget',
      'packageUtility',
      'ports',
      'setCustomProperties',
      'setCustomProperty',
      'visuallyHidden',
    ])
    expect(plan.app?.names).not.toContain('typeOnly')
    expect(plan.style?.declaration.text).toContain('from ../../authoring.ts')
    expect(plan.app?.declaration.text).toContain('import("../../styles.ts")')
    expect(plan.app?.declaration.text).toContain('import("design-utils").packageUtility')
    expect(plan.app?.declaration.text).not.toContain(root)
    expect(plan.style?.declaration.text).not.toContain(root)
    expect(plan.style?.declaration.typeScriptReference).toBe(true)
    expect(plan.style?.bridge.typeScriptReference).toBe(false)
    expect(plan.app?.declaration.typeScriptReference).toBe(true)
    expect(plan.bridges[0]?.text).toContain('../../../.vanity/types/')
  })

  it('writes deterministically, skips unchanged files, and removes disabled module roles', async () => {
    const root = await fixtureRoot()
    await writeFile(join(root, 'authoring.ts'), 'export const ds = {}\n')

    const options = defineVanityConfig({
      compiler: {
        system: './authoring.ts',
      },
      autoImports: { style: '$system' },
    })
    const first = await writeAutoImportDeclarations(options, { root })
    const second = await writeAutoImportDeclarations(options, { root })

    expect(first.written).toHaveLength(2)
    expect(second.written).toHaveLength(0)
    expect(second.unchanged).toHaveLength(2)

    const declaration = join(root, '.vanity/types/vanity-style-auto-imports.d.ts')
    expect(await readFile(declaration, 'utf8')).toContain('var ds:')

    const removed = await writeAutoImportDeclarations(defineVanityConfig(), { root })
    expect(removed.removed).toEqual(expect.arrayContaining([
      declaration,
      join(root, 'node_modules/@types/vanity-style-auto-imports/index.d.ts'),
    ]))
  })

  it('rejects a global collision between the two module roles', async () => {
    const root = await fixtureRoot()
    await writeFile(join(root, 'authoring.ts'), 'export const ds = {}\n')
    await writeFile(join(root, 'helpers.ts'), 'export const ds = {}\n')

    await expect(planAutoImportDeclarations(defineVanityConfig({
      compiler: { system: './authoring.ts' },
      autoImports: { style: '$system', app: './helpers.ts' },
    }), { root })).rejects.toThrow(
      /VANITY_AUTO_IMPORT_INVALID[\s\S]*auto-import 'ds' is exposed by different autoImports module roles/,
    )
  })

  it('allows one shared source to land in both module roles', async () => {
    const root = await fixtureRoot()
    await writeFile(join(root, 'authoring.ts'), 'export const ds = {}\n')

    const plan = await planAutoImportDeclarations(defineVanityConfig({
      compiler: { system: './authoring.ts' },
      autoImports: { shared: '$system' },
    }), { root })

    expect(plan.style?.declaration.text).toContain('var ds:')
    expect(plan.app?.declaration.text).toContain('var ds:')
  })

  it('rejects shared and app barrels that re-export a style module', async () => {
    const root = await fixtureRoot()
    const authoring = join(root, 'authoring.ts')
    const style = join(root, 'typefaces.css.ts')
    await writeFile(style, 'export const typefaces = { sans: "sans" }\n')
    await writeFile(authoring, 'export { typefaces } from \'./typefaces.css.ts\'\n')

    for (const autoImports of [
      { shared: './authoring.ts' },
      { app: './authoring.ts' },
    ]) {
      await expect(planAutoImportDeclarations(defineVanityConfig({ autoImports }), { root })).rejects.toThrow(
        new RegExp([
          'VANITY_APP_AUTO_IMPORT_STYLE_MODULE',
          'autoImports\\.app source \'./authoring\\.ts\'',
          style.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'fix: keep',
        ].join('[\\s\\S]*')),
      )
    }
  })

  it('keeps source-shipping ambient declarations local to their author across A → B → C', async () => {
    const root = await fixtureRoot()
    const design = join(root, 'node_modules', '@acme', 'design')
    const library = join(root, 'node_modules', '@acme', 'library')
    await mkdir(design, { recursive: true })
    await mkdir(library, { recursive: true })
    await writeFile(join(design, 'package.json'), JSON.stringify({
      name: '@acme/design',
      type: 'module',
      exports: {
        './authoring': './authoring.ts',
        './button.css': './button.css.ts',
        './vanity-style-auto-imports': './vanity-style-auto-imports.d.ts',
      },
    }))
    await writeFile(join(design, 'authoring.ts'), `
export const t = { color: { brand: '#635bff' } }
export const cls = (value: string) => value
`)
    await writeFile(join(design, 'vanity-style-auto-imports.d.ts'), styleAutoImportDeclarations([
      { from: '@acme/design/authoring', imports: ['cls', 't'] },
    ]))
    await writeFile(join(design, 'button.css.ts'), `
import type {} from '@acme/design/vanity-style-auto-imports'
export const buttonClass = cls(t.color.brand)
`)
    await writeFile(join(library, 'package.json'), JSON.stringify({
      name: '@acme/library',
      type: 'module',
      exports: './index.ts',
    }))
    await writeFile(join(library, 'index.ts'), `export { buttonClass } from '@acme/design/button.css'\n`)
    await writeFile(join(root, 'app.ts'), `import { buttonClass } from '@acme/library'\nvoid buttonClass\n`)
    await writeFile(join(root, 'host-auto-imports.d.ts'), styleAutoImportDeclarations([
      { from: '@acme/design/authoring', imports: ['cls', 't'] },
    ]))

    // B typechecks A's shipped source without a Vanity config, `types`
    // entry, or a dependency on Vanity. C may independently generate the
    // same `declare var` declarations without a redeclaration failure.
    expect(typeErrors([join(library, 'index.ts')])).toEqual([])
    expect(typeErrors([join(root, 'app.ts'), join(root, 'host-auto-imports.d.ts')])).toEqual([])
  })

  it('runs prepare before packing a source-shipping type-only unlock', async () => {
    const root = await fixtureRoot()
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, '.gitignore'), '.vanity/\n')
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: '@acme/design',
      version: '1.0.0',
      type: 'module',
      files: ['src', '.vanity/types/vanity-style-auto-imports.d.ts'],
      exports: {
        './authoring': './src/authoring.ts',
        './vanity-style-auto-imports': {
          types: './.vanity/types/vanity-style-auto-imports.d.ts',
        },
      },
    }))
    await writeFile(join(root, 'src', 'authoring.ts'), 'export const ds = {}\n')

    await writeAutoImportDeclarations(defineVanityConfig({
      compiler: { system: './src/authoring.ts' },
      autoImports: { style: '$system' },
    }), { root })

    const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: root,
      env: { ...process.env, npm_config_cache: join(root, '.npm-cache') },
    })
    const packed = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }>
    expect(packed[0]?.files.map(file => file.path)).toContain('.vanity/types/vanity-style-auto-imports.d.ts')
  })

  it('reports a missing config with a direct fix', async () => {
    const root = await fixtureRoot()
    const path = join(root, 'vanity.config.ts')

    await expect(loadVanityConfig(path)).rejects.toThrow(new RegExp([
      'VANITY_CONFIG_INVALID',
      `no Vanity config found at ${path}`,
      'fix: create vanity.config.ts, pass --config <path>, or use the programmatic preparation API',
    ].map(value => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*')))
  })

  it('resolves system and config package specifiers instead of treating them as root paths', async () => {
    const root = await fixtureRoot()
    await mkdir(join(root, 'node_modules', 'design-system'), { recursive: true })
    await mkdir(join(root, 'node_modules', 'design-config'), { recursive: true })
    await writeFile(join(root, 'node_modules', 'design-system', 'package.json'), JSON.stringify({
      name: 'design-system',
      type: 'module',
      exports: './system.ts',
    }))
    await writeFile(join(root, 'node_modules', 'design-system', 'system.ts'), 'export const ds = {}\n')
    await writeFile(join(root, 'node_modules', 'design-config', 'package.json'), JSON.stringify({
      name: 'design-config',
      type: 'module',
      exports: './vanity.config.ts',
    }))
    await writeFile(join(root, 'node_modules', 'design-config', 'vanity.config.ts'), 'export default { compiler: { system: "design-system" } }\n')

    const plan = await planAutoImportDeclarations(defineVanityConfig({
      compiler: { system: 'design-system' },
      autoImports: { style: '$system' },
    }), { root })

    expect(plan.style?.sources).toEqual([expect.objectContaining({ from: 'design-system' })])
    expect(await loadVanityConfig('design-config', { root })).toEqual({
      compiler: { system: 'design-system' },
    })
  })

  it('identifies a bare path as a failed package lookup', async () => {
    const root = await fixtureRoot()
    await expect(planAutoImportDeclarations(defineVanityConfig({
      compiler: { system: 'src/system.ts' },
      autoImports: { style: '$system' },
    }), { root })).rejects.toThrow(
      /VANITY_COMPILER_INVALID_INPUT[\s\S]*no package 'src\/system\.ts' is installed — did you mean '\.\/src\/system\.ts'\?/,
    )
  })

  it('fails preparation when TypeScript cannot reach generated declarations', async () => {
    const root = await fixtureRoot()
    await writeFile(join(root, 'authoring.ts'), 'export const ds = {}\n')
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { types: [] },
      files: [],
    }))

    await expect(writeAutoImportDeclarations(defineVanityConfig({
      compiler: { system: './authoring.ts' },
      autoImports: { style: '$system' },
    }), { root })).rejects.toThrow(new RegExp([
      'VANITY_AUTO_IMPORT_DECLARATIONS_NOT_INCLUDED',
      join(root, 'tsconfig.json'),
      '\'vanity-style-auto-imports\'',
    ].map(value => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*')))

    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { types: ['vanity-style-auto-imports'] },
      files: [],
    }))
    await expect(writeAutoImportDeclarations(defineVanityConfig({
      compiler: { system: './authoring.ts' },
      autoImports: { style: '$system' },
    }), { root })).resolves.toMatchObject({ written: [] })
  })
})

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vanity-prepare-'))
  roots.push(root)
  await writeFile(join(root, 'package.json'), '{ "name": "vanity-prepare-fixture", "type": "module" }')
  return root
}

function typeErrors(files: string[]): string[] {
  const program = ts.createProgram({
    rootNames: files,
    options: {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      strict: true,
      types: [],
    },
  })
  return ts.getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
}
