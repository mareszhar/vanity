/**
 * Drive pnpm's workspace-wide latest-version review, then reapply the few
 * explicit toolchain compatibility constraints that automated updates cannot
 * infer. Catalog entries remain the single source of tested dependency ranges.
 */

import { spawn } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const workspaceConfig = new URL('../pnpm-workspace.yaml', import.meta.url)
const workspaceState = new URL('../node_modules/.pnpm-workspace-state-v1.json', import.meta.url)
const interactive = process.argv.includes('--interactive')

function namedPeerCatalog(source: string): string {
  const start = source.indexOf('catalogs:\n')
  const end = source.indexOf('\nblockExoticSubdeps:', start)

  if (start === -1 || end === -1)
    throw new Error('Unable to preserve the published peer compatibility catalog.')

  return source.slice(start, end)
}

function runPnpm(args: string[]): Promise<number> {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => resolve(code ?? 1))
  })
}

const updateArgs = ['update', '-r', '--latest']
if (interactive)
  updateArgs.push('--interactive')

const originalSource = await readFile(workspaceConfig, 'utf8')
const originalPeerCatalog = namedPeerCatalog(originalSource)
const updateExitCode = await runPnpm(updateArgs)
if (updateExitCode !== 0)
  process.exit(updateExitCode)

const source = await readFile(workspaceConfig, 'utf8')
const guardedCatalogEntries = [
  // @typescript-eslint 8.x supports TypeScript < 6.1. Keep this in lockstep
  // with the comment next to the catalog entry until that support window changes.
  [/^( {2}typescript:) .+$/m, '$1 ^6.0.3', 'supported TypeScript range'],
] as const

let guardedSource = source
guardedSource = guardedSource.replace(namedPeerCatalog(guardedSource), originalPeerCatalog)
for (const [pattern, replacement, label] of guardedCatalogEntries) {
  if (!pattern.test(guardedSource))
    throw new Error(`Unable to preserve the ${label}.`)
  guardedSource = guardedSource.replace(pattern, replacement)
}

await writeFile(workspaceConfig, guardedSource)
await rm(workspaceState, { force: true })

process.exit(await runPnpm(['install']))
