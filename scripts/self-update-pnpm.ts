/** Update the repository's pnpm pin, then verify the workspace with that pin. */

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
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

async function pinnedPackageManager(): Promise<string> {
  const source = await readFile(manifest, 'utf8')
  const packageManager = (JSON.parse(source) as { packageManager?: unknown }).packageManager

  if (typeof packageManager !== 'string' || !packageManager.startsWith('pnpm@'))
    throw new Error('The root package.json must pin pnpm with its packageManager field.')

  return packageManager
}

await repairUnexpectedStore()

const before = await pinnedPackageManager()
const updateExitCode = await runPnpm(['self-update'])
if (updateExitCode !== 0)
  process.exit(updateExitCode)

const after = await pinnedPackageManager()
console.log(`[pnpm:self-update] ${before === after ? `${after} is already current.` : `${before} → ${after}.`}`)

// In a pinned project, self-update changes package.json and the next pnpm
// invocation switches to that version. Force the relink because a regular
// frozen install may consider stale modules metadata "up to date" even though
// it was created by the previous pnpm version.
process.exit(await runPnpm(['install', '--frozen-lockfile', '--force'], true))
