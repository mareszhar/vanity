import type {
  VanityLengthConstructor,
  VanityLengthUnit,
  VanityOpenSystemBase,
  VanityPluginSetupSystem,
  VanityTokenFactory,
  VanityTokenInput,
} from '@mszr/vanity'
import type { HailColorControls } from './color'
import type { HailNormalizedOptions } from './config'
import type {
  HailColorOptions,
  HailControlsOptions,
  HailMarkerNames,
  HailOptions,
  HailPlugin,
  HailPresetSelection,
  HailRangeName,
  HailSizeOptions,
} from './types'
import {
  colorSchemes,
  definePlugin,
} from '@mszr/vanity'
import { hailColorConstructors } from './color'
import { normalizeHailOptions } from './config'
import { hailControl, hailRange } from './controls'
import {
  hailMotionRules,
  hailResetRules,
  hailThemingRules,
} from './rules'
import {
  hailBreakpointTokens,
  hailIconTokens,
  hailPaletteTokens,
  hailRoleTokens,
  hailSizeTokens,
} from './tokens'
import { hailUtils } from './utils'

interface ResolvedHailControls {
  readonly hail: {
    readonly control: {
      readonly base: VanityTokenInput<'number'>
      readonly remTarget: VanityTokenInput<'number'>
      readonly contrastPivotL: VanityTokenInput<'number'>
      readonly ranges: Readonly<Record<
        HailRangeName,
        {
          readonly min: VanityTokenInput<'number'>
          readonly max: VanityTokenInput<'number'>
        }
      >>
    }
    readonly mostElevatedL?: VanityTokenInput<'number'>
  }
}

type HailWorkingSystem = Omit<
  VanityPluginSetupSystem,
  'length' | 'registerPluginPolicy'
> & {
  readonly length: VanityLengthConstructor<VanityLengthUnit>
}

type NoExtraKeys<Actual, Shape> = {
  readonly [Key in Exclude<keyof Actual, keyof Shape>]: never
}

type HailRangeGuard<Ranges> = {
  readonly [Name in keyof Ranges]: Name extends HailRangeName ? Ranges[Name] : never
}

type HailColorRangeGuard<Color>
  = Color extends { readonly ranges: infer Ranges }
    ? {
        readonly ranges:
          NoExtraKeys<Ranges, NonNullable<HailColorOptions['ranges']>>
          & HailRangeGuard<Ranges>
      }
    : object

type HailColorMarkerGuard<Color>
  = Color extends { readonly markers: infer Markers }
    ? {
        readonly markers:
          NoExtraKeys<Markers, HailMarkerNames>
          & (Markers extends {
            readonly span: infer Span extends string
            readonly exact: infer Exact extends string
          } ? Span extends Exact
              ? { readonly exact: never }
              : object
            : object)
      }
    : object

type HailColorNestedGuard<Color>
  = HailColorRangeGuard<Color> & HailColorMarkerGuard<Color>

type HailColorGuard<Color>
  = Color extends HailColorOptions
    ? NoExtraKeys<Color, HailColorOptions> & HailColorNestedGuard<Color>
    : never

type HailOptionsGuard<Options extends HailOptions>
  = NoExtraKeys<Options, HailOptions>
    & (Options extends { readonly color: infer Color }
      ? { readonly color: HailColorGuard<Color> }
      : object)
    & (Options extends { readonly size: infer Size }
      ? { readonly size: NoExtraKeys<Size, HailSizeOptions> }
      : object)
    & (Options extends { readonly controls: infer Controls }
      ? Controls extends object
        ? { readonly controls: NoExtraKeys<Controls, HailControlsOptions> }
        : object
      : object)
    & (Options extends { readonly presets: infer Presets }
      ? { readonly presets: NoExtraKeys<Presets, HailPresetSelection> }
      : object)

