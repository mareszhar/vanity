import type { CompiledStyleDefinition, PortableContract } from './types.ts'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const workerFile = fileURLToPath(new URL('./worker.mjs', import.meta.url))

export const WORKER_TIMEOUT_MS = 8_000
export const WORKER_MAX_BUFFER = 1_000_000

async function runWorker<T>(action: 'contract' | 'style', input: string): Promise<T> {
  try {
    const { stdout } = await execFileAsync(process.execPath, [workerFile, action, input], {
      timeout: WORKER_TIMEOUT_MS,
      maxBuffer: WORKER_MAX_BUFFER,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    })
    return JSON.parse(stdout) as T
  }
  catch (error) {
    const detail = error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr)
      : error instanceof Error ? error.message : String(error)
    throw new Error(`[projection worker:${action}] ${detail.trim()}`)
  }
}

export function readContract(input: string): Promise<PortableContract> {
  return runWorker<PortableContract>('contract', input)
}

export function compileStyle(input: string): Promise<CompiledStyleDefinition> {
  return runWorker<CompiledStyleDefinition>('style', input)
}
