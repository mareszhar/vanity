/** Update the repository's pnpm pin, then verify the workspace with that pin. */

import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  parseMinimumReleaseAgeMinutes,
  selectNewestEligiblePnpmVersion,
} from './pnpm-releases'
import {
  absoluteStorePath,
  isProjectStore,
  linkedStoreDir,
  pnpmStoreArgs,
  relinkNodeModules,
  removeProjectStore,
} from './pnpm-store'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = new URL('../package.json', import.meta.url)
const workspaceConfig = new URL('../pnpm-workspace.yaml', import.meta.url)
const lockfile = new URL('../pnpm-lock.yaml', import.meta.url)
const modulesState = new URL('../node_modules/.modules.yaml', import.meta.url)

function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

const storeArgs = pnpmStoreArgs()

function runPnpm(args: readonly string[], useInstalledStore = false): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpmCommand(), [...(useInstalledStore ? storeArgs : []), ...args], { cwd: root, stdio: 'inherit' })
    child.once('error', reject)
    child.once('close', code => resolve(code ?? 1))
  })
}

function runPnpmCapture(args: readonly string[]): Promise<{ exitCode: number, stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpmCommand(), [...storeArgs, ...args], {
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

async function repairUnexpectedStore(): Promise<void> {
  const linkedStore = await linkedStoreDir(modulesState)
  if (linkedStore === undefined)
    return

  const storeResult = await runPnpmCapture(['store', 'path'])
  if (storeResult.exitCode !== 0)
    process.exit(storeResult.exitCode)

  const selectedStore = storeResult.stdout.trim().split(/\r?\n/).at(-1)?.trim()
  if (selectedStore === undefined)
    throw new Error('Unable to determine the user-level pnpm store.')
  if (isProjectStore(root, selectedStore))
    throw new Error('pnpm resolved the workspace-local .pnpm-store; configure a writable user-level pnpm store before updating pnpm.')

  if (absoluteStorePath(root, linkedStore) !== absoluteStorePath(root, selectedStore)) {
    console.log('[pnpm:self-update] relinking the workspace install to the user-level pnpm store.')
    await relinkNodeModules(
      root,
      () => runPnpm(['install', '--frozen-lockfile'], true),
      async () => {
        const repairedStore = await linkedStoreDir(modulesState)
        return repairedStore !== undefined && absoluteStorePath(root, repairedStore) === absoluteStorePath(root, selectedStore)
      },
    )
  }

  await removeProjectStore(root)
}

function packageManagerFromManifest(source: string): string {
  const packageManager = (JSON.parse(source) as { packageManager?: unknown }).packageManager
  if (typeof packageManager !== 'string' || !packageManager.startsWith('pnpm@'))
    throw new Error('The root package.json must pin pnpm with its packageManager field.')
  return packageManager
}

function replacePackageManagerPin(source: string, version: string): string {
  const pin = `pnpm@${version}`
  const changed = source.replace(/^(\s*"packageManager"\s*:\s*)"[^"]+"(,?)$/m, (_line, prefix: string, comma: string) =>
    `${prefix}${JSON.stringify(pin)}${comma}`)
  if (changed === source && packageManagerFromManifest(source) !== pin)
    throw new Error('Could not update the root packageManager field without changing its JSON layout.')
  return changed
}

async function pnpmRegistryMetadata(): Promise<{ time?: Record<string, string> }> {
  const response = await fetch('https://registry.npmjs.org/pnpm')
  if (!response.ok)
    throw new Error(`Could not read pnpm release metadata from the npm registry (${response.status} ${response.statusText}).`)
  return await response.json() as { time?: Record<string, string> }
}

async function restorePinAndLockfile(originalManifest: string, originalLockfile: string): Promise<void> {
  await Promise.all([
    writeFile(manifest, originalManifest),
    writeFile(lockfile, originalLockfile),
  ])
}

await repairUnexpectedStore()

const originalManifest = await readFile(manifest, 'utf8')
const originalLockfile = await readFile(lockfile, 'utf8')
const before = packageManagerFromManifest(originalManifest)
const releaseAge = parseMinimumReleaseAgeMinutes(await readFile(workspaceConfig, 'utf8'))
const selectedVersion = selectNewestEligiblePnpmVersion(await pnpmRegistryMetadata(), releaseAge)
const nextManifest = replacePackageManagerPin(originalManifest, selectedVersion)

if (nextManifest !== originalManifest)
  await writeFile(manifest, nextManifest)
console.log(`[pnpm:self-update] ${before} → pnpm@${selectedVersion} (newest release outside the ${releaseAge}-minute age window).`)

// The new CLI must first write its own package-manager record. A frozen
// install before this step rejects a valid pin change as an outdated lockfile.
const updateExitCode = await runPnpm(['install', '--force'], true)
if (updateExitCode !== 0) {
  await restorePinAndLockfile(originalManifest, originalLockfile)
  process.exitCode = updateExitCode
}
else {
  // Force the relink because modules metadata from the previous CLI can look
  // up to date even though its package-manager dependency was just replaced.
  process.exitCode = await runPnpm(['install', '--frozen-lockfile', '--force'], true)
}
