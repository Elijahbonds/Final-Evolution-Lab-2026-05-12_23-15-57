#!/usr/bin/env -S npx tsx
/**
 * scripts/payments-preflight.ts — PAYMENTS-READY (2026-10-26): the owner runs this before turning payments on, and again
 * before going live. It lists every money switch, setting and secret, and says what is missing or inconsistent. It never
 * prints a secret value, and it calls nothing: no network, no database, no Stripe. The checks are lib/payments/
 * preflight.ts (unit-tested in lib/payments/preflight.test.ts).
 *
 *   npx tsx scripts/payments-preflight.ts                       # the current shell's env
 *   npx tsx scripts/payments-preflight.ts --env-file <path>     # ONLY that file (e.g. the deploy tree's .env.production)
 *
 * Exit 0 = no blocking error; 1 = at least one error; 2 = the env file could not be read.
 */
import { readFileSync } from 'node:fs';
import { formatPreflight, parseEnvText, preflight } from '../lib/payments/preflight';

function envFromArgs(argv: string[]): Record<string, string | undefined> {
  const i = argv.indexOf('--env-file');
  if (i === -1) return process.env;
  const path = argv[i + 1];
  if (!path) throw new Error('--env-file needs a path');
  return parseEnvText(readFileSync(path, 'utf8'));
}

let env: Record<string, string | undefined>;
try {
  env = envFromArgs(process.argv.slice(2));
} catch (e) {
  console.error(`payments-preflight: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
}
const report = preflight(env);
console.log(formatPreflight(report));
process.exit(report.errors ? 1 : 0);
