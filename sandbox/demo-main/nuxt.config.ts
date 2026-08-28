import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: ['@mszr/vanity/nuxt'],

  vanity: {
    // The injection source re-exports the exact locked `ds` plus independent
    // preset helpers. Nuxt generates the ambient declarations; there is no
    // tracked hand-written global surface.
    compiler: {
      system: '~/assets/styles/design/system.ts',
      styleAutoImports: '~/assets/styles/design/authoring.ts',
    },
    app: {
      runtimeAutoImports: ['core', 'vue'],
    },
  },

  // `import * as s from 'styled/Button.css.ts'` — component styles live apart
  // from components, reached by a stable alias instead of relative paths.
  alias: {
    styled: fileURLToPath(new URL('./app/assets/styles/components', import.meta.url)),
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      link: [
        { rel: 'preload', as: 'font', type: 'font/woff2', href: '/fonts/geist-sans.woff2', crossorigin: '' },
      ],
    },
  },

  compatibilityDate: '2026-07-09',
  devtools: { enabled: false },

  typescript: {
    strict: true,
    tsConfig: {
      compilerOptions: {
        allowImportingTsExtensions: true,
      },
      vueCompilerOptions: {
        plugins: ['@vue/language-plugin-pug'],
      },
    },
  },

  watchers: process.env.CHOKIDAR_USEPOLLING === 'true'
    ? { chokidar: { usePolling: true, interval: Number(process.env.CHOKIDAR_INTERVAL ?? 100) } }
    : undefined,
})
