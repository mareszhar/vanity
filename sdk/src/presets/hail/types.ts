import type {
  colorSchemes,
  VanityAuthoredColor,
  VanityChannelOperation,
  VanityColorFunctionChannels,
  VanityColorish,
  VanityConfiguredTokenShape,
  VanityCssColorSpace,
  VanityCssInput,
  VanityFragment,
  VanityHueChannel,
  VanityMathValue,
  VanityNumericColorChannel,
  VanityPluginSetupSystem,
  VanitySystemPlugin,
  VanitySystemRule,
} from '@mszr/vanity'

/** How a Hail control participates in generated CSS. */
export type HailControlResolution = 'static' | 'token' | 'mutable'

/** Independently selectable Hail token and rule presets. */
export type HailPresetName
  = | 'reset'
    | 'palette'
    | 'roles'
    | 'sizes'
    | 'breakpoints'
    | 'motion'
    | 'theming'
    | 'icons'

/** A design range is always exactly `[minimum, maximum]`. */
export type HailRange = readonly [minimum: number, maximum: number]

/** Channels whose ranges express meaningful design coordinates. */
export type HailRangeName = 'l' | 'c' | 'h' | 's' | 'w' | 'a' | 'b' | 'alpha' | 'e'

export type HailControlName
  = 'base'
    | 'remTarget'
    | 'contrastPivotL'
    | HailRangeName

/** Optional normalization ranges. RGB components intentionally have no range. */
export type HailColorRanges = Readonly<Partial<Record<HailRangeName, HailRange>>> & {
  /** RGB components are additive mixing channels, not normalizable axes. */
  readonly r?: never
  /** RGB components are additive mixing channels, not normalizable axes. */
  readonly g?: never
}

export interface HailMarkerNames {
  /** Installed name of the span-scaled relative marker. */
  readonly span?: string
  /** Installed name of the literal normalization escape. */
  readonly exact?: string
}

export interface HailColorOptions {
  /** Normalize bare numeric channels into these design ranges. */
  readonly ranges?: HailColorRanges
  /** Add scheme-aware semantic elevation through `.inE()` and `from(…, { e })`. */
  readonly elevation?: boolean
  /** Aesthetic black/white pivot used by `contrastOf()`; defaults to `0.65`. */
  readonly contrastPivotL?: number
  /** Rename Hail's two markers if they collide with host vocabulary. */
  readonly markers?: HailMarkerNames
}

export interface HailSizeOptions {
  /** Base scale step in CSS pixels; defaults to `8`. */
  readonly base?: number
  /** Root pixel target used for rem/BEM conversion; defaults to `16`. */
  readonly remTarget?: number
}

export interface HailControlsOptions {
  /** Resolution used by every control without an override; defaults to `static`. */
  readonly default?: HailControlResolution
  /** Pay for liveness only on the controls that need it. */
  readonly overrides?: Readonly<Partial<Record<HailControlName, HailControlResolution>>>
}

export type HailPresetSelection
  = {
    /** Install only the listed presets. */
    readonly mode: 'opt-in'
    readonly listed: readonly HailPresetName[]
  }
  | {
    /** Install every preset except the listed presets. */
    readonly mode: 'opt-out'
    readonly listed: readonly HailPresetName[]
  }

/**
 * Hail's complete configuration. Omitting every option installs only the
 * zero-output ergonomic constructor layer.
 */
export interface HailOptions {
  /** Color ranges, semantic elevation, aesthetic contrast, and marker names. */
  readonly color?: HailColorOptions
  /** Base-step and root-target sizing controls. */
  readonly size?: HailSizeOptions
  /** Liveness for every design control, globally or with granular overrides. */
  readonly controls?: HailControlResolution | HailControlsOptions
  /** Exact opt-in or opt-out selection of Hail's token and rule presets. */
  readonly presets?: HailPresetSelection
}

/** Literal channel input that bypasses Hail normalization. */
export interface HailExact<out Input extends VanityCssInput = VanityCssInput> {
  readonly kind: 'exact'
  readonly input: Input
}

/** Relative channel input measured as a fraction of its configured span. */
export interface HailSpan<out Input extends VanityCssInput = VanityCssInput> {
  readonly kind: 'span'
  readonly input: Input
}

/** Create a span-scaled relative channel marker. */
export interface HailSpanFactory {
  <const Input extends VanityCssInput>(input: Input): HailSpan<Input>
}

