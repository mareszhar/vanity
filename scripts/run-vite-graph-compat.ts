// Run the client/SSR ownership assertions once per supported Vite major; every adapter decision must hold at each host boundary.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const workspaceDir = fileURLToPath(new URL('../', import.meta.url))
const sdkDir = join(workspaceDir, 'sdk')
const scriptPath = fileURLToPath(import.meta.url)

function supportedViteMajors(): number[] {
  const workspace = readFileSync(join(workspaceDir, 'pnpm-workspace.yaml'), 'utf8')
  const line = workspace.match(/^\s{4}vite:\s*(?:'([^']+)'|"([^"]+)"|([^\s#]+))/m)
  const range = line?.[1] ?? line?.[2] ?? line?.[3]
  if (range === undefined)
    throw new Error('Could not read vite from the peers catalog in pnpm-workspace.yaml')

  const majors = [...new Set([...range.matchAll(/(?:^|\|\|)\s*\^(\d+)\.\d+\.\d+/g)]
    .map(match => Number(match[1])))].sort((left, right) => left - right)
  if (majors.length === 0) {
    throw new Error(
      `Could not derive supported Vite majors from the peers range '${range}'; update this parser for the new range form`,
    )
  }
  return majors
}

function vitePackageFromPath(): { directory: string, entry: string, version: string } {
  const binaryDirectory = process.env.PATH?.split(delimiter)[0]
  if (binaryDirectory === undefined)
    throw new Error('The Vite package binary is not available on PATH')

  const viteBinary = join(binaryDirectory, process.platform === 'win32' ? 'vite.cmd' : 'vite')
  if (!existsSync(viteBinary))
    throw new Error('The Vite package binary is not available on PATH; run this child through pnpm dlx')

  const launcher = readFileSync(viteBinary, 'utf8')
  const target = launcher.match(/(?:#|rem) cmd-shim-target=(.+)$/m)?.[1]
  let directory = dirname(realpathSync(target ?? viteBinary))
  while (!existsSync(join(directory, 'package.json'))) {
    const parent = dirname(directory)
    if (parent === directory)
      throw new Error(`Could not locate Vite's package.json from ${viteBinary}`)
    directory = parent
  }

  const version = (JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { version?: unknown }).version
  if (typeof version !== 'string')
    throw new Error(`Vite's package.json has no version at ${directory}`)
  const entry = join(directory, 'dist/node/index.js')
  if (!existsSync(entry))
    throw new Error(`Vite ${version} has no Node entry at ${entry}`)
  return { directory, entry, version }
}

function runMajor(major: number): number {
  const vite = vitePackageFromPath()
  if (Number(vite.version.split('.')[0]) !== major)
    throw new Error(`Expected Vite ${major}.x on PATH, found Vite ${vite.version}`)

  console.log(`Testing actual Vite ${vite.version} client/SSR module graphs`)
  const vitest = join(sdkDir, 'node_modules/vitest/vitest.mjs')
  if (!existsSync(vitest))
    throw new Error(`The SDK Vitest runner is missing at ${vitest}`)
  const result = spawnSync(process.execPath, [
    vitest,
    'run',
    'src/compiler/hosts/viteGraph.compat.test.ts',
    '--pool=forks',
    '--maxWorkers=1',
  ], {
    cwd: sdkDir,
    env: { ...process.env, VANITY_VITE_TEST_ENTRY: vite.entry },
    stdio: 'inherit',
  })

  if (result.error !== undefined)
    throw result.error
  return result.status ?? 1
}

const childIndex = process.argv.indexOf('--single-major')
if (childIndex !== -1) {
  const major = Number(process.argv[childIndex + 1])
  if (!Number.isInteger(major) || major < 5)
    throw new Error('Pass a Vite major after --single-major')
  process.exitCode = runMajor(major)
}
else {
  for (const major of supportedViteMajors()) {
    console.log(`\n• Vite ${major}`)
    const result = spawnSync('pnpm', [
      'dlx',
      '--package',
      `vite@${major}`,
      '--package',
      'tsx',
      'tsx',
      scriptPath,
      '--single-major',
      String(major),
    ], {
      // Do not let this workspace's packageManager pin force a temporary
      // pnpm installation just to fetch the isolated Vite test host. Keep
      // pnpm's temporary dlx cache inside the runner's writable temp root.
      cwd: tmpdir(),
      env: {
        ...process.env,
        XDG_CACHE_HOME: join(tmpdir(), 'vanity-vite-compat-cache'),
      },
      stdio: 'inherit',
    })
    if (result.error !== undefined)
      throw result.error
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1
      break
    }
  }
}
