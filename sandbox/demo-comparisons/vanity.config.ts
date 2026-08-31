import { defineVanityConfig } from '@mszr/vanity/config'

export default defineVanityConfig({
  compiler: {
    system: './src/lanes/vanity/system.ts',
    layerOrder: [
      'properties',
      'theme',
      'base',
      'components',
      'utilities',
      'panda-reset',
      'panda-base',
      'panda-tokens',
      'panda-recipes',
      'panda-utilities',
      'compare',
    ],
  },
  autoImports: {
    shared: './src/lanes/vanity/authoring.ts',
    app: ['core', 'vue'],
  },
})
