import { vanityPlugin } from '@mszr/vanity/vite'
// Five styling stacks, one app: Tailwind rides its Vite plugin, Panda rides
// PostCSS (postcss.config.cjs), and vanityPlugin serves both the vanity
// lane (*.css.ts) and the raw vanilla-extract lane (*.css.ts) — coexistence
// is the point ([vision.md §7]).
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // Vue's framework-level auto-imports remain host policy. Vanity's plugin
    // owns only its own runtime groups and application barrels below.
    AutoImport({
      imports: ['vue'],
      dts: './auto-imports.d.ts',
      vueTemplate: true,
    }),
    vue(),
    tailwindcss(),
    vanityPlugin({
      compiler: {
        system: './src/lanes/vanity/system.ts',
        // This file is loaded before every framework stylesheet, so it owns the
        // one global layer order. Tailwind/Panda resets precede Vanity recipes.
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
        styleAutoImports: true,
      },
      app: {
        runtimeAutoImports: ['core', 'vue'],
      },
    }),
  ],
})
