// ESLint flat-config. Replaces .eslintrc.cjs after the ESLint 9 migration.
//
// The rules are the same: eslint:recommended + @typescript-eslint:recommended
// + prettier, with a no-console exception for the CLI.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      // Generated migration artifacts.
      'packages/db/drizzle/**',
      // Config and infra files — not part of the typecheck graph.
      '**/*.config.{js,cjs,mjs,ts}',
      '**/postcss.config.{js,cjs}',
      '**/tailwind.config.{js,cjs}',
      '**/vite.config.{js,ts}',
      '**/drizzle.config.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // The CLI is operator-facing; console.log is the right output channel.
  {
    files: ['apps/cli/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
];
