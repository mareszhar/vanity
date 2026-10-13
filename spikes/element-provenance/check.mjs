// Run: pnpm --filter spike-element-provenance check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateSelection } from './model.mjs'
import { emitSourceRegistration, hashSource, inspectSource } from './registry.mjs'

const fixture = JSON.parse(await readFile(new URL('./provenance-fixture.json', import.meta.url)))
assert.equal(validateSelection(fixture.manifest.recipes.row, {}).selection.size, 'small')
assert.ok(emitSourceRegistration('Row.css.ts', 'source').includes(hashSource('source')))
assert.deepEqual(inspectSource('disk'), { disk: 'disk', loaded: 'unverified' })
assert.equal(inspectSource('disk', 'old').loaded, false)
console.log('Independent metadata and source-record prototype checks passed')
