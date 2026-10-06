/** Real editor import actions retain native semantics while style barrels rank first. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { cursor, defineProject, snippet } from '@mszr/selenita/vitest'
import { vanityTypeScriptPlugin } from '@test'
import { afterAll, describe, expect, it } from 'vitest'

const root = mkdtempSync(join(tmpdir(), 'vanity-editor-imports-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const packageFiles = {
  'node_modules/@acme/design/package.json': JSON.stringify({
    name: '@acme/design',
    exports: { './authoring': { types: './authoring.d.ts' } },
  }),
  'node_modules/@acme/design/authoring.d.ts': `
      export interface Style { color?: string }
      /** Create a class from a style. */
      export declare function cls(style: Style): string
    `,
  'node_modules/other/package.json': JSON.stringify({
    name: 'other',
    exports: { '.': { types: './index.d.ts' } },
  }),
  'node_modules/other/index.d.ts': `
      export interface OtherStyle { opacity?: number }
      /** Create another class. */
      export declare function cls(style: OtherStyle): string
    `,
} as const
for (const [file, source] of Object.entries(packageFiles)) {
  const path = join(root, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, source)
}
writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { strict: true, module: 'esnext', moduleResolution: 'bundler' },
  include: [],
}))
const config = {
  tsconfig: join(root, 'tsconfig.json'),
  preferences: { includeCompletionsForModuleExports: true },
  files: {
    'seed.ts': `import type { Style } from '@acme/design/authoring'
      import type { OtherStyle } from 'other'
      export type Both = Style & OtherStyle`,
  },
} as const
const native = defineProject(config)
const configured = defineProject(config, {
  plugins: [[vanityTypeScriptPlugin, { authoringBarrels: ['@acme/design/authoring'] }]],
})

describe('typescript authoring-barrel completions', () => {
  it.each(['Button.css.ts', 'Button.ts'])('preserves the import action in %s', (file) => {
    const files = { [file]: snippet`export {}; cls${cursor}({})` }
    const baseline = native.query(files)
    const result = configured.query(files)
    expect(result).toSuggest('cls', { requireDocumentation: true })

    for (const source of ['@acme/design/authoring', 'other']) {
      const original = baseline.findCompletion({ name: 'cls', source })
      const completion = result.findCompletion({ name: 'cls', source })
      expect(original, source).toBeDefined()
      expect(completion, source).toBeDefined()
      expect(completion!.sortText).toBe(file.endsWith('.css.ts') && source === '@acme/design/authoring'
        ? `0${original!.sortText}`
        : original!.sortText)
      expect(completion!.displayText).toBe(original!.displayText)
      expect(completion!.codeActions).toEqual(original!.codeActions)
      expect(completion!.codeActions.flatMap(action => action.edits))
        .toContainEqual(expect.objectContaining({ newText: expect.stringContaining(`from "${source}"`) }))
    }

    const action = result.findCompletion({ name: 'cls', source: '@acme/design/authoring' })!.codeActions[0]!
    expect(configured.check(action.fixedFiles)).toBeClean()
  })
})
