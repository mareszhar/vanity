/** The fixture system for the Vite-plugin build test — one plain system module. */

import { createSystem } from '@test/legacy'

const open = createSystem()

export const ds = open
  .addTokens(open.defineTokens({
    color: { brand: '#635bff', surface: '#f4f4f6' },
    space: { sm: '8px' },
  }))
  .consolidate()
