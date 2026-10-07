# Color

## Author in OKLCH

`open.oklch(l, c, h, alpha?)` — lightness 0–1, chroma ~0–0.37, hue in degrees. Equal lightness steps look equal across hues, which makes palettes, contrast, and dark modes predictable. Other spaces exist with the same grammar (`rgb`, `hsl`, `hwb`, `lab`, `lch`, `oklab`, `color('display-p3 …')`, `color('#635bff')`); authored leaves keep their notation in the emitted CSS.

## Derive instead of hand-picking

```ts
const palette = open.defineTokens()
  .add('hue', { val: 265, mutable: true, register: true })
  .add(m => ({
    accent: open.oklch(0.58, 0.16, m.hue),
    canvas: open.oklch(0.99, 0.006, m.hue),       // neutrals tinted by the same hue
    ink: open.oklch(0.2, 0.02, m.hue),
  }))
  .add(m => ({
    accentHover: open.oklch.darken(m.accent, 0.06),        // relative channel adjustment
    accentSoft: open.oklch.from(m.accent, { l: 0.95, c: 0.04 }),  // replace channels
    border: open.colorMix([m.canvas, [m.ink, 12]]).in('oklab'),   // mix: [color, [color, percent]]
    scrim: open.alpha(m.ink, 0.45),                        // alpha on any color
    onAccent: open.legibleOn(m.accent),                    // black or white by APCA contrast
  }))
```

- `oklch.lighten/darken(color, Δl)`, `oklch.saturate/desaturate(color, Δc)`, `oklch.rotate(color, Δh)` adjust one channel; `.from(color, { l, c, h, alpha })` replaces channels and may use `channel.add(…)` style operations for relative edits.
- `colorMix(...)` always needs an interpolation space: `.in('oklab')` (or set `createSystem({ color: { mixSpace: 'oklab' } })`).
- Static expressions are folded to plain colors at build time when that's exactly equivalent; anything that depends on a mutable or per-mode token stays native CSS (`oklch(from var(--…) …)`), so it re-derives live in the browser when the seed changes where the system declares it (the runtime writes seeds at the root). Overriding a seed lower in the tree doesn't recompute dependents there.
- A mutable `hue` (or lightness/chroma) seed lets one runtime control re-tint the whole palette. Keep lightness and chroma authored so the palette's structure stays designed.

## Contrast

- `legibleOn(background)` picks black or white for text on that background; use it for `on*` roles. It's a token definition, not a style value.
- Define text/background roles in pairs (`accent` + `onAccent`, `danger` + `onDanger`) so components never guess.
- `legibleOn` picks once, at build time, from the background's authored value. For a **static** background it **fails the build** (APCA Lc 60, per scheme and axis mode) when even the best pick is illegible. Static covers literal colors, `lightDark()` literals, per-mode literals, aliases of static tokens, and `alpha`/`lighten`/`darken`/`from`/`colorMix` over static tokens.
- Two kinds of background currently skip the check silently and keep the authored-default pick: one that depends on a **mutable** token, and one whose **channels are tokens** (`oklch(0.6, 0.15, m.hue)`), even when that token is immutable. Treat other forms that embed a token in a raw CSS value the same way until you've seen them fail.

For those, test the pairing yourself. With a live seed, the page keeps the foreground picked at the authored seed while the runtime moves the background, so check **that** foreground across the seed's whole range, not just its endpoints (hue 0° and 360° are the same color; failures hide in between). Share the color formula between the system and a test:

```ts
// design/accent.ts — one formula for the system and the test
import type { VanityHueChannel, VanityOpenSystemBase } from '@mszr/vanity'

export function accentAt(open: VanityOpenSystemBase, hue: VanityHueChannel) {
  return open.oklch(0.6, 0.15, hue)
}

// system: .add(m => ({ accent: accentAt(open, m.hue) })).add(m => ({ onAccent: open.legibleOn(m.accent) }))
```

Each sample builds the accent at one hue as a static color, so `legibleOn` checks it and reports which color it would pick. A sample that fails, or that would pick the other color, is a hue where the foreground the page keeps doesn't reach Lc 60 (on a background, at most one of black and white can):

```ts
// accent.test.ts
import { createSystem } from '@mszr/vanity'
import { expect, it } from 'vitest'
import { accentAt } from './design/accent.ts'
import { ds } from './design/system.ts'

it('keeps the live on-accent color legible at every hue', () => {
  const live = ds.t.color.onAccent.$val   // the pick the page keeps while the hue moves
  const failing: number[] = []
  for (let hue = 0; hue < 360; hue += 5) {
    const open = createSystem()
    try {
      const sample = open.addTokens(open.defineTokens()
        .add('accent', accentAt(open, hue))
        .add(m => ({ onAccent: open.legibleOn(m.accent) })))
        .consolidate()
      if (sample.t.onAccent.$val !== live)
        failing.push(hue)
    }
    catch {
      failing.push(hue)   // neither black nor white reaches Lc 60
    }
  }
  expect(failing).toEqual([])
})
```

Sampling every 5° is evidence, not proof; if a sampled hue is borderline, tighten the lightness or chroma rather than the step. Keep the seed's lightness and chroma fixed where legibility depends on them. If the accent also varies by scheme or mode, sample each branch.

## Palettes from a scale

```ts
import { mapRecord } from '@mszr/vanity'

const lightness = { lightest: 0.97, lighter: 0.9, light: 0.78, base: 0.62, dark: 0.45, darkest: 0.25 } as const

const blue = mapRecord(lightness, l => open.oklch(l, 0.14, 255))  // keys stay literal: t.blue.base
const tokens = open.defineTokens({ blue })
```

`mapRecord`, `fromEntries`, and `range` from `@mszr/vanity` keep literal keys (the standard library widens them to `string`, which loses completion). Name steps with words or a letter prefix (`s500`), not bare numbers: numeric keys aren't addressable on `t`, and lint autofix strips the quotes that would make `'500'` work.

Primitive scales like this are for the system's own derivations; components should use semantic roles that point at them.
