import type { VanityAxisControlRoot } from '../../sdk/src/system/axes'
import { createRequire } from 'node:module'
// Run: pnpm exec tsx tests/vanity/conditions.fixture.ts
// Emitted CSS only; native nesting supplies the browser spec's expectations.
import process from 'node:process'
import { createSystem, data, selector } from '../../sdk/src/index'
import { captureEmission } from '../../sdk/src/testing'
import { getRuntimeContract } from '../../sdk/src/tokens/module'

const compact = data('density', 'compact')
const anchored = selector('&').and(compact)
const ds = createSystem().addConditions({
  selected: data('selected'),
  self: data('selected').self,
  negated: anchored.not(),
  disjunction: anchored.or(data('selected')).not(),
  double: anchored.not().not(),
  literalList: selector('&[data-density=\'compact\'], &[data-selected]').not(),
}).consolidate()
const emitted = captureEmission(() => ({
  selected: ds.class({ selected: { padding: 9 } }),
  raw: ds.class({ '[data-selected]': { padding: 9 } }),
  self: ds.class({ self: { padding: 9 } }),
  negated: ds.class({ negated: { padding: 9 } }),
  disjunction: ds.class({ disjunction: { padding: 9 } }),
  double: ds.class({ double: { padding: 9 } }),
  literalList: ds.class({ literalList: { padding: 9 } }),
}))

const control = {
  id: 'density-review',
  read: (root: VanityAxisControlRoot) => root.getAttribute?.('data-density') === 'compact' ? 'default' as const : 'relaxed' as const,
  activate: (root: VanityAxisControlRoot, mode: string) => root.setAttribute('data-density', mode === 'default' ? 'compact' : 'relaxed'),
  project: (mode: string) => ({ attributes: { 'data-density': mode === 'default' ? 'compact' : 'relaxed' } }),
}
const open = createSystem().addAxis('density', {
  modes: { default: '&', relaxed: anchored.not() },
  default: 'default',
  control,
})
const axisSystem = open.addTokens({ width: open.tdef({ val: open.length.px(4), axes: { density: { relaxed: open.length.px(9) } } }) }).consolidate({ root: '.zone' })
const axis = captureEmission(() => axisSystem.class({ width: axisSystem.t.width }))
const seed = axisSystem.snapshotFrom(rt => rt.axes.density.$switchTo('relaxed'))
const props = axisSystem.runtimeProps(seed).$system!
const require = createRequire(new URL('../../sdk/package.json', import.meta.url))
const { buildSync } = require('esbuild') as typeof import('../../sdk/node_modules/esbuild')

const runtimeEntry = new URL('../../sdk/src/runtime.ts', import.meta.url).pathname
const { outputFiles } = buildSync({
  stdin: {
    contents: `import { restoreRuntimeControllerFactory, restoreRuntimeProps } from ${JSON.stringify(runtimeEntry)};
    const contract = ${JSON.stringify(getRuntimeContract(axisSystem.t))};
    const control = { id: 'density-review', read: ${control.read.toString()}, activate: ${control.activate.toString()}, project: ${control.project.toString()} };
    const rt = restoreRuntimeControllerFactory(contract)({ within: document.querySelector('#client'), controls: { 'density-review': control } });
    window.switchDensity = mode => {
      rt.axes.density.$switchTo(mode);
      return { snapshot: rt.snapshot(), props: restoreRuntimeProps(contract)(rt.snapshot()).$system, current: rt.axes.density.$current() };
    };`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
})
process.stdout.write(JSON.stringify({ ...emitted, axis: { ...axis, seed, props, runtime: outputFiles![0]!.text } }))
