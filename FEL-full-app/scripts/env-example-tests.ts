#!/usr/bin/env -S npx tsx
// Release-readiness guard for .env.example: one active safe default per shipped switch.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ABACUS_FLAG = ['ABACUS', 'ENABLED'].join('_');

const REQUIRED_EMPTY = [
  ABACUS_FLAG,
  'ARENA_RECLAIM_SECRET',
  'COACH_REVIEWS_BUCKET',
  'COACH_REVIEW_UPLOADS_ENABLED',
  'COACH_STORE_COACH_USER_IDS',
  'COACH_STORE_ENABLED',
  'COACH_STORE_LIVE',
  'COACH_STORE_PAYMENTS_ENABLED',
  'COACH_STORE_RECONCILE_SECRET',
  'FACE_SCAN_ENABLED',
  'FEL_TEST_ACCOUNTS',
  'LIVE_STREAM_SCHEDULE_ENABLED',
  'NEXT_PUBLIC_JOIN_LAB_ENABLED',
  'PAYOUTS_ENABLED',
  'RETENTION_CRON_SECRET',
  'VIRTUAL_PURCHASES_ENABLED',
] as const;

const RETIRED = [
  'STRIPE_BOOKS_SECRET_KEY',
] as const;

const example = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8');
const lines = example.split(/\r?\n/);
let checks = 0;
const failures: string[] = [];

function ok(condition: boolean, message: string) {
  checks += 1;
  if (!condition) failures.push(message);
}

const active = new Map<string, { line: number; text: string }[]>();
for (const [index, line] of lines.entries()) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (!match) continue;
  const key = match[1];
  const entries = active.get(key) ?? [];
  entries.push({ line: index + 1, text: line });
  active.set(key, entries);
}

const duplicates = [...active.entries()].filter(([, hits]) => hits.length > 1);
ok(
  duplicates.length === 0,
  `.env.example has duplicate active assignments: ${duplicates
    .map(([key, hits]) => `${key} at lines ${hits.map((h) => h.line).join(', ')}`)
    .join('; ')}`,
);

for (const key of REQUIRED_EMPTY) {
  const hits = active.get(key) ?? [];
  ok(hits.length === 1, `${key} is listed exactly once as an active safe default`);
  ok(hits[0]?.text === `${key}=""`, `${key} defaults empty/off in .env.example`);
}

for (const key of RETIRED) {
  ok(!new RegExp(`^${key}=`, 'm').test(example), `${key} stays retired from .env.example`);
}

if (failures.length) {
  console.error(`env-example-tests: ${failures.length} FAILED of ${checks}`);
  for (const failure of failures) console.error(`  x ${failure}`);
  process.exit(1);
}

console.log(`env-example-tests: ${checks} checks green`);
