import { consolidate } from '../../src/contract.ts'

export const ds = consolidate({
  name: 'precompiled-interface',
  prefix: 'precompiled',
  layerRoot: 'precompiled',
  policies: { references: 'custom-properties' },
  extensions: [{
    id: 'example.precompiled',
    version: '2.0.0',
    utility(value) {
      return `PRECOMPILED_BUILD_SENTINEL:${value}`
    },
  }],
  tokens: [{
    name: 'brand',
    value: '#be123c',
    mutable: true,
    description: 'A token shipped from a library dist.',
    provenance: 'library/src/system.ts:1',
  }],
  runtimePorts: ['tone'],
})
