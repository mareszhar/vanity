import { createSystem } from '@mszr/vanity'

/** The comparison lane uses the same additive open → locked system flow. */
const open = createSystem()

function plane<Base extends Parameters<typeof open.mix>[1]>(base: Base, position: number) {
  const neutral = open.lightDark(
    open.oklch(0.99 - 0.91 * position, 0, 0),
    open.oklch(0.13 + 0.86 * position, 0, 0),
  )
  return open.mix(neutral, base, 0.04)
}

const tokens = open.defineTokens({
  color: {
    // One runtime seed — a single hue channel. The control writes only this, and
    // every dependent color re-derives through CSS. No mirrored JS palette, and
    // the authored lightness/chroma keep flowing through HMR.
    hue: open.tdef.number({
      val: 285,
      mutable: true,
      register: { inherits: true },
      description: 'The live hue channel every color derives from.',
    }),
  },
  space: { xs: open.length.px(4), sm: open.length.px(8), md: open.length.px(16), lg: open.length.px(24) },
  radius: { sm: open.length.px(6), md: open.length.px(10), pill: open.length.px(999) },
  duration: { fast: open.time.ms(120), normal: open.time.ms(200) },
})
  .add(({ color }) => ({
    color: { brand: open.oklch(0.58, 0.2, color.hue) },
  }))
  .add(({ color }) => ({
    color: {
      onBrand: open.legibleOn(color.brand),
      canvas: plane(color.brand, 0),
      surface: plane(color.brand, 0.03),
      border: plane(color.brand, 0.2),
      inkMuted: plane(color.brand, 0.62),
      ink: plane(color.brand, 0.94),
    },
  }))
  .add(({ color }) => ({
    color: {
      brandHover: open.mix(color.brand, color.ink, 0.12),
      // The surface lifted toward the brand — opaque, like every other soft
      // plane. Alpha is for things that are actually transparent.
      brandSoft: open.mix(color.surface, color.brand, 0.16),
    },
  }))

export const ds = open
  .addTokens(tokens)
  .consolidate({
    prefix: 'compare',
    root: '[data-lane="vanity"]',
  })
