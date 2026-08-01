/** App code: consumes a style module's classes, ports, recipes, and atoms at runtime. */

import { atoms } from './atoms.css.ts'
import { button } from './button.css.ts'
import { globalMarker } from './global.css.ts'
import { fill, fraction, track } from './progress.css.ts'

export const classes = { track, fill }
export const halfway = fraction.dec(0.5)

export const ghostPill = button({ intent: 'ghost', pill: true })
export const themedPadding = button.ports.paddingX.dec('24px')
export const stackedGap = atoms({ stack: true, gap: 'sm' })
export { globalMarker }
export { atoms, button }
