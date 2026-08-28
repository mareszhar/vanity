import { availableParallelism } from 'node:os'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

function local(path: string) {
  return fileURLToPath(new URL(path, import.meta.url))
}

export default defineConfig({
  resolve: {
    alias: {
      // Tests import the package exactly the way userland does; the tsconfig
      // `paths` carry the same mapping for the type/editor-DX planes.
      '@test/legacy': local('./src/test-support/legacy.ts'),
      '@test': local('./src/test-support/index.ts'),
      '@mszr/vanity/capabilities': local('./src/capabilities.ts'),
      '@mszr/vanity/runtime': local('./src/runtime.ts'),
      '@mszr/vanity/imports': local('./src/imports.ts'),
      '@mszr/vanity/testing': local('./src/testing.ts'),
      '@mszr/vanity/presets': local('./src/presets.ts'),
      '@mszr/vanity/vite': local('./src/vite.ts'),
      '@mszr/vanity/vue': local('./src/vue.ts'),
      '@mszr/vanity/nuxt': local('./src/nuxt.ts'),
      '@mszr/vanity': local('./src/index.ts'),
    },
  },
  test: {
    globals: true,
    // Selenita spins up a TypeScript language service for the editor-DX suites;
    // CI runners can exceed Vitest's default budgets.
    hookTimeout: 30_000,
    // Rename-symbol fixtures each hydrate two whole-project language services.
    // Parallel DX suites can make that cross the old 30s ceiling on otherwise
    // healthy runs; keep the contract assertion deterministic under load.
    testTimeout: 60_000,
    // Runtime (*.test.ts), editor-DX (*.dx.test.ts), and output (*.out.test.ts)
    // planes all match this.
    include: ['src/**/*.test.ts'],
    // Each editor-DX worker owns a TypeScript language service. On a 10-core
    // maintainer host, Vitest's default oversubscribed the compiler and made
    // the suite ~40% slower. Leave a core for the host and cap language-service
    // concurrency at the measured sweet spot.
    maxWorkers: process.env.CI ? 2 : Math.max(1, Math.min(6, availableParallelism() - 1)),
    typecheck: {
      // The type-shape plane, run via --typecheck (wired into the test scripts).
      // Vitest forces tsc --incremental into a shared cache under vitest/dist;
      // the shim delegates to tsc after stripping those cache flags.
      checker: local('../scripts/vitest-typecheck.ts'),
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
})
