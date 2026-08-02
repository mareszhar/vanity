/** The fixture system for the Vite-plugin build test — one plain system module. */

import { createSystem } from '@test/legacy'

export const ds = createSystem()
  .addTokens({
    color: { brand: '#635bff', surface: '#f4f4f6' },
    space: { sm: '8px' },
  })
  .consolidate()
