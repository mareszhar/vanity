import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { evaluateStyleModule } from '../compiler/modules/evaluate'
import { getStyleModuleFile, hasStyleModuleFile, requireStyleModuleFile } from '../css/context'
import { VanityError } from '../diagnostics'
import { substrate } from './index'
import { createVanillaExtractSubstrate } from './vanilla-extract/adapter'

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
      'compiler/modules/capture.ts',
      'compiler/modules/build.ts',
      'compiler/modules/evaluate.ts',
      'compiler/projection/systemCss.ts',
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

  it('restores an enclosing scope and its identifier counter after nested failure', () => {
    const scope = { filePath: 'src/substrate/recovery.css.ts', packageName: '@vanity/fixture' }
    const expected = substrate.modules.runInFileScope(scope, () => {
      substrate.css.createCustomProperty('before')
      return substrate.css.createCustomProperty('after')
    })

    const recovered = substrate.modules.runInFileScope(scope, () => {
      substrate.css.createCustomProperty('before')
      expect(() => substrate.modules.runInFileScope(
        { filePath: 'src/substrate/nested.css.ts', packageName: '@vanity/fixture' },
        () => {
          // Model a generated source scope whose end call is skipped by a
          // throw. The transaction must drain it without touching `scope`.
          substrate.backend.setFileScope({ filePath: 'src/substrate/generated.css.ts', packageName: '@vanity/fixture' })
          throw new Error('nested failure')
        },
      )).toThrow('nested failure')
      expect(getStyleModuleFile()).toEqual(scope)
      return substrate.css.createCustomProperty('after')
    })

    expect(recovered).toBe(expected)
    expect(hasStyleModuleFile()).toBe(false)
  })

  it('restores an empty boundary after a failure before and after authoring', () => {
    expect(() => substrate.modules.runInFileScope(
      { filePath: 'src/substrate/early-failure.css.ts' },
      () => { throw new Error('early failure') },
    )).toThrow('early failure')
    expect(hasStyleModuleFile()).toBe(false)

    expect(() => substrate.modules.runInFileScope(
      { filePath: 'src/substrate/late-failure.css.ts' },
      () => {
        substrate.css.createCustomProperty('late')
        throw new Error('late failure')
      },
    )).toThrow('late failure')
    expect(hasStyleModuleFile()).toBe(false)
    expect(() => requireStyleModuleFile('after recovery')).toThrow(/VANITY_VITE_PLUGIN_MISSING/)

    const first = substrate.modules.runInFileScope(
      { filePath: 'src/substrate/repeat.css.ts' },
      () => substrate.css.createCustomProperty('repeat'),
    )
    const second = substrate.modules.runInFileScope(
      { filePath: 'src/substrate/repeat.css.ts' },
      () => substrate.css.createCustomProperty('repeat'),
    )
    expect(first).toBe(second)
  })

  it('restores state when an imported style dependency throws', () => {
    const dependency = {
      fail: () => {
        substrate.backend.setFileScope({ filePath: 'src/substrate/imported.css.ts' })
        throw new Error('imported style failure')
      },
    }

    expect(() => evaluateStyleModule(
      `const { fail } = require('nested-style')
fail()
`,
      resolve('src/substrate/importing.css.ts'),
      'debug',
      new Map([['nested-style', dependency]]),
    )).toThrow('imported style failure')
    expect(hasStyleModuleFile()).toBe(false)

    const recovered = evaluateStyleModule(
      'module.exports = { recovered: true }\n',
      resolve('src/substrate/recovered.css.ts'),
      'debug',
    )
    expect(recovered.exports).toEqual({ recovered: true })
    expect(hasStyleModuleFile()).toBe(false)
    expect(() => requireStyleModuleFile('after imported recovery')).toThrow(/VANITY_VITE_PLUGIN_MISSING/)
  })

  it('restores shared backend state across independent compiler instances', () => {
    const first = createVanillaExtractSubstrate()
    const second = createVanillaExtractSubstrate()
    const outer = { filePath: 'src/substrate/first.css.ts', packageName: '@vanity/first' }

    expect(() => first.modules.runInFileScope(outer, () =>
      second.modules.runInFileScope(
        { filePath: 'src/substrate/second.css.ts', packageName: '@vanity/second' },
        () => {
          second.backend.setFileScope({ filePath: 'src/substrate/generated.css.ts', packageName: '@vanity/second' })
          throw new Error('second compiler failure')
        },
      ))).toThrow('second compiler failure')
    expect(hasStyleModuleFile()).toBe(false)

    const firstName = first.modules.runInFileScope(outer, () => first.css.createCustomProperty('shared'))
    const secondName = second.modules.runInFileScope(outer, () => second.css.createCustomProperty('shared'))
    expect(secondName).toBe(firstName)
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