/** Create a literal channel marker that bypasses normalization. */
export interface HailExactFactory {
  <const Input extends VanityCssInput>(input: Input): HailExact<Input>
}

export type HailNumericInput = VanityNumericColorChannel | HailExact
export type HailHueInput = VanityHueChannel | HailExact
export type HailRelativeNumericInput
  = HailNumericInput | HailSpan | VanityChannelOperation<VanityNumericColorChannel>
export type HailRelativeHueInput
  = HailHueInput | HailSpan | VanityChannelOperation<VanityHueChannel>

export interface HailRgbxChannels {
  /** Replace red in native sRGB units. RGB components are never normalized. */
  readonly r?: VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel>
  /** Replace green in native sRGB units. RGB components are never normalized. */
  readonly g?: VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel>
  /** Replace blue in native sRGB units. RGB components are never normalized. */
  readonly b?: VanityNumericColorChannel | VanityChannelOperation<VanityNumericColorChannel>
  /** Replace or adjust opacity; bare numbers normalize when `alpha` has a range. */
  readonly alpha?: HailRelativeNumericInput
}

export interface HailHslxChannels {
  /** Replace or adjust hue. */
  readonly h?: HailRelativeHueInput
  /** Replace or adjust saturation. */
  readonly s?: HailRelativeNumericInput
  /** Replace or adjust lightness. */
  readonly l?: HailRelativeNumericInput
  /** Replace or adjust opacity. */
  readonly alpha?: HailRelativeNumericInput
}

export interface HailHwbxChannels {
  /** Replace or adjust hue. */
  readonly h?: HailRelativeHueInput
  /** Replace or adjust whiteness. */
  readonly w?: HailRelativeNumericInput
  /** Replace or adjust blackness. */
  readonly b?: HailRelativeNumericInput
  /** Replace or adjust opacity. */
  readonly alpha?: HailRelativeNumericInput
}

export interface HailLabxChannels {
  /** Replace or adjust perceptual lightness. */
  readonly l?: HailRelativeNumericInput
  /** Lab/OKLab's green/red opponent axis; opacity is always `alpha`. */
  readonly a?: HailRelativeNumericInput
  /** Replace or adjust Lab/OKLab's blue/yellow opponent axis. */
  readonly b?: HailRelativeNumericInput
  /** Replace or adjust opacity. */
  readonly alpha?: HailRelativeNumericInput
}

export interface HailLchxChannels {
  /** Replace or adjust perceptual lightness. */
  readonly l?: HailRelativeNumericInput
  /** Replace or adjust chroma. */
  readonly c?: HailRelativeNumericInput
  /** Replace or adjust hue. */
  readonly h?: HailRelativeHueInput
  /** Replace or adjust opacity. */
  readonly alpha?: HailRelativeNumericInput
}

interface HailRelativeLightness {
  readonly l?: HailRelativeNumericInput
  /** Semantic elevation is unavailable while lightness is present. */
  readonly e?: never
}

interface HailRelativeElevation {
  readonly l?: never
  /** Semantic elevation mapped onto lightness with the active scheme direction. */
  readonly e?: HailRelativeNumericInput
}

type HailLightnessOrElevation<Enabled extends boolean>
  = Enabled extends true
    ? HailRelativeLightness | HailRelativeElevation
    : { readonly l?: HailRelativeNumericInput }

/** Relative OKLCH channels; `e` exists only when elevation is enabled. */
export type HailOklchxChannels<Enabled extends boolean = false>
  = HailLightnessOrElevation<Enabled> & {
    readonly c?: HailRelativeNumericInput
    readonly h?: HailRelativeHueInput
    readonly alpha?: HailRelativeNumericInput
  }

export interface HailColorxChannels extends Omit<VanityColorFunctionChannels, 'alpha'> {
  /** Replace or adjust opacity; profile channels remain native and unnormalized. */
  readonly alpha?: HailRelativeNumericInput
}

interface HailColorFamily<Channels, Arguments extends readonly unknown[]> {
  (...args: Arguments): VanityAuthoredColor
  /** Author a relative color; bare numbers normalize, strings/tokens bypass, and markers select explicit modes. */
  from: <Base extends VanityColorish>(base: Base, channels: Channels) => VanityAuthoredColor
}

