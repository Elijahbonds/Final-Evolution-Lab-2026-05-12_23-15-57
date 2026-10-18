import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ENV_EXAMPLE = readFileSync('.env.example', 'utf8');
const ROOT = process.cwd();

const REQUIRED_ENV_KEYS = [
  'ABACUS_ENABLED',
  'ARENA_RECLAIM_SECRET',
  'COACH_REVIEW_UPLOADS_ENABLED',
  'COACH_REVIEWS_BUCKET',
  'COACH_STORE_BLOCKED_ADDRESS_TERMS',
  'COACH_STORE_COACH_USER_IDS',
  'COACH_STORE_ENABLED',
  'COACH_STORE_LIVE',
  'COACH_STORE_PAYMENTS_ENABLED',
  'COACH_STORE_RECONCILE_SECRET',
  'COACH_STORE_REFERRAL_SHARE_OF_FEE',
  'CREATOR_MEDIA_BUCKET',
  'CREATOR_MEDIA_PUBLIC_BUCKET',
  'FACE_SCAN_ENABLED',
  'FEL_TEST_ACCOUNTS',
  'LIVE_STREAM_SCHEDULE_ENABLED',
  'NEXT_PUBLIC_JOIN_LAB_ENABLED',
  'PAYOUTS_ENABLED',
  'RETENTION_CRON_SECRET',
  'VIRTUAL_PURCHASES_ENABLED',
] as const;

const RUNTIME_ENV_DIRS = ['app', 'components', 'lib', 'server'] as const;
const SOURCE_FILE = /\.(tsx?|mts|mjs|jsx?)$/;
const TEST_FILE = /\.(test|spec)\.(tsx?|mts|mjs|jsx?)$/;
const HOST_OR_LANGUAGE_KEYS = new Set(['NEXT_RUNTIME', 'NODE_ENV']);
const DIRECT_ENV_READ = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[['"]([A-Z][A-Z0-9_]*)['"]\])/g;

function runtimeSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'generated') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      runtimeSourceFiles(path, out);
      continue;
    }
    if (!SOURCE_FILE.test(path) || TEST_FILE.test(path) || /\.d\.(ts|mts)$/.test(path)) continue;
    out.push(path);
  }
  return out;
}

function directRuntimeEnvKeys(): string[] {
  const keys = new Set<string>();
  for (const dir of RUNTIME_ENV_DIRS) {
    const root = join(ROOT, dir);
    for (const path of runtimeSourceFiles(root)) {
      const src = readFileSync(path, 'utf8');
      for (const match of src.matchAll(DIRECT_ENV_READ)) keys.add(match[1] ?? match[2]);
    }
  }
  return [...keys].sort();
}

describe('.env.example production switches', () => {
  it('names every documented production switch or secret that otherwise fails closed', () => {
    for (const key of REQUIRED_ENV_KEYS) {
      expect(ENV_EXAMPLE, `${key} missing from .env.example`).toContain(key);
    }
  });

  it('does not resurrect the retired separate Stripe key for books', () => {
    expect(ENV_EXAMPLE).not.toContain('STRIPE_BOOKS_SECRET_KEY');
  });

  it('documents every direct runtime env read in app, components, lib and server source', () => {
    const undocumented = directRuntimeEnvKeys()
      .filter((key) => !HOST_OR_LANGUAGE_KEYS.has(key))
      .filter((key) => !ENV_EXAMPLE.includes(key));
    expect(undocumented).toEqual([]);
  });
});
