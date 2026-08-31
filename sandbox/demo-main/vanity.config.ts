import { defineVanityConfig } from '@mszr/vanity/config'

export default defineVanityConfig({
  compiler: {
    system: './app/assets/styles/design/system.ts',
  },
  autoImports: {
    shared: './app/assets/styles/design/authoring.ts',
    app: ['core', 'vue'],
  },
})
