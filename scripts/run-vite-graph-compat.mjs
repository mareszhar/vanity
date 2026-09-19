import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const workspaceDir = fileURLToPath(new URL('../', import.meta.url))
const binaryDirectory = process.env.PATH?.split(delimiter)[0]
if (binaryDirectory === undefined)
  throw new Error('The Vite package binary is not available on PATH')

const viteBinary = join(binaryDirectory, process.platform === 'win32' ? 'vite.cmd' : 'vite')
if (!existsSync(viteBinary))
  throw new Error('Run this script through `pnpm dlx --package=vite@<version> node`')

const launcher = readFileSync(viteBinary, 'utf8')
const target = launcher.match(/(?:#|rem) cmd-shim-target=(.+)$/m)?.[1]
let vitePackageDirectory = dirname(realpathSync(target ?? viteBinary))
while (!existsSync(join(vitePackageDirectory, 'package.json'))) {
  const parent = dirname(vitePackageDirectory)
  if (parent === vitePackageDirectory)
    throw new Error(`Could not locate Vite's package.json from ${viteBinary}`)
  vitePackageDirectory = parent
}
const vitePackage = JSON.parse(readFileSync(join(vitePackageDirectory, 'package.json'), 'utf8'))
const entry = join(vitePackageDirectory, 'dist/node/index.js')
if (!existsSync(entry))
  throw new Error(`Vite ${vitePackage.version} has no Node entry at ${entry}`)

console.log(`Testing actual Vite ${vitePackage.version} client/SSR module graphs`)
const result = spawnSync('pnpm', [
  '--dir',
  join(workspaceDir, 'sdk'),
  'exec',
  'vitest',
  'run',
  'src/compiler/hosts/viteGraph.compat.test.ts',
  '--pool=forks',
  '--maxWorkers=1',
], {
  cwd: workspaceDir,
  env: { ...process.env, VANITY_VITE_TEST_ENTRY: entry },
  stdio: 'inherit',
})

if (result.error !== undefined)
  throw result.error
process.exitCode = result.status ?? 1
