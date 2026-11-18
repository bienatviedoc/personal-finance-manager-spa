import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import i18next from 'eslint-plugin-i18next'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import noCrossFeatureInternals from './eslint-rules/no-cross-feature-internals.js'

const local = { rules: { 'no-cross-feature-internals': noCrossFeatureInternals } }

export default defineConfig([
  globalIgnores(['dist', 'coverage']),

  {
    files: ['**/*.{js,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 'latest', globals: { ...globals.browser, ...globals.node } },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    plugins: { local },
    rules: {
      // Features are used from outside only through their public index (spec section 12).
      'local/no-cross-feature-internals': 'error',
    },
  },

  // shadcn primitives export their variant helpers next to the component, by design.
  {
    files: ['src/shared/ui/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  // Every user-facing string goes through i18next. Generated UI primitives and tests are exempt.
  {
    files: ['src/**/*.tsx'],
    ignores: ['src/shared/ui/**', 'src/**/*.test.tsx', 'src/test/**'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'jsx-attributes': {
            exclude: [
              'className', 'style', 'type', 'key', 'id', 'width', 'height',
              'to', 'href', 'path', 'role', 'variant', 'size', 'lang', 'htmlFor', 'name',
              'rel', 'target', 'src', 'end', 'data-.*', 'autoComplete',
            ],
          },
        },
      ],
    },
  },
])
