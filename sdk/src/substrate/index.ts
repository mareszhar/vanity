import type { VanitySubstrate } from './types'
import { createVanillaExtractSubstrate } from './vanilla-extract/adapter'

export type * from './types'

/** The selected CSS/compiler backend for the current package build. */
export const substrate: VanitySubstrate = createVanillaExtractSubstrate()
