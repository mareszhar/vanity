import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const workspaceDir = fileURLToPath(new URL('../', import.meta.url))
const acceptedSourcePath = join(workspaceDir, 'benchmarks/accepted.json')
const documentSourcePath = join(workspaceDir, 'docs/maintainers/benchmarks.md')

function runBenchmarkFixtureCheck(benchmarkWorkspace: string): { readonly output: string, readonly status: number | null } {
  const result = spawnSync(
    'pnpm',
    ['exec', 'tsx', 'scripts/generate-benchmarks.ts', '--check', '--workspace', benchmarkWorkspace],
    {
      cwd: workspaceDir,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true', FORCE_COLOR: '0', NO_COLOR: '1' },
    },
  )
  return {
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    status: result.status,
  }
}

test('benchmark page assertion is reachable and reports its contract', () => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'vanity-benchmark-assertion-'))
  const sourceDocument = readFileSync(documentSourcePath, 'utf8')
  const sourceAccepted = readFileSync(acceptedSourcePath, 'utf8')
  try {
    const benchmarkWorkspace = join(temporaryDirectory, 'workspace')
    const acceptedPath = join(benchmarkWorkspace, 'benchmarks/accepted.json')
    const documentPath = join(benchmarkWorkspace, 'docs/maintainers/benchmarks.md')
    const vanityPath = join(benchmarkWorkspace, '.vanity')
    mkdirSync(join(benchmarkWorkspace, 'benchmarks'), { recursive: true })
    mkdirSync(join(benchmarkWorkspace, 'docs/maintainers'), { recursive: true })
    copyFileSync(acceptedSourcePath, acceptedPath)
    copyFileSync(documentSourcePath, documentPath)
    cpSync(join(workspaceDir, 'benchmarks/generated'), join(benchmarkWorkspace, 'benchmarks/generated'), {
      recursive: true,
      filter: source => !['.vanity', 'dist', 'node_modules'].includes(basename(source)),
    })
    const originalDocument = readFileSync(documentPath, 'utf8')
    const originalAccepted = readFileSync(acceptedPath, 'utf8')
    const documentedRoot = originalDocument.match(/The current package root entry is ([\d,]+) B raw\./)
    assert.ok(documentedRoot)
    const documentedRootBytes = Number(documentedRoot[1]!.replaceAll(',', ''))
    const staleRootBytes = documentedRootBytes - 1
    const formatted = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

    const valid = runBenchmarkFixtureCheck(benchmarkWorkspace)
    assert.equal(valid.status, 0, valid.output)
    assert.match(valid.output, /20 byte figures match benchmarks\/accepted\.json/)

    writeFileSync(documentPath, originalDocument.replace(
      `${formatted(documentedRootBytes)} B raw`,
      `${formatted(staleRootBytes)} B raw`,
    ))
    try {
      const perturbed = runBenchmarkFixtureCheck(benchmarkWorkspace)
      assert.equal(perturbed.status, 1, perturbed.output)
      assert.match(
        perturbed.output,
        new RegExp(`benchmark package\\.rootBytes: documented ${formatted(staleRootBytes)} B, accepted ${formatted(documentedRootBytes)} B`),
      )
    }
    finally {
      writeFileSync(documentPath, originalDocument)
    }

    writeFileSync(acceptedPath, '{ malformed\n')
    try {
      const malformed = runBenchmarkFixtureCheck(benchmarkWorkspace)
      assert.equal(malformed.status, 1, malformed.output)
      assert.match(malformed.output, /benchmark accepted facts could not be parsed/)
    }
    finally {
      writeFileSync(acceptedPath, originalAccepted)
    }

    writeFileSync(acceptedPath, JSON.stringify({ package: { rootBytes: 'not-bytes' } }))
    try {
      const invalid = runBenchmarkFixtureCheck(benchmarkWorkspace)
      assert.equal(invalid.status, 1, invalid.output)
      assert.match(invalid.output, /benchmark accepted facts \$\.package\.rootBytes must be a finite number/)
    }
    finally {
      writeFileSync(acceptedPath, originalAccepted)
    }

    rmSync(acceptedPath)
    try {
      const absent = runBenchmarkFixtureCheck(benchmarkWorkspace)
      assert.equal(absent.status, 1, absent.output)
      assert.match(absent.output, /benchmark accepted facts are missing/)
    }
    finally {
      writeFileSync(acceptedPath, originalAccepted)
    }

    mkdirSync(join(vanityPath, 'benchmarks'), { recursive: true })
    writeFileSync(join(vanityPath, 'benchmarks/current.json'), '{}\n')
    rmSync(vanityPath, { recursive: true, force: true })
    const withoutRawReceipt = runBenchmarkFixtureCheck(benchmarkWorkspace)
    assert.equal(withoutRawReceipt.status, 0, withoutRawReceipt.output)
    assert.match(withoutRawReceipt.output, /20 byte figures match benchmarks\/accepted\.json/)
  }
  finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }

  assert.equal(existsSync(temporaryDirectory), false)
  assert.equal(readFileSync(documentSourcePath, 'utf8'), sourceDocument)
  assert.equal(readFileSync(acceptedSourcePath, 'utf8'), sourceAccepted)
})
