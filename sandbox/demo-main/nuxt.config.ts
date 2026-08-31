import { fileURLToPath } from 'node:url'
import vanityConfig from './vanity.config.ts'

export default defineNuxtConfig({
  modules: ['@mszr/vanity/nuxt'],
  vanity: vanityConfig,

  // Styles live apart from components, reached by a stable alias instead of
  // relative paths: `styled/Button.css.ts` for component styles, `design/…`
  // for the shared design layer (tokens, typeface stacks, resets).
  alias: {
    styled: fileURLToPath(new URL('./app/assets/styles/components', import.meta.url)),
    design: fileURLToPath(new URL('./app/assets/styles/design', import.meta.url)),
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
