import type { Rollup } from 'vite'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { vanityPlugin } from '@mszr/vanity/vite'
import { build } from 'vite'
import { expect, it } from 'vitest'
import { installTestSdk } from '../../test-support/installedSdk'

const vanityRoot = fileURLToPath(new URL('../../', import.meta.url))
const alias = {
  '@mszr/vanity/runtime/range': join(vanityRoot, 'runtime-range.ts'),
  '@mszr/vanity/runtime': join(vanityRoot, 'runtime.ts'),
  '@mszr/vanity': join(vanityRoot, 'index.ts'),
}

it.each([{ range: false, standalone: false }, { range: true, standalone: false }, { range: false, standalone: true }, { range: true, standalone: true }])('application backing supplies range enforcement only when declared: $range, standalone: $standalone', async ({ range, standalone }) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vanity-runtime-range-')))
  try {
    await installTestSdk(root)
    await writeFile(join(root, 'package.json'), '{"name":"runtime-range","type":"module"}')
    const system = join(root, 'system.ts')
    await writeFile(system, `import {createSystem,number} from '@mszr/vanity';export const ds=createSystem().addTokens(h=>({role:h.tdef({val:number(0.5),mutable:true,${range ? 'range:[0,1],' : ''}})})).consolidate({prefix:'range'});`)
    if (standalone)
      await writeFile(join(root, 'style.css.ts'), `import {ds} from './system';export const {runtime,snapshotFrom,runtimeProps,reconcileRuntimeSnapshot}=ds;`)
    const entry = join(root, 'entry.ts')
    await writeFile(entry, `${standalone ? 'import * as ds from \'./style.css.ts\';' : 'import {ds} from \'./system\';'}
const target=()=>({style:{setProperty(){},removeProperty(){return ''},getPropertyValue(){return ''}},matches(){return true},setAttribute(){},removeAttribute(){},getAttribute(){return null}});
export function inspect(input){const snapshot={...ds.snapshotFrom(()=>{}),overrides:[{token:['role'],address:{kind:'base'},val:input}]};const hydrated=ds.runtime({within:target()});hydrated.hydrate(snapshot);return {ssr:ds.runtimeProps(snapshot),reconcile:ds.reconcileRuntimeSnapshot(snapshot),hydrate:hydrated.snapshot(),initial:ds.runtime({within:target(),initial:snapshot}).snapshot()};}
export const write=input=>ds.snapshotFrom(rt=>rt.t.role.$set(input));`)
    const result = await build({ root, configFile: false, logLevel: 'silent', plugins: [vanityPlugin(standalone ? {} : { compiler: { system } })], resolve: { alias }, build: { write: false, minify: false, lib: { entry, formats: ['es'] } } })
    const output = (Array.isArray(result) ? result[0] : result) as Rollup.RollupOutput
    const chunk = output.output.find((item): item is Rollup.OutputChunk => item.type === 'chunk')!
    expect(chunk.code.includes('function getTokenRangeError')).toBe(range)
    const path = join(root, 'application.mjs')
    await writeFile(path, chunk.code)
    const app = await import(pathToFileURL(path).href)
    expect(app.write(0.5).overrides[0].val).toBe(0.5)
    if (range)
      expect(() => app.write(2)).toThrow(/outside inclusive range/)
    else
      expect(app.write(2).overrides[0].val).toBe(2)
    for (const input of [0.5, 2]) {
      const result = app.inspect(input)
      const rejected = range && input === 2
      expect(result.reconcile.diagnostics.length > 0).toBe(rejected)
      expect(result.hydrate.overrides.length).toBe(rejected ? 0 : 1)
      expect(result.initial.overrides.length).toBe(rejected ? 0 : 1)
      expect(Object.values(result.ssr.$system.style)).toEqual(rejected ? [] : [String(input)])
    }
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}, 60000)
