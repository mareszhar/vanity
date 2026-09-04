/**
 * Remove application-generated state that can make validation read stale
 * ambient declarations.
 *
 * This list is deliberately explicit. It does not touch the repository-root
 * `.vanity/` directory, where release receipts and resumable release records
 * live. Application-local `.vanity/` output is disposable and is cleared here
 * so a validation run cannot read stale generated contracts.
 */

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const workspaceDir = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/** Generated declaration, adapter-cache, and contract paths owned by local hosts and fixtures. */
const validationPaths = [
  'sandbox/demo-comparisons/auto-imports.d.ts',
  'sandbox/demo-comparisons/node_modules/.vanity',
  'sandbox/demo-comparisons/node_modules/@types/vanity-style-auto-imports',
  'sandbox/demo-comparisons/node_modules/@types/vanity-app-auto-imports',
  'sandbox/demo-main/.nuxt',
  'sandbox/demo-main/.vanity/types',
  'sandbox/demo-main/node_modules/.cache/nuxt/.nuxt',
  'sandbox/demo-main/app/node_modules/.vanity',
  'sandbox/demo-main/app/.vanity',
  'sandbox/demo-comparisons/.vanity',
  'sdk/src/test-support/vite-app/.vanity',
  'sandbox/canary/.vanity',
  'spikes/ambient-boundary/host-generating/.vanity',
  'benchmarks/generated/small/.vanity',
  'benchmarks/generated/medium/.vanity',
  'benchmarks/generated/large/.vanity',
] as const

async function main(): Promise<void> {
  for (const relativePath of validationPaths)
    await rm(join(workspaceDir, relativePath), { force: true, recursive: true })

  console.log(`[vanity] cleared ${validationPaths.length} validation-generated path guards`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