/**
 * Install Hail, Vanity's deletable opinionated layer.
 *
 * `hail()` alone adds ergonomic constructors and utilities with no emitted
 * controls, elevation, tokens, or global rules. Opt into only the layers a
 * system wants; every selection remains visible to introspection and tooling.
 *
 * @example
 * ```ts
 * const ds = createSystem()
 *   .addPlugin(hail({
 *     color: { ranges: { l: [0.08, 0.96], c: [0, 0.3] }, elevation: true },
 *     controls: { default: 'token', overrides: { c: 'mutable' } },
 *     presets: { mode: 'opt-in', listed: ['palette', 'roles', 'theming'] },
 *   }))
 *   .consolidate({ prefix: 'app' })
 * ```
 */
export function hail<const Options extends HailOptions = Record<never, never>>(
  options?: Options & HailOptionsGuard<Options>,
): HailPlugin<Options> {
  const configured = options ?? {} as Options
  const plugin = definePlugin<'org.vanity.hail', HailOptions, object>({
    id: 'org.vanity.hail',
    version: 1,
    optionsIdentity: identityOptions,
    setup: (initial, rawOptions) => setupHail(initial, rawOptions),
  })
  return plugin(configured) as unknown as HailPlugin<Options>
}

function setupHail(initial: VanityPluginSetupSystem, rawOptions: HailOptions): object {
  const options = normalizeHailOptions(rawOptions)
  const withPolicy = initial.registerPluginPolicy({
    controls: typeof rawOptions.controls === 'string'
      ? { default: rawOptions.controls }
      : { default: rawOptions.controls?.default ?? 'static', overrides: rawOptions.controls?.overrides ?? {} },
    color: {
      elevation: options.elevation,
      ranges: options.ranges,
      markers: { span: options.spanName, exact: options.exactName },
      contrastPivotL: options.contrastPivotL,
    },
    size: { base: options.base, remTarget: options.remTarget },
    presets: [...options.presets].sort(),
  })

  return options.elevation
    ? setupElevatedHail(withPolicy, options)
    : setupFlatHail(withPolicy, options)
}

function setupFlatHail(initial: VanityPluginSetupSystem, options: HailNormalizedOptions): object {
  const withControls = initial.addTokens(controlTokenSeed(initial, options))
  return installVocabularyAndPresets(asWorkingSystem(withControls), options)
}

function setupElevatedHail(initial: VanityPluginSetupSystem, options: HailNormalizedOptions): object {
  const withScheme = asWorkingSystem(Object.hasOwn(initial.axes, 'scheme')
    ? initial.expectAxis('scheme', ['light', 'dark'])
    : initial.addAxis('scheme', colorSchemes({ locality: 'root' })))
  const schemeTdef = withScheme.tdef as unknown as VanityTokenFactory<{
    readonly scheme: ReturnType<typeof colorSchemes>
  }>
  const controls = controlTokenSeed(withScheme, options)
  const withControls = withScheme.addTokens({
    ...controls,
    hail: {
      ...controls.hail,
      mostElevatedL: schemeTdef.number({
        val: withScheme.number(0),
        axes: { scheme: { dark: withScheme.number(1) } },
        description: 'Elevation direction: 0 in light schemes and 1 in dark schemes.',
      }),
    },
  })
  return installVocabularyAndPresets(asWorkingSystem(withControls), options)
}

function controlTokenSeed(ds: VanityOpenSystemBase, options: HailNormalizedOptions) {
  const range = (name: HailRangeName) => {
    const [min, max] = hailRange(ds, name, options)
    return { min, max }
  }
  return {
    hail: {
      control: {
        base: hailControl(ds, 'base', options.base, options),
        remTarget: hailControl(ds, 'remTarget', options.remTarget, options),
        contrastPivotL: hailControl(ds, 'contrastPivotL', options.contrastPivotL, options),
        ranges: {
          l: range('l'),
          c: range('c'),
          h: range('h'),
          s: range('s'),
          w: range('w'),
          a: range('a'),
          b: range('b'),
          alpha: range('alpha'),
          e: range('e'),
        },
      },
    },
  }
}

