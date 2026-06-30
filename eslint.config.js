import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

// Flat-config port of the former .eslintrc.cjs:
//   extends: eslint:recommended + plugin:@typescript-eslint/recommended
//   env: browser + node + es2022   ignore: dist, node_modules, scripts
export default [
  { ignores: ['dist', 'node_modules', 'scripts'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: { ...tsPlugin.configs.recommended.rules },
  },
  {
    // Tests cast partial req/res/fetch stubs to satisfy handler signatures —
    // building full Vercel request/response objects adds noise without value.
    files: ['**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
];
