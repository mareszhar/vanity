import assert from 'node:assert/strict'
import test from 'node:test'
import { getSupportedViteMajors } from './vite-compat'

test('compatibility tests every supported peers major regardless of other catalog pins', () => {
  const workspace = `catalogs:
  nuxt46:
    vite: 8.3.4
  peers:
    nuxt: ^4.0.0
    vite: ^6.0.0 || ^7.0.0 || ^8.0.0
  reviewHosts:
    vite: 8.3.4
`
  assert.deepEqual(getSupportedViteMajors(workspace), [6, 7, 8])
  assert.throws(() => getSupportedViteMajors(workspace.replace('    vite: ^6.0.0 || ^7.0.0 || ^8.0.0\n', '')), /Could not read vite from the peers catalog/)
})
