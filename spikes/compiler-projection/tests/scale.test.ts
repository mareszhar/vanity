import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { compilerProjection } from '../src/plugin.ts'
import {
  copyMutableFixture,
  joinedByExtension,
  occurrences,
  readTree,
} from './helpers.ts'

const STATIC_STYLE_COUNT = 12
const LAZY_STYLE_COUNT = 4

describe('bounded multi-importer scale', () => {
  it('deduplicates one contract across 16 style modules and four lazy chunks', async () => {
    const fixture = await copyMutableFixture()
    const staticImports: string[] = []
    const staticNames: string[] = []
    const lazyFactories: string[] = []

    for (let index = 0; index < STATIC_STYLE_COUNT; index++) {
      const name = `scale-static-${index}`
      await writeFile(join(fixture.app, `${name}.css.ts`), [
        `import { ds } from './system.ts'`,
        `export default ds.style('${name}', { color: ds.ref('brand') })`,
        '',
      ].join('\n'))
      staticImports.push(`import style${index} from './${name}.css.ts'`)
      staticNames.push(`style${index}`)
    }

    for (let index = 0; index < LAZY_STYLE_COUNT; index++) {
      const name = `scale-lazy-${index}`
      await writeFile(join(fixture.app, `${name}.css.ts`), [
        `import { ds } from './system.ts'`,
        `export default ds.style('${name}', { background: ds.ref('brand') })`,
        '',
      ].join('\n'))
      await writeFile(join(fixture.app, `${name}.ts`), [
        `import className from './${name}.css.ts'`,
        `export default className`,
        '',
      ].join('\n'))
      lazyFactories.push(`() => import('./${name}.ts')`)
    }

    const entry = join(fixture.app, 'entry-scale.ts')
    await writeFile(entry, [
      ...staticImports,
      `globalThis.__scaleStatic = [${staticNames.join(', ')}]`,
      `globalThis.__scaleLazy = [${lazyFactories.join(', ')}]`,
      '',
    ].join('\n'))

    const output = join(fixture.root, 'dist')
    const harness = compilerProjection({
      contracts: [fixture.system],
      target: 'browser',
      layerOrder: ['vendor', 'neutral'],
      artifactDirectory: join(fixture.root, 'artifacts'),
    })
    await build({
      root: fixture.app,
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
          entry,
          formats: ['es'],
          fileName: () => 'entry.js',
        },
      },
    })

    const files = await readTree(output)
    const css = joinedByExtension(files, '.css')
    expect(occurrences(css, '--projection-system-artifact')).toBe(1)
    expect(occurrences(css, '--projection-style-artifact')).toBe(STATIC_STYLE_COUNT + LAZY_STYLE_COUNT)

    const lazyCssFiles = [...files.entries()].filter(([file, contents]) => {
      return file.endsWith('.css') && contents.includes('--projection-style-artifact: "scale-lazy-')
    })
    expect(lazyCssFiles).toHaveLength(LAZY_STYLE_COUNT)
    for (const [, contents] of lazyCssFiles)
      expect(contents).not.toContain('--projection-system-artifact')
  })
})
