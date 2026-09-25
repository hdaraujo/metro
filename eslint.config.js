import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'dist',
      'dev-dist',
      'coverage',
      'playwright-report',
      'test-results',
      'documentation',
      'plays',
      '.claude',
      'public',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.stylistic,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['src/**/*.tsx'],
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['*.{js,ts}', 'tests/e2e/**'],
    languageOptions: { globals: globals.node },
  },
  eslintConfigPrettier,
);
