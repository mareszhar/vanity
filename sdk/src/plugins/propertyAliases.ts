/** Typed CSS-property aliases implemented as an ordinary system plugin. */

import type { VanityCssPropertyName } from '../css/types'
import type {
  VanityPluginSetupSystem,
  VanitySystemPlugin,
} from '../system/open'
import { all as knownCssProperties } from 'known-css-properties'
import { VanityError } from '../diagnostics'
import { definePlugin } from '../system/open'

const KNOWN_CSS_PROPERTIES = new Set(knownCssProperties)

/** Choose whether a property alias is exposed beside, or instead of, its CSS spelling. */
export type VanityPropertyAliasExposure = 'both' | 'aliases-only'

/** Configure the public exposure mode for `propertyAliases()`. */
export interface VanityPropertyAliasOptions<Expose extends VanityPropertyAliasExposure = 'both'> {
  /** Expose aliases alongside CSS names, or hide the CSS spellings in ordinary emitters. */
  readonly expose?: Expose
}

/** Normalized alias mapping and exposure policy carried by the property-alias plugin. */
export interface VanityPropertyAliasConfig<
  Aliases extends Readonly<Record<string, VanityCssPropertyName>> = Readonly<Record<string, VanityCssPropertyName>>,
  Expose extends VanityPropertyAliasExposure = VanityPropertyAliasExposure,
> {
  /** Alias-to-standard-CSS-property mapping. */
  readonly aliases: Aliases
  /** Exposure mode selected when the plugin was installed. */
  readonly expose: Expose
}

/** Internal capability carrier. It is a symbol so the plugin adds no fake daily constructor. */
export const VANITY_PROPERTY_ALIASES: unique symbol = Symbol.for('vanity.propertyAliases') as any

export interface VanityPropertyAliasContribution<
  Aliases extends Readonly<Record<string, VanityCssPropertyName>>,
  Expose extends VanityPropertyAliasExposure,
> {
  readonly [VANITY_PROPERTY_ALIASES]: VanityPropertyAliasConfig<Aliases, Expose>
}

export type VanityPropertyAliasPlugin<
  Aliases extends Readonly<Record<string, VanityCssPropertyName>>,
  Expose extends VanityPropertyAliasExposure,
> = VanitySystemPlugin<
  undefined,
  object,
  'org.vanity.plugin.property-aliases',
  false
> & {
  readonly __vanityPluginConsts?: VanityPropertyAliasContribution<Aliases, Expose>
}

export type VanityAliasesOf<Constructors extends object>
  = typeof VANITY_PROPERTY_ALIASES extends keyof Constructors
    ? Constructors[typeof VANITY_PROPERTY_ALIASES] extends VanityPropertyAliasConfig<infer Aliases, any>
      ? Aliases
      : Record<never, never>
    : Record<never, never>

export type VanityAliasExposureOf<Constructors extends object>
  = typeof VANITY_PROPERTY_ALIASES extends keyof Constructors
    ? Constructors[typeof VANITY_PROPERTY_ALIASES] extends VanityPropertyAliasConfig<any, infer Expose>
      ? Expose
      : 'both'
    : 'both'

/**
 * Define the optional alias policy installed with `system.addPlugin(...)`.
 *
 * The map is deliberately CSS-property-to-CSS-property only: aliases shorten
 * platform vocabulary; they never become an alternate utility language.
 * Install it before consolidation: choosing the preferred rule vocabulary
 * finalizes the typed authoring surface before styles are built.
 */
export function propertyAliases<
  const Aliases extends Readonly<Record<string, VanityCssPropertyName>>,
  const Expose extends VanityPropertyAliasExposure = 'both',
>(
  aliases: Aliases & VanityAliasDefinitionGuard<Aliases>,
  options: VanityPropertyAliasOptions<Expose> = {},
): VanityPropertyAliasPlugin<Aliases, Expose> {
  const expose = options.expose ?? 'both' as Expose
  const entries = Object.entries(aliases)

  if (entries.length === 0) {
    throw new VanityError({
      code: 'VANITY_CSS_INVALID_KEY',
      message: 'propertyAliases() needs at least one alias',
      path: ['aliases'],
      fix: 'Provide at least one alias-to-CSS-property entry.',
    })
  }

  for (const [alias, property] of entries) {
    if (!/^[$A-Z_][$\w-]*$/i.test(alias)) {
      throw new VanityError({
        code: 'VANITY_CSS_INVALID_KEY',
        message: `property alias '${alias}' is not a usable object key`,
        path: ['aliases', alias],
        fix: 'Use a non-empty JavaScript identifier as the alias name.',
      })
    }
    if (alias.startsWith('--') || isCssProperty(alias)) {
      throw new VanityError({
        code: 'VANITY_CSS_INVALID_KEY',
        message: `property alias '${alias}' collides with standard CSS vocabulary`,
        path: ['aliases', alias],
        fix: 'Choose an alias that is not already a CSS property or custom property.',
      })
    }
    if (!isCssProperty(property)) {
      throw new VanityError({
        code: 'VANITY_CSS_UNKNOWN_PROPERTY',
        message: `property alias '${alias}' targets unknown CSS property '${property}'`,
        path: ['aliases', alias],
        fix: 'Use a property name from the CSS vocabulary.',
      })
    }
  }

  const normalized = Object.freeze({ ...aliases }) as Aliases
  const config = Object.freeze({ aliases: normalized, expose })
  const fingerprint = getStableFingerprint(config)

  return definePlugin({
    id: 'org.vanity.plugin.property-aliases',
    version: 1,
    fingerprint,
    setup: (host: VanityPluginSetupSystem) =>
      (host.addConsts as (consts: object) => object)({
        [VANITY_PROPERTY_ALIASES]: config,
      }),
  } as any) as unknown as VanityPropertyAliasPlugin<Aliases, Expose>
}

function isCssProperty(name: string): boolean {
  return KNOWN_CSS_PROPERTIES.has(name.replace(/[A-Z]/g, upper => `-${upper.toLowerCase()}`))
}

type VanityAliasDefinitionGuard<Aliases extends Readonly<Record<string, VanityCssPropertyName>>> = {
  readonly [Alias in keyof Aliases]: Alias extends VanityCssPropertyName ? never : Aliases[Alias]
}

function getStableFingerprint(config: VanityPropertyAliasConfig): string {
  return JSON.stringify({
    expose: config.expose,
    aliases: Object.fromEntries(Object.entries(config.aliases).sort(([a], [b]) => a.localeCompare(b))),
  })
}
