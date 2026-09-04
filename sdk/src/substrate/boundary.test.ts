import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getStyleModuleFile, hasStyleModuleFile, requireStyleModuleFile } from '../css/context'
import { VanityError } from '../diagnostics'
import { substrate } from './index'

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adapterRoot = resolve(sourceRoot, 'substrate/vanilla-extract')
const coexistenceFixture = resolve(sourceRoot, 'test-support/vite-app/raw-extract.css.ts')

describe('substrate boundary', () => {
  it('keeps backend imports and dynamic requires inside the adapter', async () => {
    const violations: string[] = []

    for (const file of await sourceFiles(sourceRoot)) {
      if (file.startsWith(`${adapterRoot}/`) || file === coexistenceFixture || isTestFile(file))
        continue

      const source = await readFile(file, 'utf8')
      if (/(?:\bfrom\s|\bimport\s*\(|\brequire\s*\()\s*['"]@vanilla-extract\//.test(source))
        violations.push(relative(sourceRoot, file))
    }

    expect(violations).toEqual([])
  })

  it('keeps portable module operations separate from backend lifecycle operations', () => {
    expect(Object.keys(substrate.modules).sort()).toEqual([
      'registerFunctionSerialization',
      'runInFileScope',
      'transformStyleModule',
    ])
    expect(Object.keys(substrate.backend).sort()).toEqual([
      'addFileScope',
      'createVitePlugins',
      'finishFileScope',
      'getPackageName',
      'initialize',
      'installCapture',
      'parseFileScope',
      'removeCapture',
      'resolveModule',
      'serializeFileScope',
      'serializeStyleModule',
      'setFileScope',
    ])
    expect(Object.keys(substrate.css).sort()).toEqual([
      'createCustomProperty',
      'emitClassRule',
      'emitFontFace',
      'emitGlobalRule',
      'emitKeyframes',
      'emitLayer',
      'emitRawCss',
      'getStyleModuleFile',
      'hasStyleModuleFile',
      'registerCustomProperty',
    ])
  })

  it('keeps backend lifecycle references in the declared infrastructure boundary', async () => {
    const allowedCallers = new Set([
      'compiler/core/transform.ts',
      'compiler/modules/build.ts',
      'compiler/modules/evaluate.ts',
      'test-support/emit.ts',
      'testing.ts',
      'vite.ts',
    ])
    const unexpected: string[] = []
    const found = new Set<string>()

    for (const file of await sourceFiles(sourceRoot)) {
      if (file.startsWith(`${adapterRoot}/`) || isTestFile(file))
        continue

      const source = await readFile(file, 'utf8')
      if (!source.includes('substrate.backend'))
        continue

      const relativeFile = relative(sourceRoot, file)
      if (relativeFile.startsWith('substrate/'))
        continue
      if (!allowedCallers.has(relativeFile))
        unexpected.push(relativeFile)
      found.add(relativeFile)
    }

    expect(unexpected).toEqual([])
    expect([...allowedCallers].filter(file => !found.has(file))).toEqual([])
  })

  it('owns style-module scope queries and the missing-plugin diagnostic in CSS context', () => {
    expect(hasStyleModuleFile()).toBe(false)
    expect(getStyleModuleFile()).toBeUndefined()
    expect(() => requireStyleModuleFile('boundary')).toThrow(VanityError)
    expect(() => requireStyleModuleFile('boundary')).toThrow(/VANITY_VITE_PLUGIN_MISSING/)

    const scope = { filePath: 'src/substrate/boundary.css.ts', packageName: '@vanity/fixture' }
    substrate.modules.runInFileScope(scope, () => {
      expect(hasStyleModuleFile()).toBe(true)
      expect(getStyleModuleFile()).toEqual(scope)
      expect(requireStyleModuleFile('boundary')).toBe(scope.filePath)
    })
    expect(hasStyleModuleFile()).toBe(false)
  })
})

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory())
      files.push(...await sourceFiles(file))
    else if (entry.isFile() && file.endsWith('.ts'))
      files.push(file)
  }
  return files
}

function isTestFile(file: string): boolean {
  return file.endsWith('.test.ts') || file.endsWith('.test-d.ts')
}
