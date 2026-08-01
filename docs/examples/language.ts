import { colorSchemes, createSystem, data } from '@mszr/vanity'

export const open = createSystem()
  .addAxes({
    scheme: colorSchemes({ locality: 'element' }),
    density: {
      modes: {
        compact: data('density', 'compact'),
        comfortable: '&',
      },
      default: 'comfortable',
    },
  })

export const colors = open.defineTokens({
  color: {
    brand: open.tdef.color({
      val: open.oklch(0.62, 0.2, 285),
      mutable: true,
      axes: { scheme: { dark: open.oklch(0.72, 0.16, 285) } },
    }),
  },
})

export const ds = open.addTokens(colors).consolidate({ prefix: 'docs' })

void ds.class({
  color: ds.t.color.brand,
  padding: ds.length.em(2),
})
void ds.t.color.brand.$var('currentColor')
void ds.namesOf(colors)
