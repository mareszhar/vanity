/**
 * Review-first release tooling for the dedicated Vanity repository.
 *
 *   pnpm run publish:sdk:dry-run
 *   pnpm run publish:sdk:<patch|minor|major>
 *
 * A release is one command, happy path included: preflight (a clean working
 * tree, npm authentication, and target-version availability) before any
 * expensive work; the complete validation gate and packaging rehearsal; the
 * version bump, publication, and registry propagation wait; then the release
 * commit, an annotated tag, and a push of both to `origin` — so a successful
 * run needs nothing further except attaching notes to the GitHub release.
 * The precondition this replaces manual git stewardship with is simple: the
 * working tree must be clean before a release starts, whatever history led
 * there — squashed or not.
 *
 * Failure recovery is explicit. Validation receipts under ignored `.vanity/`
 * are keyed to a digest of repository content with the manifest version
 * masked, so a green gate is never repaid for unchanged inputs — not even by
 * the bump itself. A failure before publication restores `sdk/package.json`
 * and leaves no release state. Once published the bump is permanent, so the
 * release is recorded in `.vanity/release-state.json`: a later step failing
 * (registry wait, commit, tag, push) keeps that record, and re-running the
 * same `publish:sdk:<bump>` resumes from the first incomplete step instead
 * of re-bumping or re-publishing.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const workspaceDir = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const packageDir = join(workspaceDir, 'sdk')
const manifestPath = join(packageDir, 'package.json')
const stateDir = join(workspaceDir, '.vanity')
const receiptPath = join(stateDir, 'verify-receipt.json')
const releaseStatePath = join(stateDir, 'release-state.json')

type Bump = 'patch' | 'minor' | 'major'

interface Receipt {
  key: string
  validatedAt?: string
  smokedAt?: string
}

interface ReleaseState {
  version: string
  bump: Bump
  publishedAt: string
  committed: boolean
  tagged: boolean
  pushed: boolean
}

function capture(command: string, args: string[], cwd = workspaceDir): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function run(command: string, args: string[], cwd = workspaceDir): void {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

function step(title: string): void {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`)
}

function fail(message: string): never {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

function readManifest(): { name: string, version: string, homepage: string } {
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    name: string
    version: string
    homepage: string
  }
}

/**
 * Digest of everything a release ships or validates: the exact worktree
 * (tracked and untracked, ignores respected) hashed through a throwaway Git
 * index, with the manifest's version field masked out first — bumping the
 * version is legitimate release-time churn the gate does not actually test.
 */
function contentDigest(): string {
  const indexFile = join(tmpdir(), `vanity-release-index-${process.pid}-${Date.now()}`)
  const env = { ...process.env, GIT_INDEX_FILE: indexFile }
  const indexed = (args: string[], input?: string): string =>
    execFileSync('git', args, {
      cwd: workspaceDir,
      encoding: 'utf8',
      env,
      input,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    }).trim()

  try {
    indexed(['read-tree', '--empty'])
    indexed(['add', '-A'])

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    delete manifest.version
    const blob = indexed(['hash-object', '-w', '--stdin'], JSON.stringify(manifest, null, 2))
    indexed(['update-index', '--add', '--cacheinfo', `100644,${blob},sdk/package.json`])

    return indexed(['write-tree'])
  }
  finally {
    rmSync(indexFile, { force: true })
  }
}

function loadReceipt(key: string): Receipt {
  if (process.env.VANITY_FORCE_VERIFY === '1')
    return { key }

  try {
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as Receipt
    return receipt.key === key ? receipt : { key }
  }
  catch {
    return { key }
  }
}

function saveReceipt(receipt: Receipt): void {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
}

/** The complete repository gate, skipped only against a matching receipt. */
function gate(receipt: Receipt): void {
  if (process.env.VANITY_UNSAFE_PUBLISH_SKIP_CHECKS === '1') {
    console.log('⚠ VANITY_UNSAFE_PUBLISH_SKIP_CHECKS=1 — validation was skipped')
    return
  }

  if (receipt.validatedAt !== undefined) {
    console.log(`✓ validation receipt matches current content (${receipt.validatedAt})`)
    return
  }

  step('complete repository validation')
  run('pnpm', ['run', 'validate'])

  receipt.validatedAt = new Date().toISOString()
  saveReceipt(receipt)
  console.log('\n✓ validation receipt recorded')
}

