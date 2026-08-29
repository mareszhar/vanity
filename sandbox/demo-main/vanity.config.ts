import { defineVanityConfig } from '@mszr/vanity/config'

export default defineVanityConfig({
  compiler: {
    system: './app/assets/styles/design/system.ts',
    styleAutoImports: './app/assets/styles/design/authoring.ts',
  },
  app: {
    runtimeAutoImports: ['core', 'vue'],
  },
})
