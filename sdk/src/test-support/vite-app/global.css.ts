/** Consecutive expression statements lock source-provenance transforms against ASI regressions. */

import { ds } from './system'

ds.rules({
  html: { minBlockSize: '100%' },
  body: { minBlockSize: '100%' },
})

export const globalMarker = true
