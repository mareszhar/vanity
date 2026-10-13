// Measure base and ranged generated application backing separately; range cost never changes the base runtime ceiling.
import type { PluginOption, Rollup } from 'vite'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'vite'

export interface RuntimeMinifier {
  transformSync: (source: string, options: { format: 'esm', minify: true, target: 'es2022' }) => { code: string }
}

type VanityPlugin = (options: { compiler: { system: string } }) => PluginOption

interface EntrySize {
  readonly rawBytes: number
  readonly minifiedBytes: number
  readonly minGzipBytes: number
}

export interface RuntimeRangeMeasurement {
  readonly baseFixture: EntrySize
  readonly rangedFixture: EntrySize
  readonly delta: EntrySize
  readonly comparator: EntrySize
  readonly baseHasComparator: boolean
  readonly rangedHasComparator: boolean
}

export async function measureRuntimeRange(workspace: string): Promise<RuntimeRangeMeasurement> {
  const require = createRequire(join(workspace, 'sdk/package.json'))
  const { transformSync } = require('esbuild') as RuntimeMinifier
  const { vanityPlugin } = await import(pathToFileURL(join(workspace, 'sdk/dist/vite.mjs')).href)
  const measure = (source: string): EntrySize => {
    const minified = transformSync(source, { format: 'esm', minify: true, target: 'es2022' }).code
    return { rawBytes: Buffer.byteLength(source), minifiedBytes: Buffer.byteLength(minified), minGzipBytes: gzipSync(minified).byteLength }
  }
  const comparator = measure(await readFile(join(workspace, 'sdk/dist/runtime-range.mjs'), 'utf8'))
  const base = await measureFixture(workspace, false, vanityPlugin, measure)
  const ranged = await measureFixture(workspace, true, vanityPlugin, measure)
  if (base.hasComparator || !ranged.hasComparator)
    throw new Error('Generated runtime range enforcement must be present exactly when the schema declares a range')
  return {
    baseFixture: base.size,
    rangedFixture: ranged.size,
    delta: { rawBytes: ranged.size.rawBytes - base.size.rawBytes, minifiedBytes: ranged.size.minifiedBytes - base.size.minifiedBytes, minGzipBytes: ranged.size.minGzipBytes - base.size.minGzipBytes },
    comparator,
    baseHasComparator: base.hasComparator,
    rangedHasComparator: ranged.hasComparator,
  }
}

async function measureFixture(
  workspace: string,
  range: boolean,
  vanityPlugin: VanityPlugin,
  measure: (source: string) => EntrySize,
): Promise<{ readonly size: EntrySize, readonly hasComparator: boolean }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-bench-range-')))
  try {
    await mkdir(join(root, 'node_modules/@mszr'), { recursive: true })
    await symlink(join(workspace, 'sdk'), join(root, 'node_modules/@mszr/vanity'), 'dir')
    await writeFile(join(root, 'package.json'), '{"name":"vanity-bench-range","type":"module"}')
    const system = join(root, 'system.ts')
    await writeFile(system, `import {createSystem,number} from '@mszr/vanity';export const ds=createSystem().addTokens(h=>({role:h.tdef({val:number(0.5),mutable:true,${range ? 'range:[0,1],' : ''}})})).consolidate({prefix:'bench-range'});`)
    const entry = join(root, 'entry.ts')
    // Keep the same base public exports and generated system in both fixtures.
    await writeFile(entry, 'export * from \'@mszr/vanity/runtime\';export {ds} from \'./system\';')
    const result = await build({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin({ compiler: { system } })], build: { write: false, minify: false, lib: { entry, formats: ['es'] } } })
    const output = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
    const source = output.output.filter((item): item is Rollup.OutputChunk => item.type === 'chunk').map(chunk => chunk.code).join('\n')
    return { size: measure(source), hasComparator: source.includes('function getTokenRangeError') }
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}
