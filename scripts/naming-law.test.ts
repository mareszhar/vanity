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

test('naming audit keeps Vite lifecycle names inside the Vite adapter', () => {
  const adapter = fileURLToPath(new URL('../sdk/src/vite.ts', import.meta.url))
  const elsewhere = fileURLToPath(new URL('./fixtures/host-hook.ts', import.meta.url))
  assert.deepEqual(findNamingLawViolations(adapter, 'function closeWatcher() {}\nfunction closeBundle() {}'), [])
  assert.deepEqual(findNamingLawViolations(elsewhere, 'function closeWatcher() {}'), [
    '../scripts/fixtures/host-hook.ts:1 closeWatcher',
  ])
})

test('naming audit keeps the lightningcss Variable visitor inside its parser owner', () => {
  const owner = fileURLToPath(new URL('../sdk/src/css/tdec.ts', import.meta.url))
  const elsewhere = fileURLToPath(new URL('../sdk/src/fixtures/parser-hook.ts', import.meta.url))
  const source = 'const visitor = { Variable: () => {} }'
  assert.deepEqual(findNamingLawViolations(owner, source), [])
  assert.deepEqual(findNamingLawViolations(elsewhere, source), ['src/fixtures/parser-hook.ts:1 Variable'])
})

for (const [file, name] of [
  ['vite.ts', 'hotUpdate'],
  ['compiler/modules/source.ts', 'ExportDefaultDeclaration'],
  ['css/grammar-math.ts', 'enter'],
  ['introspect/audit.ts', 'descendantConditions'],
  ['introspect/audit.ts', 'unanchoredSelectors'],
] as const) {
  test(`naming audit keeps ${name} inside its protocol owner`, () => {
    const owner = fileURLToPath(new URL(`../sdk/src/${file}`, import.meta.url))
    const elsewhere = fileURLToPath(new URL('../sdk/src/unrelated.ts', import.meta.url))
    const source = `const hook = { ${name}() {} }`
    assert.deepEqual(findNamingLawViolations(owner, source), [])
    assert.deepEqual(findNamingLawViolations(elsewhere, source), [`src/unrelated.ts:1 ${name}`])
  })
}

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

test('history audit preserves current CSS grammar terms and rejects authored history', () => {
  const term = ['leg', 'acy'].join('')
  const other = ['histo', 'rical'].join('')
  for (const file of ['sdk/src/css/property-grammar.generated.json', 'spikes/property-grammar-agreement/grammar.generated.json']) {
    for (const source of [
      `"syntax": "${term} && left | ${other}-forms"`,
      `"name": "display-${term}"`,
      `"Type:${term}-hsl-syntax",`,
    ]) {
      assert.deepEqual(findHistoryVocabularyInSource(file, source), [])
      assert.ok(findHistoryVocabularyInSource('sdk/src/unrelated.ts', source).length > 0)
    }
    assert.equal(findHistoryVocabularyInSource(file, `"description": "${term} API"`).length, 1)
    assert.equal(findHistoryVocabularyInSource(file, `"syntax": "${other} API"`).length, 1)
  }
})

test('control-character audit catches unsafe text-source bytes', () => {
  const findings = findControlCharactersInSource('fixture.ts', `x${String.fromCharCode(0)}`)
  assert.deepEqual(findings, [{ file: 'fixture.ts', line: 1, column: 2, code: '0000' }])
})

test('naming audit keeps Oxc function visitor keys inside source instrumentation', () => {
  const owner = fileURLToPath(new URL('../sdk/src/compiler/modules/source.ts', import.meta.url))
  const elsewhere = fileURLToPath(new URL('../sdk/src/fixtures/parser-hook.ts', import.meta.url))
  const source = 'const visitor = { FunctionDeclaration() {}, FunctionExpression() {}, ArrowFunctionExpression() {} }'
  assert.deepEqual(findNamingLawViolations(owner, source), [])
  assert.deepEqual(findNamingLawViolations(elsewhere, source), [
    'src/fixtures/parser-hook.ts:1 FunctionDeclaration',
    'src/fixtures/parser-hook.ts:1 FunctionExpression',
    'src/fixtures/parser-hook.ts:1 ArrowFunctionExpression',
  ])
})
