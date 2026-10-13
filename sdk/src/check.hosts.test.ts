import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { createVitest } from 'vitest/node'
import { build as buildWxt } from 'wxt'
import { checkProject } from './check'
import { installTestSdk } from './test-support/installedSdk'

interface HostReceipt {
  configure: number
  starts: string[]
  closes: string[]
  css: string[]
  diagnostics: unknown[]
}

describe('headless framework compiler parity', () => {
  it.each(['wxt', 'vitest'] as const)('matches %s CSS and diagnostics through the configured client pipeline', async (host) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), `vanity-check-${host}-`)))
    await installTestSdk(root)
    await writeFile(join(root, 'package.json'), '{"name":"check-framework-parity","type":"module"}')
    await writeFile(join(root, 'system.ts'), `import{createSystem}from'@mszr/vanity';export const ds=createSystem({declarations:{level:'discourage',tokens:['length']}}).consolidate()`)
    await writeFile(join(root, 'chosen.ts'), `export const chosen='client'`)
    await mkdir(join(root, 'node_modules/@fixture/choice'), { recursive: true })
    await writeFile(join(root, 'node_modules/@fixture/choice/package.json'), JSON.stringify({ name: '@fixture/choice', type: 'module', exports: { browser: './browser.js', node: './node.js', default: './node.js' } }))
    for (const target of ['browser', 'node'])
      await writeFile(join(root, `node_modules/@fixture/choice/${target}.js`), `export const chosen='${target}'`)
    await writeFile(join(root, 'row.css.ts'), `import{chosen as a}from'string-alias';import{chosen as b}from'regex-alias';import{chosen as c}from'plugin-choice';import{chosen as d}from'@fixture/choice';import{chosen as e}from'virtual-choice';export const row=ds.class({padding:'13px',fontFamily:JSON.stringify([a,b,c,d,e].join(' '))})`)
    const key = Symbol.for(`vanity.check.host.${root}`)
    const receipt = () => (globalThis as unknown as Record<symbol, HostReceipt>)[key]!
    const config = `import{vanityPlugin}from'@mszr/vanity/vite';import{fileURLToPath}from'node:url';const root=fileURLToPath(new URL('.',import.meta.url));const receipt=globalThis[Symbol.for(${JSON.stringify(key.description)})]={configure:0,starts:[],closes:[],css:[],diagnostics:[]};const plugin={name:'headless-receipt',enforce:'pre',configureServer(){receipt.configure++},buildStart(){receipt.starts.push(this.environment?.name)},closeBundle(){receipt.closes.push(this.environment?.name)},resolveId(id){if(id==='plugin-choice')return root+'chosen.ts';if(id==='virtual-choice')return '\\0virtual-choice'},load(id){if(id==='\\0virtual-choice')return 'export const chosen="virtual"'},transform(code,id){if(id.split('?')[0].endsWith('.vanity.css'))receipt.css.push(code)}};const vite={logLevel:'silent',resolve:{alias:[{find:'string-alias',replacement:root+'chosen.ts'},{find:/^regex-alias$/,replacement:root+'chosen.ts'}]},optimizeDeps:{noDiscovery:true},server:{middlewareMode:true,hmr:false,ws:false,watch:null},plugins:[plugin,...vanityPlugin({compiler:{system:'./system.ts',diagnostics:d=>receipt.diagnostics.push(d)},autoImports:{style:'$system'}})]};export default ${host === 'wxt' ? '{manifest:{name:"Parity",version:"0.0.0"},webExt:{disabled:true},vite:()=>vite}' : 'vite'}`
    await writeFile(join(root, `${host}.config.mjs`), config)
    try {
      const checked = await checkProject({ root })
      const checkLifecycle = structuredClone(receipt())
      expect(checked.report.exitCode).toBe(0)
      expect(checkLifecycle.configure).toBe(1)
      if (host === 'wxt') {
        await mkdir(join(root, 'entrypoints/popup'), { recursive: true })
        await writeFile(join(root, 'entrypoints/popup/index.html'), '<script type="module" src="./main.ts"></script>')
        await writeFile(join(root, 'entrypoints/popup/main.ts'), `import{row}from'../../row.css.ts';console.log(row)`)
        await buildWxt({ root })
      }
      else {
        const vitest = await createVitest({ root, config: join(root, 'vitest.config.mjs'), watch: false, api: false }, { root, mode: 'production' })
        try {
          const result = await vitest.vite.transformRequest('/row.css.ts')
          const imports = result!.deps?.filter(id => id.endsWith('.vanity.css')) ?? []
          expect(imports.length).toBeGreaterThan(0)
          for (const id of imports)
            await vitest.vite.transformRequest(id)
        }
        finally {
          await vitest.close()
        }
        await writeFile(join(root, 'entry.ts'), `import{row}from'./row.css.ts';console.log(row)`)
        await build({ root, configFile: join(root, 'vitest.config.mjs'), logLevel: 'silent', build: { write: false, lib: { entry: join(root, 'entry.ts'), formats: ['es'] } } })
      }
      expect(receipt().css.sort()).toEqual([...checked.css.values()].sort())
      expect(receipt().diagnostics).toEqual(checked.report.diagnostics.map(({ identity, evidence, accepted, ...diagnostic }) => diagnostic))
    }
    finally {
      delete (globalThis as unknown as Record<symbol, HostReceipt>)[key]
    }
  })
})
