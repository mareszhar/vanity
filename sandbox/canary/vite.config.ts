import { vanityPlugin } from '@mszr/vanity/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vanityPlugin({
      compiler: {
        system: './src/system.ts',
        layerOrder: ['vendor', 'canary'],
      },
    }),
  ],
  build: {
    cssCodeSplit: true,
    cssMinify: false,
    minify: false,
  },
})
