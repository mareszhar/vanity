/** Editor contract for Vanity's style-module completion preference. */

import type { LanguageService } from 'typescript'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const initPlugin = require(resolve(process.cwd(), 'typescript.cjs')) as (modules: { typescript: typeof ts }) => {
  create: (info: { languageService: LanguageService, config?: unknown }) => LanguageService
}

describe('typescript authoring-barrel completions', () => {
  it('ranks configured barrel imports only in style modules and preserves TypeScript’s import action', () => {
    const result = {
      entries: [
        {
          name: 'cls',
          kind: ts.ScriptElementKind.constElement,
          kindModifiers: 'export',
          sortText: '15',
          source: '@acme/design/authoring',
          hasAction: true,
          data: { exportName: 'cls', moduleSpecifier: '@acme/design/authoring' },
        },
        {
          name: 'close',
          kind: ts.ScriptElementKind.functionElement,
          kindModifiers: '',
          sortText: '11',
          source: 'unrelated',
        },
      ],
    }
    const native = {
      getCompletionsAtPosition: vi.fn(() => result),
      getProgram: vi.fn(() => ({ getSourceFiles: () => [] })),
    } as unknown as LanguageService
    const service = initPlugin({ typescript: ts }).create({
      languageService: native,
      config: { authoringBarrels: ['@acme/design/authoring'] },
    })

    const style = service.getCompletionsAtPosition('/project/Button.css.ts', 0, {})!
    const app = service.getCompletionsAtPosition('/project/Button.ts', 0, {})

    expect(style.entries[0]).toMatchObject({
      name: 'cls',
      sortText: '015',
      source: '@acme/design/authoring',
      hasAction: true,
      data: { exportName: 'cls', moduleSpecifier: '@acme/design/authoring' },
    })
    expect(style.entries[1]?.sortText).toBe('11')
    expect(app).toBe(result)
  })
})
