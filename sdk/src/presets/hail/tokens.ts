import type {
  VanityPluginSetupSystem,
  VanityTokenInput,
} from '@mszr/vanity'
import type {
  HailConstructors,
  HailUtils,
} from './types'
import { hailExact } from './markers'

type HailPresetSystem
  = VanityPluginSetupSystem
    & HailConstructors<{ readonly color: { readonly elevation: true } }>
    & Pick<HailUtils<object>, 'size'>

interface HailPaletteHandles {
  readonly color: {
    readonly palette: {
      readonly accent: VanityTokenInput<'color'>
      readonly tinted: VanityTokenInput<'color'>
      readonly matte: VanityTokenInput<'color'>
    }
  }
}

/** Detached primitive palette module. */
export function createHailPaletteTokens(ds: HailPresetSystem) {
  return ds.defineTokens({
    color: {
      palette: {
        accent: ds.oklchx(hailExact(0.62), hailExact(0.18), hailExact(282)),
        tinted: ds.oklchx(hailExact(0.84), hailExact(0.08), hailExact(282)),
        matte: ds.oklchx(hailExact(0.35), hailExact(0.045), hailExact(282)),
      },
    },
  })
}

/** Detached semantic colors and `$dec`-ready typography bundles. */
export function createHailRoleTokens(ds: HailPresetSystem & { readonly t: HailPaletteHandles }, elevation: boolean) {
  const palette = ds.t.color.palette
  const canvas = elevation
    ? ds.oklchx.inE(hailExact(0.02), hailExact(0.012), hailExact(270))
    : ds.lightDark(ds.oklch(0.985, 0.008, 270), ds.oklch(0.14, 0.014, 270))
  const surface = elevation
    ? ds.oklchx.inE(hailExact(0.08), hailExact(0.014), hailExact(270))
    : ds.lightDark(ds.oklch(0.97, 0.01, 270), ds.oklch(0.18, 0.016, 270))
  const surfaceRaised = elevation
    ? ds.oklchx.inE(hailExact(0.16), hailExact(0.018), hailExact(270))
    : ds.lightDark(ds.oklch(0.945, 0.012, 270), ds.oklch(0.23, 0.02, 270))

  return ds.defineTokens({
    text: {
      body: {
        fontSize: '1rem',
        lineHeight: 1.5,
        fontWeight: 400,
      },
      label: {
        fontSize: '0.875rem',
        lineHeight: 1.3,
        fontWeight: 600,
      },
      heading: {
        fontSize: 'clamp(1.75rem, 4vw, 3rem)',
        lineHeight: 1.08,
        fontWeight: 700,
      },
    },
  } as const).add(() => ({
    color: {
      brand: ds.oklch.from(palette.accent, {}),
      onBrand: ds.legibleOn(palette.accent),
      canvas,
      surface,
      surfaceRaised,
      border: ds.lightDark(ds.oklch(0.82, 0.018, 270), ds.oklch(0.34, 0.022, 270)),
      text: ds.lightDark(ds.oklch(0.19, 0.018, 270), ds.oklch(0.93, 0.012, 270)),
      textMuted: ds.lightDark(ds.oklch(0.46, 0.022, 270), ds.oklch(0.72, 0.018, 270)),
    },
  }))
}

/** Detached base-step size token module. */
export function createHailSizeTokens(ds: HailPresetSystem) {
  return ds.defineTokens({
    size: {
      '1p': ds.size(1, 'px'),
      '2p': ds.size(2, 'px'),
      '4p': ds.size(4, 'px'),
      '8p': ds.size(8, 'px'),
      '12p': ds.size(12, 'px'),
      '16p': ds.size(16, 'px'),
      '24p': ds.size(24, 'px'),
      '32p': ds.size(32, 'px'),
      '40p': ds.size(40, 'px'),
    },
  })
}

/** Detached responsive breakpoint token module. */
export function createHailBreakpointTokens(ds: HailPresetSystem) {
  return ds.defineTokens({
    breakpoint: {
      compact: '375px',
      small: '640px',
      medium: '768px',
      large: '1024px',
      wide: '1280px',
    },
  } as const)
}

/** Detached icon customization reservations. */
export function createHailIconTokens(ds: HailPresetSystem) {
  return ds.defineTokens({
    icon: {
      size: '1em',
      strokeWidth: 2,
      opticalSize: 24,
    },
  } as const)
}
