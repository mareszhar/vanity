import { createSystem, propertyAliases } from '@mszr/vanity'

const open = createSystem().addPlugin(propertyAliases({ py: 'paddingBlock' }, { expose: 'both' }))
const ds = open.addTokens({
  color: { brand: 'oklch(62% 0.2 285)' },
  space: { sm: open.length.rem(0.5), md: open.length.rem(1) },
}).consolidate({ prefix: 'patterns-doc' })
const gap = ds.port(ds.t.space.md)
const atoms = ds.atoms({ properties: { gap: ds.t.space } }, 'space-atoms')

void atoms({ gap: 'sm' })
void ds.class({
  display: 'flex',
  flexDirection: 'column',
  gap: ds.t.space.md,
  paddingBlock: ds.t.space.sm,
})
void ds.recipe({
  ports: { gap },
  base: { display: 'flex', paddingBlock: ds.t.space.sm, gap },
  variants: { intent: { brand: { color: ds.t.color.brand } } },
  defaults: { intent: 'brand' },
})
