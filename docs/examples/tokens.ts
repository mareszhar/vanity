import { colorSchemes, createSystem, data } from '@mszr/vanity'

const open = createSystem()
  .addAxes({
    scheme: colorSchemes(),
    density: {
      modes: { compact: data('density', 'compact'), comfortable: '&' },
      default: 'comfortable',
    },
  })

const module = open.defineTokens({
  color: {
    brand: open.tdef.color({
      val: open.oklch(0.58, 0.2, 285),
      mutable: true,
      register: { syntax: '*', inherits: true },
      axes: { scheme: { dark: null } },
      cases: [{ when: { scheme: 'dark', density: 'compact' }, val: null }],
      description: 'Mutable base plus reserved authored branches.',
    }),
  },
  size: {
    external: open.tdef.length(),
    folded: open.tdef({ val: open.length.rem(64), reference: 'val', emit: false }),
  },
})

const ds = open.addTokens(module).consolidate({ prefix: 'tokens-doc' })

void ds.t.color.brand.$axes.scheme.dark.$val
void ds.t.color.brand.$case({ scheme: 'dark', density: 'compact' }).$val
void ds.tokensOf(module)
void ds.varsOf(ds.t.color)
