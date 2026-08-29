import { defineBuildConfig } from 'obuild/config'

const browserExternal = ['@vanilla-extract/css']
const viteExternal = ['@vanilla-extract/vite-plugin', 'unplugin-auto-import', 'vite']
const nuxtExternal = ['@nuxt/kit', 'nuxt', 'unplugin-auto-import', 'vite']
const vueExternal = ['vue']
const testingExternal = ['@mszr/selenita']

export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: ['./src/index.ts'],
      rolldown: {
        platform: 'neutral',
        external: browserExternal,
      },
    },
    {
      type: 'bundle',
      input: ['./src/runtime.ts'],
      rolldown: {
        platform: 'browser',
      },
    },
    {
      type: 'bundle',
      input: ['./src/imports.ts'],
      rolldown: {
        platform: 'neutral',
      },
    },
    {
      type: 'bundle',
      input: ['./src/config.ts'],
      rolldown: {
        platform: 'neutral',
      },
    },
    {
      type: 'bundle',
      input: ['./src/capabilities.ts'],
      rolldown: {
        platform: 'neutral',
      },
    },
    {
      type: 'bundle',
      input: ['./src/vite.ts'],
      rolldown: {
        platform: 'node',
        external: viteExternal,
      },
    },
    {
      type: 'bundle',
      input: ['./src/vue.ts'],
      rolldown: {
        platform: 'browser',
        external: vueExternal,
      },
    },
    {
      type: 'bundle',
      input: ['./src/nuxt.ts'],
      rolldown: {
        platform: 'node',
        external: nuxtExternal,
      },
    },
    {
      type: 'bundle',
      input: ['./src/cli.ts'],
      rolldown: {
        platform: 'node',
      },
    },
    {
      type: 'bundle',
      input: ['./src/prepare.ts'],
      rolldown: {
        platform: 'node',
        external: ['jiti'],
      },
    },
    {
      type: 'bundle',
      input: ['./src/testing.ts'],
      rolldown: {
        platform: 'node',
        external: testingExternal,
      },
    },
    {
      type: 'bundle',
      input: ['./src/presets.ts'],
      rolldown: {
        platform: 'neutral',
        external: [...browserExternal, '@mszr/vanity'],
      },
    },
  ],
})
