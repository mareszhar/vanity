/**
 * Test-only bridge preserving the removed engine surface while domain
 * fixtures migrate. It is not a package export and cannot reach consumers.
 */

export { createEngine, defineEnginePlugin } from '../engine/createEngine'
export type {
  VanityCoreEngine,
  VanityEngine,
  VanityEngineMethods,
  VanityEngineOptions,
  VanityEnginePlugin,
} from '../engine/createEngine'
export * from '../index'
