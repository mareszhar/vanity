import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { findNamingLawViolations } from './audit'

test('naming audit catches local functions, callable constants, and methods', async () => {
  const file = fileURLToPath(new URL('./fixtures/naming-law-invalid.ts', import.meta.url))
  const source = await readFile(file, 'utf8')
  const violations = findNamingLawViolations(file, source, fileURLToPath(new URL('../', import.meta.url)))
  const names = violations.map(violation => violation.split(' ').at(-1))

  assert.deepEqual(names, ['localThing', 'thingCallable', 'methodThing', 'objectMethodThing'])
})

test('naming audit accepts verb-led local operations', async () => {
  const file = fileURLToPath(new URL('./fixtures/naming-law-valid.ts', import.meta.url))
  const source = await readFile(file, 'utf8')
  assert.deepEqual(findNamingLawViolations(file, source, fileURLToPath(new URL('../', import.meta.url))), [])
})