export type HailRgbx = HailColorFamily<HailRgbxChannels, readonly [
  r: VanityNumericColorChannel,
  g: VanityNumericColorChannel,
  b: VanityNumericColorChannel,
  alpha?: HailNumericInput,
]>

export type HailHslx = HailColorFamily<HailHslxChannels, readonly [
  h: HailHueInput,
  s: HailNumericInput,
  l: HailNumericInput,
  alpha?: HailNumericInput,
]>

export type HailHwbx = HailColorFamily<HailHwbxChannels, readonly [
  h: HailHueInput,
  w: HailNumericInput,
  b: HailNumericInput,
  alpha?: HailNumericInput,
]>

export type HailLabx = HailColorFamily<HailLabxChannels, readonly [
  l: HailNumericInput,
  a: HailNumericInput,
  b: HailNumericInput,
  alpha?: HailNumericInput,
]>

export type HailLchx = HailColorFamily<HailLchxChannels, readonly [
  l: HailNumericInput,
  c: HailNumericInput,
  h: HailHueInput,
  alpha?: HailNumericInput,
]>

export type HailOklabx = HailColorFamily<HailLabxChannels, readonly [
  l: HailNumericInput,
  a: HailNumericInput,
  b: HailNumericInput,
  alpha?: HailNumericInput,
]>

type HailOklchElevationMember<Enabled extends boolean>
  = Enabled extends true
    ? {
        /** Construct OKLCH with semantic elevation in lightness position. */
        readonly inE: (
          elevation: HailNumericInput,
          chroma: HailNumericInput,
          hue: HailHueInput,
          alpha?: HailNumericInput,
        ) => VanityAuthoredColor
      }
    : object

export type HailOklchx<Enabled extends boolean = false>
  = HailColorFamily<HailOklchxChannels<Enabled>, readonly [
    l: HailNumericInput,
    c: HailNumericInput,
    h: HailHueInput,
    alpha?: HailNumericInput,
  ]> & HailOklchElevationMember<Enabled>

export interface HailColorx {
  /** Author raw `color()` syntax when a future/custom profile needs the raw CSS form. */
  (css: string): VanityAuthoredColor
  /** Author a three-channel profile color with normalized alpha. */
  (
    space: VanityCssColorSpace,
    c1: VanityNumericColorChannel,
    c2: VanityNumericColorChannel,
    c3: VanityNumericColorChannel,
    alpha?: HailNumericInput,
  ): VanityAuthoredColor
  /** Author an arbitrary profile channel tuple with normalized alpha. */
  (
    space: VanityCssColorSpace,
    channels: readonly [VanityNumericColorChannel, ...VanityNumericColorChannel[]],
    options?: { readonly alpha?: HailNumericInput },
  ): VanityAuthoredColor
  /** Author relative `color(from …)` syntax; profile channels remain native. */
  from: <Base extends VanityColorish>(base: Base, channels: HailColorxChannels) => VanityAuthoredColor
}

/** Unitless-by-default base-scale sizing. */
export interface HailSize {
  (step: VanityCssInput): VanityMathValue<'number'>
  (step: VanityCssInput, unit: 'px' | 'rem' | 'bem'): VanityMathValue<'length'>
}

/** Base-scale em: scale-relative like px, root-font-sensitive like rem. */
export interface HailBem {
  (step: VanityCssInput): VanityMathValue<'length'>
}

export interface HailMixins {
  /** Equal logical dimensions with a circular radius. */
  readonly circle: (size: VanityCssInput) => VanityFragment
  /** Equal logical dimensions. */
  readonly square: (size: VanityCssInput) => VanityFragment
  /** One-line ellipsis by default, or a multiline WebKit line clamp. */
  readonly truncate: (lines?: number) => VanityFragment
}

type ColorOptionsOf<Options> = Options extends { readonly color?: infer Color } ? NonNullable<Color> : object
type MarkerOptionsOf<Options> = ColorOptionsOf<Options> extends { readonly markers?: infer Markers } ? NonNullable<Markers> : object
type MarkerName<Options, Kind extends 'span' | 'exact', Fallback extends string>
  = MarkerOptionsOf<Options> extends Readonly<Record<Kind, infer Name extends string>> ? Name : Fallback

export type HailElevationEnabled<Options>
  = ColorOptionsOf<Options> extends { readonly elevation: true } ? true : false

export type HailMarkerUtils<Options> = {
  readonly [Name in MarkerName<Options, 'span', 'span'>]: HailSpanFactory
} & {
  readonly [Name in MarkerName<Options, 'exact', 'exact'>]: HailExactFactory
}

