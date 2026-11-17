#!/usr/bin/env -S npx tsx
/**
 * The full app typecheck imports the committed Prisma client declarations and now builds a
 * >2 GB TypeScript program. Keep npm/npx using the repo's documented heap so the required
 * `npx tsc --noEmit` gate works from a cold checkout instead of failing before diagnostics.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const npmrcPath = path.join(__dirname, '..', '.npmrc');
const npmrc = fs.readFileSync(npmrcPath, 'utf8');

assert.match(
  npmrc,
  /^node-options=--max-old-space-size=(8192|[1-9]\d{4,})$/m,
  '.npmrc must keep npm/npx on a heap large enough for the full TypeScript gate',
);

console.log('typecheck-env-tests: npm/npx heap is pinned for the full TypeScript gate');
