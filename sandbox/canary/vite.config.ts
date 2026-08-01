import { vanityPlugin } from '@mszr/vanity/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vanityPlugin({
      system: './src/system.ts',
      cascade: ['vendor', 'canary'],
    }),
  ],
  build: {
    cssCodeSplit: true,
    cssMinify: false,
    minify: false,
  },
})
