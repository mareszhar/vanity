/**
 * The Prism fixture design system — the one graph every evidence dimension exercises
 * ([workspace.md §5]). Mirrors the spec's snippets: a live brand seed,
 * relative-color surfaces, derivations, a checked pairing, a scheme pair, scales,
 * and composite text styles.
 */

import {
  alpha,
  container,
  createSystem,
  darken,
  legibleOn,
  lightDark,
  lighten,
  media,
  oklch,
  scale,
} from '../index'
import { substrate } from '../substrate'

/** Define the Prism tokens — call inside an emit runner or a style module. */
export function definePrism() {
  return consolidateFixture(prismOpen()).t
}

export type PrismTokens = ReturnType<typeof definePrism>

/** The Prism system — the spec's `createSystem` example over the Prism graph. */
export function definePrismSystem() {
  return consolidateFixture(prismOpen()
    .addConditions({
      open: '&[data-state="open"]',
      closed: '&[data-state="closed"]',
      md: media('(min-width: 768px)'),
      lg: media('(min-width: 1024px)'),
      cardWide: container('card', '(min-width: 400px)'),
    },
    ))
}

function prismOpen() {
  const open = createSystem()
  const tokens = open.defineTokens({
    color: {
      brand: open.tdef({
        val: oklch(0.58, 0.2, 285),
        mutable: true,
        description: 'Primary brand hue. Marketing owns this.',
      }),
      canvas: lightDark(oklch(0.99, 0.005, 285), oklch(0.14, 0.006, 285)),
    },
    space: scale.linear({ unit: 4, steps: { xs: 1, sm: 2, md: 4, lg: 6, xl: 10 } }).tokens(),
    radius: { sm: '4px', md: '8px', pill: '999px' },
    duration: { fast: '120ms', normal: '200ms' },
    text: {
      body: { fontSize: '1rem', lineHeight: 1.5, fontWeight: 400 },
      title: { fontSize: '1.375rem', lineHeight: 1.25, fontWeight: 600 },
    },
  }).add(m => ({
    color: {
      surface: lighten(m.color.brand, 0.24),
      ink: darken(m.color.brand, 0.4),
      brandSoft: alpha(m.color.brand, 0.12),
      brandHover: lighten(m.color.brand, 0.06),
      onBrand: legibleOn(m.color.brand),
    },
  }))

  return open.addTokens(tokens)
}

/** Test fixtures are often called from a CSS capture; system construction remains plain. */
function consolidateFixture<Locked extends object>(open: { readonly consolidate: () => Locked }): Locked {
  return substrate.modules.runInFileScope({
    filePath: 'src/test-support/prism.system.ts',
    packageName: '@prism/fixture',
  }, () => open.consolidate())
}

export type PrismSystem = ReturnType<typeof definePrismSystem>