/** Hail's recursively merged utility tree. */
export type HailUtils<Options> = HailMarkerUtils<Options> & {
  /** Multiply a step by Hail's base; unitless unless `px`, `rem`, or `bem` is requested. */
  readonly size: HailSize
  /** Shorthand for `size(step, 'bem')`. */
  readonly bem: HailBem
  /** Aesthetic black/white pivot. Use core `legibleOn()` for accessibility selection. */
  readonly contrastOf: <Base extends VanityColorish>(base: Base) => VanityAuthoredColor
  /** Small typed declaration fragments for common shapes and truncation. */
  readonly mx: HailMixins
}

/** Hail's constructor families as they appear on a consolidated system. */
export interface HailConstructors<Options> {
  /** sRGB with normalized alpha; RGB mixing components remain native. */
  readonly rgbx: HailRgbx
  /** HSL with optional hue, saturation, lightness, and alpha ranges. */
  readonly hslx: HailHslx
  /** HWB with optional hue, whiteness, blackness, and alpha ranges. */
  readonly hwbx: HailHwbx
  /** CIE Lab with optional lightness and opponent-axis ranges. */
  readonly labx: HailLabx
  /** CIE LCH with optional lightness, chroma, hue, and alpha ranges. */
  readonly lchx: HailLchx
  /** OKLab with optional lightness and opponent-axis ranges. */
  readonly oklabx: HailOklabx
  /** OKLCH with normalization and conditional semantic elevation. */
  readonly oklchx: HailOklchx<HailElevationEnabled<Options>>
  /** CSS `color()` parity with normalized alpha. Profile channels remain native. */
  readonly colorx: HailColorx
}

type HailDefaultResolution<Options>
  = Options extends { readonly controls: infer Controls }
    ? Controls extends HailControlResolution ? Controls
      : Controls extends { readonly default: infer Default extends HailControlResolution } ? Default
        : 'static'
    : 'static'

type HailResolutionOf<Options, Name extends HailControlName>
  = Options extends {
    readonly controls: {
      readonly overrides: infer Overrides
    }
  }
    ? Overrides extends Readonly<Record<Name, infer Resolution extends HailControlResolution>>
      ? Resolution
      : HailDefaultResolution<Options>
    : HailDefaultResolution<Options>

type HailControlConfig<Resolution extends HailControlResolution>
  = Resolution extends 'mutable'
    ? {
        readonly val: number
        readonly reference: 'var'
        readonly emit: true
        readonly mutable: true
        readonly register: true
      }
    : Resolution extends 'token'
      ? {
          readonly val: number
          readonly reference: 'var'
          readonly emit: true
        }
      : {
          readonly val: number
          readonly reference: 'val'
          readonly emit: false
        }

type HailNumberControl<Options, Name extends HailControlName>
  = VanityConfiguredTokenShape<HailControlConfig<HailResolutionOf<Options, Name>>, 'number'>

interface HailRangeControls<Options, Name extends HailRangeName> {
  readonly min: HailNumberControl<Options, Name>
  readonly max: HailNumberControl<Options, Name>
}

/** Exact controls contributed for a Hail configuration. */
export interface HailControlTokenGraph<Options = object> {
  readonly hail: {
    readonly control: {
      readonly base: HailNumberControl<Options, 'base'>
      readonly remTarget: HailNumberControl<Options, 'remTarget'>
      readonly contrastPivotL: HailNumberControl<Options, 'contrastPivotL'>
      readonly ranges: {
        readonly [Name in HailRangeName]: HailRangeControls<Options, Name>
      }
    }
  } & (HailElevationEnabled<Options> extends true
    ? {
        readonly mostElevatedL: VanityConfiguredTokenShape<{
          readonly val: number
          readonly reference: 'var'
          readonly emit: true
        }, 'number'>
      }
    : object)
}

/** Primitive color tokens installed by the `palette` preset. */
export interface HailPaletteTokenGraph {
  readonly color: {
    readonly palette: {
      readonly accent: VanityAuthoredColor
      readonly tinted: VanityAuthoredColor
      readonly matte: VanityAuthoredColor
    }
  }
}

