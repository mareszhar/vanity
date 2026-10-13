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
- `legibleOn` picks once, at build time, from the background's authored value. It **fails the build** below APCA Lc 60, per scheme and authored axis mode or case. The authored-default check includes literals, aliases, mutable backgrounds, token-valued channels, and supported `alpha`/`lighten`/`darken`/`from`/`colorMix` derivations. Deliberately unfoldable mixes use a representative approximation recorded in introspection; unsupported representatives fail with an actionable color diagnostic.
- A mutable background keeps the foreground picked at its authored value. Register a pairing with `addChecks` and declare each mutable dependency's `range` to sample the foreground the page retains.

For a formula authored inside the system, the compiler follows both sides under the same inputs and holds only compiled `legibleOn` picks fixed:

```ts
// design/system.ts — contrast over the declared hue range
import { angle, check, createSystem } from '@mszr/vanity'

const open = createSystem()
const color = open.defineTokens()
  .add('hue', { val: angle.deg(265), mutable: true, range: ['0deg', '360deg'] })
  .add(m => ({ accent: open.oklch(0.6, 0.15, m.hue) }))
  .add(m => ({ onAccent: open.legibleOn(m.accent) }))

export const ds = open.addTokens({ color })
  .addChecks(t => [check.textContrast(t.color.onAccent, t.color.accent)])
  .consolidate({ prefix: 'contrast' })
```

The angle grid uses 5° steps, including the ends; a mutable number uses 33 evenly spaced inputs and an integer samples only integers. Several inputs share a product capped at 1,024 points, with reductions reported. The runtime's type check, canonical validator input, fallback/omit policy and output range check determine which states are reachable. Development-only validation runs in both profiles; an unavailable or async validator limits evidence without turning an unknown sample into a failure. Passing samples are evidence for the declared range and validation, not proof of rendered contrast through opacity or overlays. Read those labels in `vanity check` and `explain`.

Keep a hand-written sampling test for a formula that lives outside the token graph. Hold its authored foreground fixed rather than choosing a new foreground at every sample:

```ts
// external-accent.test.ts
import { check, createSystem } from '@mszr/vanity'
import { expect, it } from 'vitest'

// A CSS string produced by application code outside the system's graph.
function externalAccentAt(hue: number) {
  return `oklch(0.6 0.15 ${hue})`
}

it('keeps the external accent legible with its authored foreground', () => {
  const open = createSystem()
  const ds = open.addTokens({ onAccent: open.legibleOn(externalAccentAt(265)) }).consolidate()
  const live = ds.t.onAccent.$val
  const failing: number[] = []
  for (let hue = 0; hue <= 360; hue += 5) {
    try {
      createSystem().addChecks(() => [check.textContrast(live, externalAccentAt(hue))]).consolidate()
    }
    catch {
      failing.push(hue)
    }
  }
  expect(failing).toEqual([])
})
```

If a sampled hue is borderline, adjust lightness or chroma rather than the grid. Declare other changing inputs in the system when possible so the compiler can sample their shared state.

## Palettes from a scale

```ts
import { mapRecord } from '@mszr/vanity'

const lightness = { lightest: 0.97, lighter: 0.9, light: 0.78, base: 0.62, dark: 0.45, darkest: 0.25 } as const

const blue = mapRecord(lightness, l => open.oklch(l, 0.14, 255))  // keys stay literal: t.blue.base
const tokens = open.defineTokens({ blue })
```

`mapRecord`, `fromEntries`, and `range` from `@mszr/vanity` keep literal keys (the standard library widens them to `string`, which loses completion). Name steps with words or a letter prefix (`s500`), not bare numbers: numeric keys aren't addressable on `t`, and lint autofix strips the quotes that would make `'500'` work.

Primitive scales like this are for the system's own derivations; components should use semantic roles that point at them.
