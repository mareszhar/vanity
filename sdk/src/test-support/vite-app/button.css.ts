/** The spec's button ([spec-recipes.md §1-2]), built by a real bundler. */

import { ds } from './system'

const { port, recipe, t } = ds

const paddingX = port(t.space.sm)

export const button = recipe({
  ports: { paddingX },
  base: { display: 'inline-flex', paddingInline: paddingX },
  variants: {
    intent: {
      brand: { background: t.color.brand, hover: { background: t.color.surface } },
      ghost: { background: 'transparent' },
    },
  },
  toggles: {
    pill: { borderRadius: '999px' },
  },
  defaults: { intent: 'brand' },
})
