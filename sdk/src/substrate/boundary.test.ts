import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

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
