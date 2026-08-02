import { open } from './open'

/**
 * One OKLCH seed drives the whole palette — but its channels are separate
 * tokens, so the studio's hue control writes only `--prism-color-hue`. Lightness
 * and chroma stay authored here: edit them and HMR reflects the change live,
 * because the runtime never redefines the color it only re-hues it.
 */
export const paletteTokens = open.defineTokens({
  color: open.defineTokens({
    hue: open.tdef.number({
      val: 275,
      mutable: true,
      register: true,
      description: 'The live hue channel, in degrees. The one runtime-addressable palette input.',
      metadata: { role: 'palette-seed' },
    }),
  })
    .add('brand', m =>
      // Lightness and chroma stay authored literals — editable through HMR —
      // while the hue channel is the single mutable custom property. Lightness
      // is held at a value where the derived foreground stays legible across
      // the whole hue range.
      open.oklch(0.60, 0.15, m.hue))
    /**
     * Every neutral is the same brand seed lifted through the elevation curve, so
     * one token set yields both schemes and re-tints itself as the hue moves.
     */
    .add(m => ({
      onBrand: open.legibleOn(m.brand),
      canvas: open.oklchx.from(m.brand, { e: 0, c: open.exact(0.012) }),
      surface: open.oklchx.from(m.brand, { e: 0.05, c: open.exact(0.014) }),
      raised: open.oklchx.from(m.brand, { e: 0.09, c: open.exact(0.018) }),
      overlay: open.oklchx.from(m.brand, { e: 0.13, c: open.exact(0.022) }),
      border: open.oklchx.from(m.brand, { e: 0.2, c: open.exact(0.026) }),
      borderStrong: open.oklchx.from(m.brand, { e: 0.32, c: open.exact(0.03) }),
      inkFaint: open.oklchx.from(m.brand, { e: 0.5, c: open.exact(0.034) }),
      inkMuted: open.oklchx.from(m.brand, { e: 0.68, c: open.exact(0.038) }),
      ink: open.oklchx.from(m.brand, { e: 0.97, c: open.exact(0.042) }),
    }))
    .add(m => ({
      // Softer brand planes are the canvas *lifted toward* the brand — opaque
      // colors, not transparency. Alpha would let whatever sits behind them
      // (grid lines, gradients, adjacent surfaces) bleed through; these are
      // surfaces, and a surface is not see-through.
      brandSoft: open.mix(m.canvas, m.brand, 0.14),
      brandMuted: open.mix(m.canvas, m.brand, 0.34),
      brandHover: open.mix(m.brand, m.ink, 0.14),
      brandActive: open.mix(m.brand, m.ink, 0.24),
      // Alpha belongs here: a scrim genuinely *is* transparent.
      scrim: open.alpha(m.ink, 0.55),
      positive: open.oklch(0.68, 0.14, 155),
      warning: open.oklch(0.76, 0.15, 75),
      danger: open.oklch(0.62, 0.2, 25),
      // The scheme half of every shadow: opaque in light, fully transparent in
      // the dark. As a color token it rides `light-dark()`, so an explicit light
      // scheme keeps its shadows even under an OS dark preference.
      shadowNear: open.lightDark(open.oklch(0, 0, 0, 0.06), open.oklch(0, 0, 0, 0)),
      shadowFar: open.lightDark(open.oklch(0, 0, 0, 0.1), open.oklch(0, 0, 0, 0)),
    })),
})

/**
 * Shadows combine two axes without a lookup table. Scheme is carried by the
 * shadow color (transparent in the dark); density is a real axis over the
 * geometry, lifting the layers for spacious layouts. Each is a layered stack,
 * never one muddy blur.
 */
export const shadowTokens = open
  .defineTokens()
  .add(paletteTokens)
  .add(m => ({
    shadow: {
      raised: open.tdef({
        val: `0 1px 2px ${m.color.shadowNear}, 0 4px 12px ${m.color.shadowFar}`,
        axes: {
          density: {
            compact: `0 1px 2px ${m.color.shadowNear}, 0 2px 6px ${m.color.shadowFar}`,
            spacious: `0 2px 4px ${m.color.shadowNear}, 0 12px 28px ${m.color.shadowFar}`,
          },
        },
        description: 'Resting surface lift; density lifts it, scheme fades it.',
      }),
      panel: open.tdef({
        val: `0 2px 6px ${m.color.shadowNear}, 0 16px 40px ${m.color.shadowFar}`,
        axes: {
          density: {
            compact: `0 1px 4px ${m.color.shadowNear}, 0 10px 26px ${m.color.shadowFar}`,
            spacious: `0 4px 10px ${m.color.shadowNear}, 0 28px 64px ${m.color.shadowFar}`,
          },
        },
        description: 'Floating depth for dialogs, menus, and popovers.',
      }),
    },
  }))