/** Packed SDK and fresh-consumer rehearsal, skipped against the same receipt. */
function smoke(receipt: Receipt): void {
  if (receipt.smokedAt !== undefined) {
    console.log(`✓ packaging receipt matches current content (${receipt.smokedAt})`)
    return
  }

  step('packed SDK and fresh-consumer rehearsal')
  run('pnpm', ['run', 'sdk:build'])
  run('pnpm', ['run', 'fresh:smoke'])
  run('pnpm', ['pack', '--dry-run'], packageDir)

  receipt.smokedAt = new Date().toISOString()
  saveReceipt(receipt)
  console.log('\n✓ packaging receipt recorded')
}

function bumpVersion(current: string, bump: Bump): string {
  const parts = current.split('.').map(Number)
  const [major, minor, patch] = parts
  if (parts.length !== 3 || parts.some(Number.isNaN) || major === undefined || minor === undefined || patch === undefined)
    fail(`cannot bump non-semver manifest version '${current}'`)

  switch (bump) {
    case 'major': return `${major + 1}.0.0`
    case 'minor': return `${major}.${minor + 1}.0`
    case 'patch': return `${major}.${minor}.${patch + 1}`
  }
}

function loadReleaseState(): ReleaseState | undefined {
  try {
    return JSON.parse(readFileSync(releaseStatePath, 'utf8')) as ReleaseState
  }
  catch {
    return undefined
  }
}

function saveReleaseState(state: ReleaseState): void {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(releaseStatePath, `${JSON.stringify(state, null, 2)}\n`)
}

/**
 * `--workspaces=false` keeps this a plain registry query even though `cwd`
 * sits at a pnpm workspace root; `timeout` guarantees the call itself can
 * never outlast `waitForRegistry`'s own deadline, no matter what stalls.
 */
function versionOnNpm(name: string, version: string, { preferOnline = false } = {}): boolean {
  const args = ['view', `${name}@${version}`, 'version', '--workspaces=false']
  if (preferOnline)
    args.push('--prefer-online')

  const probe = spawnSync('npm', args, {
    cwd: workspaceDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15_000,
  })
  return probe.status === 0 && probe.stdout.trim() === version
}

/**
 * Poll until the published version resolves. `--prefer-online` is essential:
 * without it every poll is answered by the packument npm cached on the first
 * poll, taken before propagation, and the wait times out against its own
 * stale cache.
 *
 * A brand-new package name (this project's first-ever release) propagates
 * slower than a version bump on an existing one, so this routinely takes a
 * couple of minutes with nothing to show for it — print progress so that
 * looks like patience, not a hang.
 */
function waitForRegistry(name: string, version: string): void {
  step('registry propagation')
  console.log(`waiting for ${name}@${version} to resolve on npm (up to 5 minutes; longer on a package's first-ever release)…`)
  const deadline = Date.now() + 300_000
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4))
  let attempt = 0

  while (Date.now() < deadline) {
    if (versionOnNpm(name, version, { preferOnline: true })) {
      console.log(`✓ ${name}@${version} is live on npm`)
      return
    }

    attempt += 1
    if (attempt % 6 === 0)
      console.log(`  … still waiting (${Math.round((Date.now() - (deadline - 300_000)) / 1000)}s elapsed)`)

    Atomics.wait(waitBuffer, 0, 0, 5_000)
  }

  fail([
    `${name}@${version} did not appear on npm within five minutes.`,
    `  The publication itself already happened — re-run the same publish command to resume the wait.`,
  ].join('\n'))
}

/** Idempotent: commits the version bump only if it isn't already committed. */
function ensureCommitted(version: string, state: ReleaseState): void {
  if (state.committed) {
    console.log(`✓ release commit already present`)
    return
  }

  run('git', ['add', 'sdk/package.json'])
  if (capture('git', ['diff', '--cached', '--name-only']) !== '')
    run('git', ['commit', '-m', `🔖 release v${version}`])
  else
    console.log('  sdk/package.json already reflects the published version — nothing to commit')

  state.committed = true
  saveReleaseState(state)
}

