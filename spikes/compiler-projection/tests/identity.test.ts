import { join } from 'node:path'
import { build } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { compilerProjection } from '../src/plugin.ts'
import {
  appRoot,
  duplicateSystemA,
  duplicateSystemB,
  importFresh,
  joinedByExtension,
  occurrences,
  readTree,
  temporaryDirectory,
} from './helpers.ts'

describe('duplicate contract package instances', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__duplicateProjectionProbe
  })

  it('uses semantic identity for both compiler dedupe and runtime module resolution', async () => {
    const sourceA = await importFresh<{ ds: { instance: symbol, identities: Record<string, string> } }>(duplicateSystemA)
    const sourceB = await importFresh<{ ds: { instance: symbol, identities: Record<string, string> } }>(duplicateSystemB)
    expect(sourceA.ds.instance).not.toBe(sourceB.ds.instance)
    expect(sourceA.ds.identities).toEqual(sourceB.ds.identities)

    const work = await temporaryDirectory('duplicates')
    const output = join(work, 'dist')
    const harness = compilerProjection({
      contracts: [duplicateSystemA, duplicateSystemB],
      target: 'browser',
      cascade: ['vendor', 'duplicate'],
      artifactDirectory: join(work, 'artifacts'),
    })

    await build({
      root: appRoot,
      configFile: false,
      logLevel: 'silent',
      plugins: [harness.plugin],
      build: {
        outDir: output,
        emptyOutDir: true,
        minify: false,
        cssMinify: false,
        cssCodeSplit: true,
        lib: {
          entry: join(appRoot, 'entry-duplicates.ts'),
          formats: ['es'],
          fileName: () => 'entry.js',
        },
      },
    })

    const files = await readTree(output)
    const css = joinedByExtension(files, '.css')
    expect(occurrences(css, '--projection-system-artifact')).toBe(1)
    expect(occurrences(css, '--projection-style-artifact')).toBe(2)
    expect(harness.snapshot().compatibilityIds).toHaveLength(1)
    expect(harness.snapshot().runtimeModuleIds).toHaveLength(1)

    await importFresh(join(output, 'entry.js'))
    expect((globalThis as Record<string, unknown>).__duplicateProjectionProbe).toMatchObject({
      classes: ['copy-a', 'copy-b'],
      duplicateInstancesCollapsed: true,
    })
  })
})
