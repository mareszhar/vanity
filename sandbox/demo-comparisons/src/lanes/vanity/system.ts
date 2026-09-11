import type { VanityColorish } from '@mszr/vanity'
import { createSystem } from '@mszr/vanity'

/** The comparison lane uses the same additive open → locked system flow. */
const open = createSystem()

function plane(base: VanityColorish, position: number) {
  const neutral = open.lightDark(
    open.oklch(0.99 - 0.91 * position, 0, 0),
    open.oklch(0.13 + 0.86 * position, 0, 0),
  )
  return open.colorMix([neutral, [base, 4]]).in('oklab')
}

export const ds = open
  .addTokens({
    color: open.defineTokens({
      // One runtime seed — a single hue channel. The control writes only this,
      // and every dependent color re-derives through CSS. No mirrored JS palette,
      // and the authored lightness/chroma keep flowing through HMR.
      hue: open.tdef.number({
        val: 285,
        mutable: true,
        register: true,
        description: 'The live hue channel every color derives from.',
      }),
    })
      .add('brand', m => open.oklch(0.58, 0.2, m.hue))
      .add(m => ({
        onBrand: open.legibleOn(m.brand),
        canvas: plane(m.brand, 0),
        surface: plane(m.brand, 0.03),
        border: plane(m.brand, 0.2),
        inkMuted: plane(m.brand, 0.62),
        ink: plane(m.brand, 0.94),
      }))
      .add(m => ({
        brandHover: open.colorMix([m.brand, [m.ink, 12]]).in('oklab'),
        // The surface lifted toward the brand — opaque, like every other soft
        // plane. Alpha is for things that are actually transparent.
        brandSoft: open.colorMix([m.surface, [m.brand, 16]]).in('oklab'),
      })),
    space: { xs: open.length.px(4), sm: open.length.px(8), md: open.length.px(16), lg: open.length.px(24) },
    radius: { sm: open.length.px(6), md: open.length.px(10), pill: open.length.px(999) },
    duration: { fast: open.time.ms(120), normal: open.time.ms(200) },
  })
  .consolidate({
    prefix: 'compare',
    root: '[data-lane="vanity"]',
  })
