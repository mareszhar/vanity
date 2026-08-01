/**
 * Internal characterization surface for low-level resolver and serializer
 * fixtures. Keeping these helpers test-only prevents test mechanics from
 * becoming a second public authoring dialect.
 */

import { createEngine } from '../engine/createEngine'

export { createEngine, defineEnginePlugin } from '../engine/createEngine'
export type {
  VanityCoreEngine,
  VanityEngine,
  VanityEngineMethods,
  VanityEngineOptions,
  VanityEnginePlugin,
} from '../engine/createEngine'
export { aria, container, data, media, schemeIs, supports } from '../system/conditions'
export { check } from '../tokens/checks'
export { defineTokens } from '../tokens/graph'
export { scale } from '../tokens/scale'
export { theme } from '../tokens/theme'
export {
  alpha,
  defaultAngle as angle,
  calc,
  defaultChannel as channel,
  clamp,
  color,
  colorMix,
  defaultCustomProperty as customProperty,
  darken,
  defaultDefineCssOperation as defineCssOperation,
  defaultDefineCssValue as defineCssValue,
  desaturate,
  displayP3,
  defaultFlex as flex,
  fluid,
  defaultFrequency as frequency,
  grid,
  hsl,
  hwb,
  defaultInteger as integer,
  interpolate,
  lab,
  lch,
  legibleOn,
  defaultLength as length,
  lightDark,
  lighten,
  max,
  min,
  mix,
  defaultNumber as number,
  oklab,
  oklch,
  defaultPercent as percent,
  defaultRawValue as rawValue,
  defaultResolution as resolution,
  rgb,
  rotate,
  saturate,
  defaultTime as time,
} from '../values/defaultEngine'
export * from '@mszr/vanity'

const engine = createEngine()

/** Raw-token canonical system factory for inherited domain fixtures. */
export const createSystem = engine.createSystem
