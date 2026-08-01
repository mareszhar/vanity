#!/usr/bin/env tsx
/**
 * Install the Vanity commit guard by pointing the repository's Git hook path at
 * `.githooks`.
 *
 * `postinstall` runs this with `--optional`, so fresh installs get the guard
 *   when possible without making dependency installation fail in CI checkouts,
 *   tarball consumers, or worktrees where Git metadata is unavailable.
 *
 * Usage:
 *   pnpm run git:hooks:install        # strict; fails if Git cannot be updated
 *   tsx scripts/install-git-hooks.ts --optional
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const optional = process.argv.includes('--optional')
const HOOKS_PATH = '.githooks'
const PRE_COMMIT_HOOK = 'pre-commit'

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

function makeHookExecutable(root: string): void {
  const hookFile = path.join(root, HOOKS_PATH, PRE_COMMIT_HOOK)

  if (!fs.existsSync(hookFile)) {
    throw new Error(`Missing hook file: ${path.relative(root, hookFile)}`)
  }

  execFileSync('chmod', ['+x', hookFile], { cwd: root })
}

try {
  const root = git(['rev-parse', '--show-toplevel'])
  let current = ''

  try {
    current = git(['config', '--get', 'core.hooksPath'], root)
  }
  catch {
    // Unset is the normal first-run state.
  }

  makeHookExecutable(root)

  if (current !== HOOKS_PATH) {
    git(['config', 'core.hooksPath', HOOKS_PATH], root)
    console.log(`[vanity] git hooks installed (core.hooksPath -> ${HOOKS_PATH})`)
  }
  else {
    console.log(`[vanity] git hooks already installed (core.hooksPath -> ${HOOKS_PATH})`)
  }
}
catch (error) {
  if (optional) {
    process.exit(0)
  }

  const message = error instanceof Error ? error.message : String(error)
  console.error(`[vanity] failed to install git hooks: ${message}`)
  process.exit(1)
}
