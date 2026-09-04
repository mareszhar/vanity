import type { VanitySubstrate } from './types'
import { createVanillaExtractSubstrate } from './vanilla-extract/adapter'

export type * from './types'

/** The selected CSS/compiler substrate, with portable operations and backend lifecycle separated. */
export const substrate: VanitySubstrate = createVanillaExtractSubstrate()
