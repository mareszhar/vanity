import { createSystem } from '@mszr/vanity'
import { hail } from '@mszr/vanity/presets'

const open = createSystem()
  .addPlugin(hail({
    color: {
      elevation: true,
      ranges: { l: [0.08, 0.96], c: [0, 0.3] },
    },
    size: { base: 4 },
  }))

const ds = open.addTokens({
  color: { brand: open.oklch(0.58, 0.2, 285) },
  space: { md: open.length.rem(1) },
}).consolidate({ prefix: 'system-doc' })

void ds.class({
  background: ds.oklchx.from(ds.t.color.brand, { e: 0.04 }),
  padding: ds.bem(4),
})
