/** Strict atomic vocabulary emitted from the locked fixture system. */

import { ds } from './system'

export const atoms = ds.atoms({
  properties: { gap: ds.t.space },
  toggles: { stack: { display: 'flex', flexDirection: 'column' } },
})
