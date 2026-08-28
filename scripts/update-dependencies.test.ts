import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  catalogUpdateTargets,
  defaultCatalogNames,
  namedPeerCatalog,
  reconcileDependencyUpdate,
  restoreProtectedCatalogEntries,
} from './update-dependencies-core'

const workspaceSource = `catalogMode: strict

catalog:
  zeta: ^1.0.0
  '@scope/alpha': 2.0.0
  # keep this catalog ordered
  beta: ^3.0.0

catalogs:
  peers:
    zeta: '>=1 <2'
    '@scope/alpha': '>=2 <3'

blockExoticSubdeps: true
`

describe('dependency updater catalog helpers', () => {
  it('reads only default catalog keys in their authored order', () => {
    assert.deepEqual(defaultCatalogNames(workspaceSource), ['zeta', '@scope/alpha', 'beta'])
  })

  it('derives update targets while excluding explicit policy exceptions', () => {
    assert.deepEqual(
      catalogUpdateTargets(defaultCatalogNames(workspaceSource), new Set(['beta'])),
      ['zeta', '@scope/alpha'],
    )
  })

  it('restores the peer catalog and protected default entries', () => {
    const originalPeerCatalog = namedPeerCatalog(workspaceSource)
    const updatedSource = workspaceSource
      .replace('  zeta: ^1.0.0', '  zeta: ^2.0.0')
      .replace('    zeta: \'>=1 <2\'', '    zeta: \'>=2 <3\'')
      .replace('  beta: ^3.0.0', '  beta: ^4.0.0')

    const restoredSource = restoreProtectedCatalogEntries(updatedSource, originalPeerCatalog, [
      {
        name: 'zeta',
        range: '^1.0.0',
        pattern: /^( {2}zeta:) .+$/m,
        label: 'protected zeta range',
      },
    ])

    assert.match(restoredSource, / {2}zeta: \^1\.0\.0/)
    assert.match(restoredSource, / {4}zeta: '>=1 <2'/)
    assert.match(restoredSource, / {2}beta: \^4\.0\.0/)
  })

  it('persists a policy restoration without treating it as a dependency change', () => {
    assert.deepEqual(
      reconcileDependencyUpdate({
        originalSource: workspaceSource,
        source: workspaceSource.replace('    zeta: \'>=1 <2\'', '    zeta: \'>=2 <3\''),
        guardedSource: workspaceSource,
        lockfileChanged: false,
      }),
      { hasChanges: false, shouldWriteWorkspace: true },
    )
  })

  it('persists the restoration before reinstalling when the lockfile changed', () => {
    assert.deepEqual(
      reconcileDependencyUpdate({
        originalSource: workspaceSource,
        source: workspaceSource.replace('    zeta: \'>=1 <2\'', '    zeta: \'>=2 <3\''),
        guardedSource: workspaceSource,
        lockfileChanged: true,
      }),
      { hasChanges: true, shouldWriteWorkspace: true },
    )
  })

  it('reinstalls when a dependency change also changed the lockfile', () => {
    assert.deepEqual(
      reconcileDependencyUpdate({
        originalSource: workspaceSource,
        source: workspaceSource.replace('  beta: ^3.0.0', '  beta: ^4.0.0'),
        guardedSource: workspaceSource.replace('  beta: ^3.0.0', '  beta: ^4.0.0'),
        lockfileChanged: true,
      }),
      { hasChanges: true, shouldWriteWorkspace: false },
    )
  })
})
