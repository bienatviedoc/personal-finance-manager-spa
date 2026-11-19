import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import i18next from 'eslint-plugin-i18next'
import jsxA11y from 'eslint-plugin-jsx-a11y-x'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import noCrossFeatureInternals from './eslint-rules/no-cross-feature-internals.js'

const local = { rules: { 'no-cross-feature-internals': noCrossFeatureInternals } }

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'src/shared/api/schema.d.ts']),

  {
    files: ['**/*.{js,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 'latest', globals: { ...globals.browser, ...globals.node } },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite, jsxA11y.configs.recommended],
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
          'should-validate-template': true,
          // Calls whose string arguments are names or paths, never text. The plugin's defaults are
          // repeated because this list replaces them.
          callees: {
            exclude: [
              'i18n(ext)?', 't', 'require', 'addEventListener', 'removeEventListener', 'postMessage',
              'getElementById', 'dispatch', 'commit', 'includes', 'indexOf', 'endsWith', 'startsWith',
              '(.+\\.)?register', '(.+\\.)?setError', '(.+\\.)?navigate', '(.+\\.)?get',
            ],
          },
          'jsx-attributes': {
            exclude: [
              'className', 'style', 'type', 'key', 'id', 'width', 'height',
              'to', 'href', 'path', 'role', 'variant', 'size', 'lang', 'htmlFor',
              'rel', 'target', 'src', 'end', 'data-.*', 'autoComplete', 'inputMode',
            ],
          },
        },
      ],
    },
  },
])