/** Semantic color and `$dec`-ready typography installed by `roles`. */
export interface HailRoleTokenGraph {
  readonly color: {
    readonly brand: VanityAuthoredColor
    readonly onBrand: VanityAuthoredColor
    readonly canvas: VanityAuthoredColor
    readonly surface: VanityAuthoredColor
    readonly surfaceRaised: VanityAuthoredColor
    readonly border: VanityAuthoredColor
    readonly text: VanityAuthoredColor
    readonly textMuted: VanityAuthoredColor
  }
  readonly text: {
    readonly body: {
      readonly fontSize: '1rem'
      readonly lineHeight: 1.5
      readonly fontWeight: 400
    }
    readonly label: {
      readonly fontSize: '0.875rem'
      readonly lineHeight: 1.3
      readonly fontWeight: 600
    }
    readonly heading: {
      readonly fontSize: 'clamp(1.75rem, 4vw, 3rem)'
      readonly lineHeight: 1.08
      readonly fontWeight: 700
    }
  }
}

/** Base-step length tokens installed by `sizes`. */
export interface HailSizeTokenGraph {
  readonly size: Readonly<Record<
    '1p' | '2p' | '4p' | '8p' | '12p' | '16p' | '24p' | '32p' | '40p',
    VanityMathValue<'length'>
  >>
}

/** Responsive threshold tokens installed by `breakpoints`. */
export interface HailBreakpointTokenGraph {
  readonly breakpoint: {
    readonly compact: '375px'
    readonly small: '640px'
    readonly medium: '768px'
    readonly large: '1024px'
    readonly wide: '1280px'
  }
}

/** Icon customization reservations installed by `icons`. */
export interface HailIconTokenGraph {
  readonly icon: {
    readonly size: '1em'
    readonly strokeWidth: 2
    readonly opticalSize: 24
  }
}

type ListedPresets<Options>
  = Options extends { readonly presets: { readonly listed: readonly (infer Listed)[] } }
    ? Extract<Listed, HailPresetName>
    : never

type SelectedPresets<Options>
  = Options extends { readonly presets: { readonly mode: 'opt-in' } }
    ? ListedPresets<Options>
    : Options extends { readonly presets: { readonly mode: 'opt-out' } }
      ? Exclude<HailPresetName, ListedPresets<Options>>
      : never

type IfSelected<Options, Name extends HailPresetName, Contribution>
  = Name extends SelectedPresets<Options> ? Contribution : object

/** Exact token graph contributed by the selected Hail presets. */
export type HailTokenGraph<Options>
  = HailControlTokenGraph<Options>
    & IfSelected<Options, 'palette', HailPaletteTokenGraph>
    & IfSelected<Options, 'roles', HailRoleTokenGraph>
    & IfSelected<Options, 'sizes', HailSizeTokenGraph>
    & IfSelected<Options, 'breakpoints', HailBreakpointTokenGraph>
    & IfSelected<Options, 'icons', HailIconTokenGraph>

/** Named system rules contributed by Hail's rule presets. */
export type HailRuleName = 'hailReset' | 'hailMotion' | 'hailTheming'

/** Exact named-system-rule shape projected from the selected presets. */
export type HailSystemRules<Options>
  = IfSelected<Options, 'reset', { readonly hailReset: VanitySystemRule }>
    & IfSelected<Options, 'motion', { readonly hailMotion: VanitySystemRule }>
    & IfSelected<Options, 'theming', { readonly hailTheming: VanitySystemRule }>

/** Axes conditionally contributed by Hail configuration. */
export type HailAxes<Options>
  = HailElevationEnabled<Options> extends true
    ? {
        readonly scheme: ReturnType<typeof colorSchemes>
      }
    : Record<never, never>

/**
 * Configured Hail plugin. Phantom contribution fields are type-only and let
 * `addPlugin()` project the exact selected vocabulary without widening it.
 */
export interface HailPlugin<Options extends HailOptions = HailOptions>
  extends Omit<VanitySystemPlugin<HailOptions, object, 'org.vanity.hail', true>, 'setup'> {
  readonly setup: (system: VanityPluginSetupSystem, options: HailOptions) => object
  readonly options: Readonly<Options>
  readonly __vanityPluginAxes?: HailAxes<Options>
  readonly __vanityPluginConstructors?: HailConstructors<Options>
  readonly __vanityPluginTokens?: HailTokenGraph<Options>
  readonly __vanityPluginUtils?: HailUtils<Options>
  readonly __vanityPluginRules?: HailSystemRules<Options>
}
