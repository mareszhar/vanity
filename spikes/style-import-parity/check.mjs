import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { packageName } from './model.mjs'

assert.equal(packageName('@fixture/example/path'), '@fixture/example')
assert.equal(packageName('example/path'), 'example')
assert.equal(packageName('./example'), undefined)
for (const file of ['model.mjs', 'fixture.mjs', 'run.mjs', 'frameworks.mjs', 'nuxt.mjs', 'preparation.mjs', 'optimizer.mjs']) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  assert.doesNotMatch(source, /(?:from\s*|import\s*\()['"]@mszr\/vanity/, 'spike must remain independent')
}
console.log('Independent style import model checks passed')
