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
    // Route views are named after their screens (Login, Settings), as the plan lists them.
    files: ['src/client/views/**/*.vue'],
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  {
    files: ['src/client/**/*'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/server/**/*', 'tests/**/*', 'scripts/**/*', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  prettier,
)
