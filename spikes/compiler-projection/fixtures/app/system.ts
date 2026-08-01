import { consolidate } from '../../src/contract.ts'
import { BRAND_DESCRIPTION } from './metadata.ts'
import { BRAND, SPACE } from './palette.ts'

export const ds = consolidate({
  name: 'neutral-interface',
  prefix: 'neutral',
  layerRoot: 'neutral',
  policies: {
    references: 'custom-properties',
    strict: true,
  },
  extensions: [{
    id: 'example.paint',
    version: '1.0.0',
    options: { strategy: 'plain-css' },
    utility(value) {
      return `BUILD_PLUGIN_SENTINEL:${value}`
    },
  }],
  tokens: [
    {
      name: 'brand',
      value: BRAND,
      mutable: true,
      description: BRAND_DESCRIPTION,
      provenance: 'fixtures/app/palette.ts:1',
    },
    {
      name: 'space',
      value: SPACE,
      description: 'The base spacing step.',
      provenance: 'fixtures/app/palette.ts:2',
    },
  ],
  runtimePorts: ['accent'],
})
