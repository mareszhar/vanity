import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { globalLayer, style } from '@vanilla-extract/css'
import { removeAdapter, setAdapter } from '@vanilla-extract/css/adapter'
import { endFileScope, setFileScope } from '@vanilla-extract/css/fileScope'
import { transformCss } from '@vanilla-extract/css/transformCss'
import { build } from 'esbuild'

const root = await mkdtemp(join(tmpdir(), 'capture-contribution-'))
try {
  const source = `import {appendCss} from '@vanilla-extract/css/adapter'; import {getFileScope} from '@vanilla-extract/css/fileScope'; export const emit=names=>appendCss({type:'order',names},getFileScope());`
  await writeFile(join(root, 'emit.js'), source)
  // Independent copies retain their own closures but share the external backend.
  const emitters = []
  for (let i = 0; i < 2; i++) {
    const output = join(process.cwd(), `.probe-copy-${i}.mjs`)
    await build({
      entryPoints: [join(root, 'emit.js')],
      outfile: output,
      bundle: true,
      format: 'esm',
      packages: 'external',
    })
    emitters.push((await import(pathToFileURL(output).href)).emit)
  }
  function capture(operation) {
    const objects = []
    const classes = []
    const seen = new Map()
    setAdapter({
      appendCss(obj, scope) {
        if (obj.type === 'order') {
          const key = JSON.stringify(scope)
          let orders = seen.get(key)
          if (!orders) {
            orders = new Set()
            seen.set(key, orders)
          }
          const order = JSON.stringify(obj.names)
          if (orders.has(order))
            return
          orders.add(order)
          for (const name of obj.names) globalLayer(name)
        }
        else {
          objects.push(obj)
        }
      },
      registerClassName: c => classes.push(c),
      registerComposition() {},
      markCompositionUsed() {},
      onEndFileScope() {},
      getIdentOption: () => 'debug',
    })
    setFileScope('style.css.ts', 'capture-spike')
    try {
      operation()
      return transformCss({
        cssObjs: objects,
        localClassNames: classes,
        composedClassLists: [],
      }).join('\n')
    }
    finally {
      endFileScope()
      removeAdapter()
    }
  }
  const names = ['app', 'app.reset', 'app.recipes']
  const baseline = capture(() => {
    for (const name of names) globalLayer(name)
    style({ '@layer': { 'app.recipes': { color: 'red' } } })
  })
  for (let round = 0; round < 3; round++) {
    assert.equal(
      capture(() => {
        for (const emit of emitters) emit(names)
        style({ '@layer': { 'app.recipes': { color: 'red' } } })
      }),
      baseline,
    )
  }
  capture(() => {
    emitters[0](names)
    assert.equal(
      capture(() => {
        emitters[1](names)
        style({ '@layer': { 'app.recipes': { color: 'red' } } })
      }),
      baseline,
    )
    emitters[1](names)
    style({ '@layer': { 'app.recipes': { color: 'red' } } })
  })
  console.log(
    'PASS: 2 bundled copies, 3 repeated captures, nested restoration, deduplication and unchanged layer bytes',
  )
}
finally {
  await rm(root, { recursive: true, force: true })
  for (let i = 0; i < 2; i++) await rm(`.probe-copy-${i}.mjs`, { force: true })
}
