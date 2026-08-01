// The Panda lane's config — tokens spread in from @prism/domain, so the
// decisions stay shared while the authoring model is Panda's own.
import { defineConfig } from '@pandacss/dev'
import { color, duration, font, lightDark, radius, space } from '@prism/domain'

export default defineConfig({
  include: ['./src/lanes/panda/**/*.vue'],
  preflight: false,
  presets: [],
  outdir: 'styled-system',
  // Panda's default layer names (base, utilities, …) collide with Tailwind's
  // in this five-stack app; @layer order is global and first-declaration-wins,
  // so shared names interleave the two frameworks. Namespacing by hand is the
  // workaround — the vanity lane nests under its prefix automatically.
  layers: {
    reset: 'panda-reset',
    base: 'panda-base',
    tokens: 'panda-tokens',
    recipes: 'panda-recipes',
    utilities: 'panda-utilities',
  },
  theme: {
    tokens: {
      colors: {
        brand: { value: color.brand },
        brandHover: { value: lightDark(color.brandHover) },
        brandSoft: { value: lightDark(color.brandSoft) },
        onBrand: { value: color.onBrand },
        surface: { value: lightDark(color.surface) },
        surfaceRaised: { value: lightDark(color.surfaceRaised) },
        border: { value: lightDark(color.border) },
        inkMuted: { value: lightDark(color.inkMuted) },
        ink: { value: lightDark(color.ink) },
      },
      spacing: {
        xs: { value: space.xs },
        sm: { value: space.sm },
        md: { value: space.md },
        lg: { value: space.lg },
      },
      radii: {
        sm: { value: radius.sm },
        md: { value: radius.md },
        pill: { value: radius.pill },
      },
      durations: {
        fast: { value: duration.fast },
      },
      fonts: {
        sans: { value: font.sans },
      },
    },
  },
})
