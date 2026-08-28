import { join } from 'node:path'
import { build } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { compilerProjection } from '../src/plugin.ts'
import { precompilePackage } from '../src/precompile.ts'
import {
  importFresh,
  joinedByExtension,
  occurrences,
  readTree,
  spikeRoot,
  temporaryDirectory,
  writeConsumer,
} from './helpers.ts'

describe('a precompiled contract consumed from package dist', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__precompiledProbe
  })

  it('uses the dist artifact for projection while retaining build closures for style compilation', async () => {
    const work = await temporaryDirectory('precompiled')
    const library = await precompilePackage({
      entry: join(spikeRoot, 'fixtures/precompiled/system.ts'),
      outputDirectory: join(work, 'library/dist'),
    })
    const consumer = join(work, 'consumer')
    await writeConsumer(consumer, library.entry)

    const output = join(work, 'consumer-dist')
    const harness = compilerProjection({
      contracts: [{ entry: library.entry, artifact: library.artifact }],
      target: 'browser',
      layerOrder: ['vendor', 'precompiled'],
      artifactDirectory: join(work, 'artifacts'),
    })

    await build({
      root: consumer,
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
          entry: join(consumer, 'entry.ts'),
          formats: ['es'],
          fileName: () => 'entry.js',
        },
      },
    })

    const files = await readTree(output)
    const javascript = joinedByExtension(files, '.js')
    const css = joinedByExtension(files, '.css')
    expect(javascript).toContain('RUNTIME_FACADE_SENTINEL')
    expect(javascript).not.toContain('PRECOMPILED_BUILD_SENTINEL')
    expect(occurrences(css, '--projection-system-artifact')).toBe(1)
    expect(css).toContain('"from-library"')

    const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(harness.snapshot().manifestFile, 'utf8')) as {
      systems: Array<{ precompiled: boolean }>
    }
    expect(manifest.systems).toHaveLength(1)
    expect(manifest.systems[0]!.precompiled).toBe(true)

    await importFresh(join(output, 'entry.js'))
    expect((globalThis as Record<string, unknown>).__precompiledProbe).toMatchObject({
      plane: 'RUNTIME_FACADE_SENTINEL',
      className: 'from-library',
    })
  })
})
