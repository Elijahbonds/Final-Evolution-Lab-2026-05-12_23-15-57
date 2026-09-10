// Flat ESLint config.
//
// `next lint` cannot be used here: Next 14.2 drives ESLint through the v8 API
// and this tree is on ESLint 9, which removed the options it passes
// (useEslintrc, extensions, resolvePluginsRelativeTo, rulePaths, ignorePath).
// Running `eslint` directly with a flat config keeps both versions as they are.
// eslint-config-next is still a legacy shareable config, so FlatCompat wraps it.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',
      'docs/**',
      '**/*.reference',
      'next-env.d.ts',
      '__abacus_error_reporter.js',
    ],
  },
  ...compat.extends('next/core-web-vitals'),
];
