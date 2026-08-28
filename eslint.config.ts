import antfu from '@antfu/eslint-config'

const frameworkImports = ['vue', 'nuxt', '@nuxt/*']
const buildImports = ['vite', '@vanilla-extract/vite-plugin']
const substrateImports = ['@vanilla-extract/*']

export default antfu(
  {
    formatters: true,
    typescript: true,
    vue: true,
    ignores: [
      '**/dist/**',
      '**/dist-*/**',
      '**/node_modules/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/.turbo/**',
      '**/.vanity/**',
      '**/__archive__/**',
      '**/__references__/**',
      '**/__temp__/**',
    ],
  },
  {
    files: ['**/*.vue'],
    rules: {
      // Disable unused-imports linting for Vue files due to Pug template usage detection issues
      'unused-imports/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'off',

      'vue/block-order': ['error', {
        order: ['template[lang="pug"]', 'script[setup][lang="ts"]', 'style'],
      }],
      'vue/define-macros-order': 'off',
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
  {
    files: ['**/*.md'],
    rules: {
      'format/prettier': 'off',
    },
  },
  {
    files: ['**/*.md/**'],
    rules: {
      'style/no-multi-spaces': 'off',
      'perfectionist/sort-imports': 'off',
      'import/order': 'off',
      'import/consistent-type-specifier-style': 'off',
      'object-shorthand': 'off',
      'antfu/no-top-level-await': 'off',
      'format/prettier': 'off',
      'unused-imports/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'vue/padding-line-between-blocks': 'off',
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
  {
    files: ['scripts/**', 'sandbox/**', 'spikes/**'],
    rules: {
      'no-console': 'off',
      'node/prefer-global/process': 'off',
      'antfu/no-top-level-await': 'off',
    },
  },
  {
    files: ['scripts/**/*.test.ts'],
    rules: {
      // Maintainer scripts run directly on Node; their focused tests use the
      // built-in runner rather than adding a second test runtime to the root.
      'test/no-import-node-test': 'off',
    },
  },
  {
    files: ['pnpm-workspace.yaml'],
    rules: {
      // The default catalog is the verified matrix; `peers` is intentionally
      // a broader publication contract for those same integration packages.
      'pnpm/yaml-no-duplicate-catalog-item': 'off',
    },
  },
  {
    files: ['sandbox/demo-comparisons/**/*.vue'],
    rules: {
      'ts/no-use-before-define': 'off',
    },
  },
  {
    files: [
      'sdk/src/index.ts',
      'sdk/src/diagnostics.ts',
      'sdk/src/atoms/**',
      'sdk/src/tokens/**',
      'sdk/src/system/**',
      'sdk/src/css/**',
      'sdk/src/ports/**',
      'sdk/src/recipes/**',
      'sdk/src/internal/**',
    ],
    ignores: ['**/*.test.ts', '**/*.test-d.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          ...frameworkImports,
          ...buildImports,
          './runtime',
          '../runtime',
          './vue',
          '../vue',
          './nuxt',
          '../nuxt',
        ],
      }],
    },
  },
  {
    files: ['sdk/src/runtime.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          ...frameworkImports,
          ...buildImports,
          ...substrateImports,
        ],
      }],
    },
  },
  {
    files: ['sdk/src/vite.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: frameworkImports,
      }],
    },
  },
  {
    files: ['sdk/src/vue.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['vite', '@nuxt/*', './vite', './nuxt'],
      }],
    },
  },
  {
    files: ['sdk/src/nuxt.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['vue', './vue'],
      }],
    },
  },
  {
    files: ['sdk/src/presets.ts', 'sdk/src/presets/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          './runtime',
          '../runtime',
          './vite',
          '../vite',
          './vue',
          '../vue',
          './nuxt',
          '../nuxt',
          './internal/**',
          '../internal/**',
          ...substrateImports,
        ],
      }],
    },
  },
)
