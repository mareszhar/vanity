import { colorSchemes, createSystem } from '@mszr/vanity'
import { setCustomProperties, setCustomProperty } from '@mszr/vanity/runtime'

const open = createSystem().addAxis('scheme', colorSchemes())
const ds = open.addTokens({
  color: {
    brand: open.tdef.color({
      val: open.oklch(0.58, 0.2, 285),
      mutable: true,
      axes: { scheme: { dark: open.oklch(0.72, 0.16, 285) } },
    }),
  },
}).consolidate({ root: '#widget', prefix: 'runtime-doc' })
const runtime = ds.runtime()

runtime.t.color.brand.$set('oklch(62% 0.2 210)')
runtime.t.color.brand.$axes.scheme.dark.$set('oklch(72% 0.16 210)')
runtime.transaction(tx => tx.t.color.brand.$set('hotpink'))
runtime.t.color.brand.$unset()
runtime.axes.scheme.$switchTo('dark')

const external = open.customProperty('--external-brand', { type: 'color' })
setCustomProperty(document.documentElement, external, 'rebeccapurple')
setCustomProperties(document.documentElement, [[ds.t.color.brand, 'hotpink']])

const snapshot = runtime.snapshot()
void ds.runtimeProps(snapshot)
void ds.reconcileRuntimeSnapshot(snapshot)
