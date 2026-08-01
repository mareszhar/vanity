/**
 * Keep the npm package README byte-for-byte aligned with the canonical root
 * README. Consumers and repository visitors should see one product story, and
 * `--check` lets CI enforce that without writing files.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = resolve(root, 'README.md')
const packagePath = resolve(root, 'sdk/README.md')
const source = readFileSync(sourcePath, 'utf8')
const check = process.argv.includes('--check')

if (check) {
  const published = readFileSync(packagePath, 'utf8')
  if (published !== source) {
    console.error('sdk/README.md is out of sync with README.md; run pnpm run readme:sync')
    process.exitCode = 1
  }
}
else {
  writeFileSync(packagePath, source)
}
