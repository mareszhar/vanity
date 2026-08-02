/**
 * The Prism fixture design system — the one graph every test plane exercises
 * ([workspace.md §5]). Mirrors the spec's snippets: a live brand seed,
 * relative-color surfaces, derivations, a checked pairing, a scheme pair, scales,
 * and composite text styles.
 */

import { createEngine } from '../engine/createEngine'

const de = createEngine()

/** Define the Prism tokens — call inside an emit harness or a style module. */
export function definePrism() {
  const tokens = de.defineTokens({
    color: {
      brand: de.token({
        val: de.oklch(0.58, 0.2, 285),
        mutable: true,
        description: 'Primary brand hue. Marketing owns this.',
      }),
      canvas: de.lightDark(de.oklch(0.99, 0.005, 285), de.oklch(0.14, 0.006, 285)),
    },
    space: de.scale.linear({ unit: 4, steps: { xs: 1, sm: 2, md: 4, lg: 6, xl: 10 } }).tokens(),
    radius: { sm: '4px', md: '8px', pill: '999px' },
    duration: { fast: '120ms', normal: '200ms' },
    text: {
      body: { fontSize: '1rem', lineHeight: 1.5, fontWeight: 400 },
      title: { fontSize: '1.375rem', lineHeight: 1.25, fontWeight: 600 },
    },
  })
    .derive(m => ({
      color: {
        surface: de.lighten(m.color.brand, 0.24),
        ink: de.darken(m.color.brand, 0.4),
        brandSoft: de.alpha(m.color.brand, 0.12),
        brandHover: de.lighten(m.color.brand, 0.06),
        onBrand: de.legibleOn(m.color.brand),
      },
    }))

  return de.createSystem({ tokens }).t
}

export type PrismTokens = ReturnType<typeof definePrism>

/** The Prism system — the spec's `createSystem` example over the Prism graph. */
export function definePrismSystem() {
  const tokens = de.defineTokens({
    color: {
      brand: de.token({
        val: de.oklch(0.58, 0.2, 285),
        mutable: true,
        description: 'Primary brand hue. Marketing owns this.',
      }),
      canvas: de.lightDark(de.oklch(0.99, 0.005, 285), de.oklch(0.14, 0.006, 285)),
    },
    space: de.scale.linear({ unit: 4, steps: { xs: 1, sm: 2, md: 4, lg: 6, xl: 10 } }).tokens(),
    radius: { sm: '4px', md: '8px', pill: '999px' },
    duration: { fast: '120ms', normal: '200ms' },
    text: {
      body: { fontSize: '1rem', lineHeight: 1.5, fontWeight: 400 },
      title: { fontSize: '1.375rem', lineHeight: 1.25, fontWeight: 600 },
    },
  }).derive(m => ({
    color: {
      surface: de.lighten(m.color.brand, 0.24),
      ink: de.darken(m.color.brand, 0.4),
      brandSoft: de.alpha(m.color.brand, 0.12),
      brandHover: de.lighten(m.color.brand, 0.06),
      onBrand: de.legibleOn(m.color.brand),
    },
  }))

  return de.createSystem({
    tokens,
    conditions: {
      open: '&[data-state="open"]',
      closed: '&[data-state="closed"]',
      md: de.media('(min-width: 768px)'),
      lg: de.media('(min-width: 1024px)'),
      cardWide: de.container('card', '(min-width: 400px)'),
    },
  })
}

export type PrismSystem = ReturnType<typeof definePrismSystem>