/** Idempotent: tags `HEAD` only if the release tag doesn't already exist. */
function ensureTagged(version: string, state: ReleaseState): void {
  const tag = `v${version}`
  if (state.tagged) {
    console.log(`✓ ${tag} already created`)
    return
  }

  if (capture('git', ['tag', '--list', tag]) === '')
    run('git', ['tag', '-a', tag, '-m', `🔖 release ${tag}`])
  else
    console.log(`  ${tag} already exists — leaving it as-is`)

  state.tagged = true
  saveReleaseState(state)
}

/** Idempotent: pushes the current branch and release tag only once. */
function ensurePushed(version: string, state: ReleaseState): void {
  const tag = `v${version}`
  if (state.pushed) {
    console.log(`✓ ${tag} already pushed`)
    return
  }

  const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  run('git', ['push', 'origin', branch, tag])

  state.pushed = true
  saveReleaseState(state)
}

function dryRun(): void {
  const receipt = loadReceipt(contentDigest())
  gate(receipt)
  smoke(receipt)
  console.log('\n✓ publish dry run complete')
}

function publishSdk(bump: Bump): void {
  const manifest = readManifest()
  let state = loadReleaseState()

  if (state !== undefined && state.version === manifest.version) {
    console.log(`↻ resuming release v${state.version} — it is already published; not bumping again`)
  }
  else {
    if (state !== undefined) {
      console.log(`⚠ discarding a stale release record (v${state.version}); starting a fresh ${bump} release`)
      rmSync(releaseStatePath, { force: true })
    }

    step('preflight')
    if (capture('git', ['status', '--porcelain']) !== '')
      fail('publishing requires a clean working tree — commit or stash pending changes first')

    const whoami = spawnSync('npm', ['whoami'], {
      cwd: workspaceDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    })
    const account = whoami.stdout?.trim()
    if (whoami.status !== 0 || account === undefined || account === '')
      fail('not authenticated to npm — run npm login first (sessions expire)')

    const next = bumpVersion(manifest.version, bump)
    if (versionOnNpm(manifest.name, next))
      fail(`${manifest.name}@${next} already exists on npm`)
    console.log(`✓ publishing as ${account}: ${manifest.name} ${manifest.version} → ${next}`)

    const receipt = loadReceipt(contentDigest())
    gate(receipt)
    smoke(receipt)

    const source = readFileSync(manifestPath, 'utf8')
    const versionField = `"version": "${manifest.version}"`
    if (!source.includes(versionField))
      fail(`could not find ${versionField} in sdk/package.json`)

    try {
      step(`version ${manifest.version} → ${next}`)
      writeFileSync(manifestPath, source.replace(versionField, `"version": "${next}"`))
      run('pnpm', ['run', 'sdk:build'])

      step(`publish ${manifest.name}@${next}`)
      run('pnpm', ['publish', '--access', 'public', '--no-git-checks'], packageDir)
    }
    catch (error) {
      writeFileSync(manifestPath, source)
      fail([
        `release aborted before publication — sdk/package.json restored to ${manifest.version}`,
        `  ${error instanceof Error ? error.message : String(error)}`,
      ].join('\n'))
    }

    state = { version: next, bump, publishedAt: new Date().toISOString(), committed: false, tagged: false, pushed: false }
    saveReleaseState(state)
  }

  try {
    waitForRegistry(manifest.name, state.version)
    ensureCommitted(state.version, state)
    ensureTagged(state.version, state)
    ensurePushed(state.version, state)
  }
  catch (error) {
    fail([
      error instanceof Error ? error.message : String(error),
      `${manifest.name}@${state.version} is published, but a later step failed.`,
      `Resume by re-running: pnpm run publish:sdk:${state.bump}`,
    ].join('\n'))
  }

  rmSync(releaseStatePath, { force: true })
  step(`v${state.version} released`)
  console.log(`  Attach release notes: ${manifest.homepage}/releases/new?tag=v${state.version}`)
}

const [command] = process.argv.slice(2)

switch (command) {
  case 'dry-run':
    dryRun()
    break
  case 'patch':
  case 'minor':
  case 'major':
    publishSdk(command)
    break
  default:
    fail(`unknown command '${command ?? ''}' — use dry-run, patch, minor, or major`)
}
