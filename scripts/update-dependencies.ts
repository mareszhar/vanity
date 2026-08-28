/**
 * Review latest versions once per default-catalog entry, then update the
 * selected entries while preserving explicit compatibility constraints.
 */

import { spawn } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { styleText } from 'node:util'
import { cancel, isCancel, multiselect } from '@clack/prompts'
import {
  catalogUpdateChoices,
  catalogUpdateTargets,
  defaultCatalogNames,
  namedPeerCatalog,
  reconcileDependencyUpdate,
  restoreProtectedCatalogEntries,
  semverChangeParts,
} from './update-dependencies-core'

const root = fileURLToPath(new URL('..', import.meta.url))
const workspaceConfig = new URL('../pnpm-workspace.yaml', import.meta.url)
const workspaceLockfile = new URL('../pnpm-lock.yaml', import.meta.url)
const workspaceState = new URL('../node_modules/.pnpm-workspace-state-v1.json', import.meta.url)
const guardedCatalogEntries = [
  // @typescript-eslint 8.x supports TypeScript < 6.1. Keep this in lockstep
  // with the comment next to the catalog entry until that support window changes.
  { name: 'typescript', range: '^6.0.3', pattern: /^( {2}typescript:) .+$/m, label: 'supported TypeScript range' },
] as const
// Clack dims non-active labels. Clear that inherited terminal style before
// the semantic color, without adding a trailing global reset that could wash
// out the focused option's styling.
const clearInheritedTextStyle = '\u001B[0m'
const semverChangeStyles = {
  major: (text: string) => styleText(['redBright', 'bold'], text),
  minor: (text: string) => styleText('bold', styleText('#ffaf00', text)),
  patch: (text: string) => styleText(['greenBright', 'bold'], text),
} as const

function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

function runPnpm(args: readonly string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpmCommand(), [...args], { cwd: root, stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', code => resolve(code ?? 1))
  })
}

function runPnpmCapture(args: readonly string[]): Promise<{ exitCode: number, stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpmCommand(), [...args], {
      cwd: root,
      stdio: ['inherit', 'pipe', 'inherit'],
    })
    let stdout = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.once('error', reject)
    child.once('close', code => resolve({ exitCode: code ?? 1, stdout }))
  })
}

function colorizeLatestVersion(current: string, latest: string): string {
  const change = semverChangeParts(current, latest)
  if (change === undefined)
    return latest

  return `${change.commonPrefix}${clearInheritedTextStyle}${semverChangeStyles[change.kind](change.changedSuffix)}`
}

const originalSource = await readFile(workspaceConfig, 'utf8')
const originalLockfile = await readFile(workspaceLockfile, 'utf8')
const originalPeerCatalog = namedPeerCatalog(originalSource)
const protectedNames = new Set<string>(guardedCatalogEntries.map(entry => entry.name))
const updateTargets = catalogUpdateTargets(defaultCatalogNames(originalSource), protectedNames)

const outdatedResult = await runPnpmCapture([
  'outdated',
  '-r',
  '--format',
  'json',
  ...updateTargets,
])
if (outdatedResult.exitCode !== 0 && outdatedResult.exitCode !== 1)
  process.exit(outdatedResult.exitCode)

const updateChoices = catalogUpdateChoices(updateTargets, outdatedResult.stdout)
if (updateChoices.length === 0) {
  console.log('[upi] all eligible default-catalog entries are already current.')
  process.exit(0)
}

const selectedNames = await multiselect({
  message: 'Select default-catalog dependencies to update.',
  options: updateChoices.map(choice => ({
    value: choice.name,
    label: `${choice.name} (${choice.current} → ${colorizeLatestVersion(choice.current, choice.latest)})`,
    hint: choice.dependentPackageCount === 0 ? undefined : `${choice.dependentPackageCount} workspace ${choice.dependentPackageCount === 1 ? 'package' : 'packages'}`,
  })),
  required: false,
})
if (isCancel(selectedNames)) {
  cancel('Update canceled; no workspace files were changed.')
  process.exit(0)
}
if (selectedNames.length === 0) {
  console.log('[upi] no dependency changes were selected; workspace files and install state were not changed.')
  process.exit(0)
}

const updateArgs = [
  'update',
  '-r',
  '--latest',
  ...selectedNames,
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
