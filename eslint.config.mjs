import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import prettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'

export default defineConfig(
  // Ignored paths
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'docs/.vitepress/cache/**',
      'docs/.vitepress/dist/**',
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript recommended (applies to .ts, .tsx, .mts, .cts)
  ...tseslint.configs.recommended,

  // Vue 3 recommended (applies to .vue files)
  ...pluginVue.configs['flat/recommended'],

  // Vue files: use typescript-eslint parser for <script> blocks
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        sourceType: 'module',
      },
    },
  },

  // API: Node.js globals only
  {
    files: ['apps/api/**/*.{ts,js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Web: browser globals
  {
    files: ['apps/web/**/*.{ts,js,vue}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // Prettier must come last: disables conflicting rules and adds prettier/prettier
  prettierRecommended,

  // ─── CE code must never import from the EE package ─────────────────────────
  // EE is proprietary; CE code importing it would inadvertently bundle closed IP.
  {
    files: ['apps/api/**/*.{ts,js}', 'apps/web/**/*.{ts,vue}', 'packages/shared/**/*.ts', 'packages/cli/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nubisco/verba-ee', '@nubisco/verba-ee/*', '*/packages/ee*'],
              message: 'CE code must not import from the Enterprise Edition package. EE features are proprietary.',
            },
          ],
        },
      ],
      semi: 'off',
    },
  },

  // Allow intentionally unused variables when prefixed with _
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
          trailingComma: 'all',
          printWidth: 120,
          tabWidth: 2,
          semi: false,
        },
      ],
      '@typescript-eslint/semi': 'off',
      semi: 'off',
    },
  },
)
