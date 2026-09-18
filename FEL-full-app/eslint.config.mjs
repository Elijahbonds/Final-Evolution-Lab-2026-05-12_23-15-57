import { FlatCompat } from '@eslint/eslintrc';
import typescriptEslintPlugin from '@typescript-eslint/eslint-plugin';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const config = [
  {
    ignores: [
      '.next/**',
      '.next-*/**',
      'node_modules/**',
      'public/loaders/**',
      'server/netd/dist/**',
    ],
  },
  {
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
    },
  },
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      'react/no-unescaped-entities': 'off',
    },
  },
];

export default config;
