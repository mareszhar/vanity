import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { findControlCharactersInSource, findHistoryVocabularyInSource, findNamingLawViolations } from './audit'

test('naming audit catches local functions, callable constants, and methods', async () => {
  const file = fileURLToPath(new URL('./fixtures/naming-law-invalid.ts', import.meta.url))
  const source = await readFile(file, 'utf8')
  const violations = findNamingLawViolations(file, source, fileURLToPath(new URL('../', import.meta.url)))
  const names = violations.map(violation => violation.split(' ').at(-1))

  assert.deepEqual(names, [
    'localThing',
    'thingCallable',
    'methodThing',
    'objectMethodThing',
    'propertyThing',
    'propertyTypeThing',
  ])
})

test('naming audit accepts verb-led local operations', async () => {
  const file = fileURLToPath(new URL('./fixtures/naming-law-valid.ts', import.meta.url))
  const source = await readFile(file, 'utf8')
  assert.deepEqual(findNamingLawViolations(file, source, fileURLToPath(new URL('../', import.meta.url))), [])
})

test('naming audit requires predicate names for explicit boolean operations', async () => {
  const file = fileURLToPath(new URL('./fixtures/naming-law-predicate-invalid.ts', import.meta.url))
  const source = await readFile(file, 'utf8')
  const root = fileURLToPath(new URL('../', import.meta.url))

  assert.deepEqual(findNamingLawViolations(file, source, root), [
    'scripts/fixtures/naming-law-predicate-invalid.ts:1 selectThing (boolean operation must use a predicate name)',
  ])
})

test('history vocabulary audit catches names tied to an earlier shape', () => {
  const firstTerm = ['leg', 'acy'].join('')
  const secondTerm = ['phase', '10'].join('')
  const findings = findHistoryVocabularyInSource('fixture.ts', [
    `// ${firstTerm} alias`,
    `const ${secondTerm} = 1`,
    'const value = 2',
  ].join('\n'))

  assert.deepEqual(findings.map(finding => finding.match), [firstTerm, secondTerm])
})

test('control-character audit catches unsafe text-source bytes', () => {
  const findings = findControlCharactersInSource('fixture.ts', `x${String.fromCharCode(0)}`)
  assert.deepEqual(findings, [{ file: 'fixture.ts', line: 1, column: 2, code: '0000' }])
})
