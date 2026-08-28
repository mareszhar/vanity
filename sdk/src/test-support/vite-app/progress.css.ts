/** The spec's progress bar ([spec-ports.md §1]), built by a real bundler. */

import { ds } from './system'

const { class: cls, port, t } = ds

export const fraction = port(0)
export const tint = port(t.color.brand)

export const track = cls({
  background: t.color.surface,
  blockSize: t.space.sm,
})

export const fill = cls({
  inlineSize: `calc(${fraction} * 100%)`,
  background: tint,
  blockSize: '100%',
})