function installVocabularyAndPresets(
  system: HailWorkingSystem,
  options: HailNormalizedOptions,
): object {
  const resolved = system.t as unknown as ResolvedHailControls
  const tokenControls = resolved.hail.control
  const controls: HailColorControls & {
    readonly base: VanityTokenInput<'number'>
    readonly remTarget: VanityTokenInput<'number'>
  } = {
    base: tokenControls.base,
    remTarget: tokenControls.remTarget,
    contrastPivotL: tokenControls.contrastPivotL,
    ranges: Object.fromEntries(
      Object.entries(tokenControls.ranges).map(([name, value]) => [
        name,
        { minimum: value.min, maximum: value.max },
      ]),
    ) as unknown as HailColorControls['ranges'],
    mostElevatedL: resolved.hail.mostElevatedL,
  }

  const withConstructors = system.addConstructors(hailColorConstructors(system, options, controls))
  const withUtils = withConstructors.addUtils(hailUtils(withConstructors, options, controls))
  let current = asWorkingSystem(withUtils)

  if (options.presets.has('palette'))
    current = asWorkingSystem(current.addTokens(hailPaletteTokens(current as Parameters<typeof hailPaletteTokens>[0])))
  if (options.presets.has('roles'))
    current = asWorkingSystem(current.addTokens(hailRoleTokens(current as Parameters<typeof hailRoleTokens>[0], options.elevation)))
  if (options.presets.has('sizes'))
    current = asWorkingSystem(current.addTokens(hailSizeTokens(current as Parameters<typeof hailSizeTokens>[0])))
  if (options.presets.has('breakpoints'))
    current = asWorkingSystem(current.addTokens(hailBreakpointTokens(current as Parameters<typeof hailBreakpointTokens>[0])))
  if (options.presets.has('icons'))
    current = asWorkingSystem(current.addTokens(hailIconTokens(current as Parameters<typeof hailIconTokens>[0])))

  if (options.presets.has('reset'))
    current = asWorkingSystem(current.addRules(hailResetRules))
  if (options.presets.has('motion'))
    current = asWorkingSystem(current.addRules(hailMotionRules))
  if (options.presets.has('theming'))
    current = asWorkingSystem(current.addRules(hailThemingRules))

  return current
}

function asWorkingSystem(system: object): HailWorkingSystem {
  return system as unknown as HailWorkingSystem
}

function identityOptions(options: HailOptions): object {
  return {
    color: options.color ?? {},
    size: options.size ?? {},
    controls: options.controls ?? 'static',
    presets: options.presets ?? null,
  }
}

export type {
  HailAxes,
  HailBem,
  HailBreakpointTokenGraph,
  HailColorOptions,
  HailColorRanges,
  HailColorx,
  HailColorxChannels,
  HailConstructors,
  HailControlName,
  HailControlResolution,
  HailControlsOptions,
  HailControlTokenGraph,
  HailElevationEnabled,
  HailExact,
  HailExactFactory,
  HailHslx,
  HailHslxChannels,
  HailHwbx,
  HailHwbxChannels,
  HailIconTokenGraph,
  HailLabx,
  HailLabxChannels,
  HailLchx,
  HailLchxChannels,
  HailMarkerNames,
  HailMarkerUtils,
  HailMixins,
  HailNumericInput,
  HailOklabx,
  HailOklchx,
  HailOklchxChannels,
  HailOptions,
  HailPaletteTokenGraph,
  HailPlugin,
  HailPresetName,
  HailPresetSelection,
  HailRange,
  HailRangeName,
  HailRelativeHueInput,
  HailRelativeNumericInput,
  HailRgbx,
  HailRgbxChannels,
  HailRoleTokenGraph,
  HailRuleName,
  HailSize,
  HailSizeOptions,
  HailSizeTokenGraph,
  HailSpan,
  HailSpanFactory,
  HailSystemRules,
  HailTokenGraph,
  HailUtils,
} from './types'
