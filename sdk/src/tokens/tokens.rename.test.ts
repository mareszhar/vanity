/** End-to-end contract for the optional TypeScript rename-symbol bridge. */

import type { LanguageService, LanguageServiceHost } from 'typescript'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const initPlugin = require(resolve(process.cwd(), 'typescript.cjs')) as (modules: { typescript: typeof ts }) => {
  create: (info: { languageService: LanguageService }) => LanguageService
}

const MARK = '/*rename*/'

interface RenameFixture {
  service: LanguageService
  files: Record<string, string>
  cursor: { fileName: string, position: number }
}

function systemModularFixture(cursorFile: 'colors.ts' | 'consumer.ts'): RenameFixture {
  const marked = {
    'colors.ts': `
      import { defineTokens, oklch } from '@mszr/vanity'
      export const colors = defineTokens({ color: { ${cursorFile === 'colors.ts' ? MARK : ''}brand: oklch(0.58, 0.2, 285) } })
        .add(m => ({ color: { brandSoft: m.color.brand } }))
    `,
    'metrics.ts': `
      import { defineTokens, length } from '@mszr/vanity'
      export const metrics = defineTokens({ space: { sm: length.rem(0.5) } })
    `,
    'design.ts': `
      import { createSystem } from '@mszr/vanity'
      import { colors } from './colors'
      import { metrics } from './metrics'
      export const ds = createSystem().addTokens(colors).addTokens(metrics).consolidate()
    `,
    'consumer.ts': `
      import { ds } from './design'
      void ds.t.color.${cursorFile === 'consumer.ts' ? MARK : ''}brand
    `,
  }

  return fixtureFromSources(marked, cursorFile)
}

function unifiedFixture(cursorFile: 'tokens.ts' | 'consumer.ts'): RenameFixture {
  const marked = {
    'tokens.ts': `
      import { defineTokens } from '@mszr/vanity'
      export const colors = defineTokens()
        .add('${cursorFile === 'tokens.ts' ? MARK : ''}brand', '#635bff')
        .add('brandSoft', m => m.brand)
    `,
    'design.ts': `
      import { createSystem } from '@mszr/vanity'
      import { colors } from './tokens'
      export const ds = createSystem().addTokens(colors).consolidate()
    `,
    'consumer.ts': `
      import { ds } from './design'
      void ds.t.${cursorFile === 'consumer.ts' ? MARK : ''}brand
    `,
  }

  return fixtureFromSources(marked, cursorFile)
}

function fixtureFromSources(marked: Record<string, string>, cursorFile: string): RenameFixture {
  const project = process.cwd()
  const virtualRoot = resolve(project, '__rename__')
  const cursorSource = marked[cursorFile]
  const cursorPosition = cursorSource.indexOf(MARK)
  const files = Object.fromEntries(Object.entries(marked).map(([name, source]) => [
    resolve(virtualRoot, name),
    source.replace(MARK, ''),
  ]))
  const configPath = resolve(project, 'tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, project)
  const host: LanguageServiceHost = {
    getCompilationSettings: () => parsed.options,
    getCurrentDirectory: () => project,
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    getScriptFileNames: () => [...parsed.fileNames, ...Object.keys(files)],
    getScriptSnapshot: (name) => {
      const text = files[name] ?? ts.sys.readFile(name)
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
    },
    getScriptVersion: () => '0',
    fileExists: name => name in files || ts.sys.fileExists(name),
    readFile: name => files[name] ?? ts.sys.readFile(name),
    readDirectory: ts.sys.readDirectory,
  }
  const native = ts.createLanguageService(host)

  return {
    service: initPlugin({ typescript: ts }).create({ languageService: native }),
    files,
    cursor: {
      fileName: resolve(virtualRoot, cursorFile),
      position: cursorPosition,
    },
  }
}

function renamed(fixture: RenameFixture): string[] {
  const info = fixture.service.getRenameInfo(fixture.cursor.fileName, fixture.cursor.position)
  expect(info.canRename).toBe(true)

  return (fixture.service.findRenameLocations(fixture.cursor.fileName, fixture.cursor.position, false, false, true) ?? [])
    .filter(location => location.fileName in fixture.files)
    .map(location => `${location.fileName.split('/').at(-1)}:${fixture.files[location.fileName].slice(location.textSpan.start, location.textSpan.start + location.textSpan.length)}`)
    .sort()
}

describe('token rename-symbol', () => {
  const modularExpected = [
    'colors.ts:brand',
    'colors.ts:brand',
    'consumer.ts:brand',
  ]

  it('preserves rename identity through canonical system modules and a finalized system', () => {
    const fromDefinition = systemModularFixture('colors.ts')
    const fromConsumer = systemModularFixture('consumer.ts')

    try {
      expect(renamed(fromDefinition)).toEqual(modularExpected)
      expect(renamed(fromConsumer)).toEqual(modularExpected)
    }
    finally {
      fromDefinition.service.dispose()
      fromConsumer.service.dispose()
    }
  })

  it('preserves rename identity through unified add() definitions, refs, and consumers', () => {
    const expected = [
      'consumer.ts:brand',
      'tokens.ts:brand',
      'tokens.ts:brand',
    ]
    const fromDefinition = unifiedFixture('tokens.ts')
    const fromConsumer = unifiedFixture('consumer.ts')

    try {
      expect(renamed(fromDefinition)).toEqual(expected)
      expect(renamed(fromConsumer)).toEqual(expected)
    }
    finally {
      fromDefinition.service.dispose()
      fromConsumer.service.dispose()
    }
  })

  it('reports source-shipping ambient use and application-module emitter misuse at the cursor', () => {
    const ambient = fixtureFromSources({
      'ambient.d.ts': `/* generated by vanity */
declare global { var cls: typeof import('@mszr/vanity').createSystem }
export {}
`,
      'button.css.ts': 'void cls\n',
      'component.ts': 'void ds.class({})\n',
    }, 'button.css.ts')

    try {
      const button = resolve(process.cwd(), '__rename__', 'button.css.ts')
      const component = resolve(process.cwd(), '__rename__', 'component.ts')
      const ambientDiagnostics = ambient.service.getSemanticDiagnostics(button)
      const componentDiagnostics = ambient.service.getSemanticDiagnostics(component)

      expect(ambientDiagnostics).toContainEqual(expect.objectContaining({
        code: 990001,
        category: ts.DiagnosticCategory.Suggestion,
        messageText: 'VANITY_AMBIENT_SOURCE_DECLARATION: @mszr/vanity ships this style source; consumers compiling it need these declarations unless each consumer configures Vanity.',
      }))
      expect(componentDiagnostics).toContainEqual(expect.objectContaining({
        code: 990002,
        category: ts.DiagnosticCategory.Error,
        messageText: 'VANITY_STYLE_MODULE_MISUSE: ds.class belongs in a *.css.ts style module; application modules can use ds.runtime() and serialized style exports.',
      }))

      const fixes = ambient.service.getCodeFixesAtPosition(button, 5, 8, [990001], {}, {})
      expect(fixes.map(fix => fix.description)).toEqual(expect.arrayContaining([
        'Add the type-only unlock import',
        'Import cls from the authoring barrel',
      ]))
      expect(fixes.find(fix => fix.description === 'Add the type-only unlock import')?.changes)
        .toEqual([expect.objectContaining({
          textChanges: [expect.objectContaining({
            newText: 'import type {} from \'@mszr/vanity/vanity-style-auto-imports\'\n',
          })],
        })])
    }
    finally {
      ambient.service.dispose()
    }
  })
})
