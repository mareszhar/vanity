import { consolidate } from './package/neutral-contract/index.js'

export const ds = consolidate({
  name: 'duplicate-interface',
  prefix: 'duplicate',
  layerRoot: 'duplicate',
  policies: { references: 'custom-properties', strict: true },
  extensions: [{
    id: 'example.paint',
    version: '1.0.0',
    options: { strategy: 'plain-css' },
    utility(value) {
      return `DUPLICATE_BUILD_SENTINEL:${value}`
    },
  }],
  tokens: [
    {
      name: 'brand',
      value: '#0f766e',
      mutable: true,
      description: 'A duplicated package token.',
      provenance: 'duplicate-package/system.js:1',
    },
  ],
  runtimePorts: ['accent'],
})
