import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['src/client/**/*'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/server/**/*', 'tests/**/*', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  prettier,
)
