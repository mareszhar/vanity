#!/usr/bin/env tsx
/**
 * Run Vitest's typecheck plane through the workspace TypeScript binary while
 * removing cache flags Vitest injects. The SDK owns its incremental cache, so
 * letting parallel test workers share Vitest's cache path makes results race.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'

const requireFromCwd = createRequire(`${process.cwd()}/package.json`)
const tscBin = requireFromCwd.resolve('typescript/bin/tsc')
const args: string[] = []

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index]!

  if (arg === '--incremental')
    continue

  if (arg === '--tsBuildInfoFile') {
    index += 1
    continue
  }

  if (arg.startsWith('--tsBuildInfoFile='))
    continue

  args.push(arg)
}

const child = spawn(process.execPath, [tscBin, ...args], {
  cwd: process.cwd(),
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal)
    process.exit(signal === 'SIGINT' ? 130 : 143)

  process.exit(code ?? 1)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => child.kill(signal))
