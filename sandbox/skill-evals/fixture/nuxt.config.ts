import vanityConfig from './vanity.config.ts'

export default defineNuxtConfig({
  modules: ['@mszr/vanity/nuxt'],
  vanity: vanityConfig,
  ssr: false,
  // Components live in namesake folders: components/UiCard/UiCard.vue → <UiCard>.
  components: [{ path: '~/components', pathPrefix: false }],
  compatibilityDate: '2026-07-09',
  devtools: { enabled: false },
  typescript: {
    strict: true,
    tsConfig: {
      compilerOptions: { allowImportingTsExtensions: true },
      vueCompilerOptions: { plugins: ['@vue/language-plugin-pug'] },
    },
  },
})
