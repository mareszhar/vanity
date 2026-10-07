import { defineVanityConfig } from '@mszr/vanity/config'

export default defineVanityConfig({
  compiler: { system: './app/design/system.ts' },
  autoImports: {
    shared: './app/design/authoring.ts',
    app: ['core', 'vue'],
  },
})
