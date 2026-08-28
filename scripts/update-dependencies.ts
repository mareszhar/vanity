/**
 * Review latest versions once per default-catalog entry, then update the
 * selected entries while preserving explicit compatibility constraints.
 */

import { spawn } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  catalogUpdateTargets,
  defaultCatalogNames,
  namedPeerCatalog,
  reconcileDependencyUpdate,
  restoreProtectedCatalogEntries,
} from './update-dependencies-core'

const root = fileURLToPath(new URL('..', import.meta.url))
const workspaceConfig = new URL('../pnpm-workspace.yaml', import.meta.url)
const workspaceLockfile = new URL('../pnpm-lock.yaml', import.meta.url)
const workspaceState = new URL('../node_modules/.pnpm-workspace-state-v1.json', import.meta.url)
const interactive = process.argv.includes('--interactive')
const guardedCatalogEntries = [
  // @typescript-eslint 8.x supports TypeScript < 6.1. Keep this in lockstep
  // with the comment next to the catalog entry until that support window changes.
  { name: 'typescript', range: '^6.0.3', pattern: /^( {2}typescript:) .+$/m, label: 'supported TypeScript range' },
] as const

function runPnpm(args: readonly string[]): Promise<number> {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { cwd: root, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => resolve(code ?? 1))
  })
}

const originalSource = await readFile(workspaceConfig, 'utf8')
const originalLockfile = await readFile(workspaceLockfile, 'utf8')
const originalPeerCatalog = namedPeerCatalog(originalSource)
const protectedNames = new Set<string>(guardedCatalogEntries.map(entry => entry.name))
const updateTargets = catalogUpdateTargets(defaultCatalogNames(originalSource), protectedNames)

const updateArgs = [
  'update',
  '-r',
  '--latest',
  ...(interactive ? [...updateTargets, '--interactive'] : []),
]
const updateExitCode = await runPnpm(updateArgs)
if (updateExitCode !== 0)
  process.exit(updateExitCode)

const source = await readFile(workspaceConfig, 'utf8')
const guardedSource = restoreProtectedCatalogEntries(source, originalPeerCatalog, guardedCatalogEntries)

const updatedLockfile = await readFile(workspaceLockfile, 'utf8')
const reconciliation = reconcileDependencyUpdate({
  originalSource,
  source,
  guardedSource,
  lockfileChanged: updatedLockfile !== originalLockfile,
})

if (reconciliation.shouldWriteWorkspace)
  await writeFile(workspaceConfig, guardedSource)

if (!reconciliation.hasChanges) {
  console.log('[upi] no dependency changes were applied; workspace files and install state were not changed.')
  process.exit(0)
}

await rm(workspaceState, { force: true })

process.exit(await runPnpm(['install']))
