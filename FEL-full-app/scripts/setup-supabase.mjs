// One-shot Supabase bring-up (2026-09-12).
//
// Run this AFTER putting DATABASE_URL (pooled, :6543) and DIRECT_URL (direct, :5432)
// in .env.local. It checks both strings look right, pushes the 78-model schema through
// the DIRECT connection, and verifies the app can actually reach the pooled one —
// which are different failure modes and worth separating.
//
//   node scripts/setup-supabase.mjs
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const envFile = '.env.local';
if (!existsSync(envFile)) { console.error(`missing ${envFile}`); process.exit(1); }
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8').split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const problems = [];
const host = (u) => { try { return new URL(u).host; } catch { return null; } };
if (!env.DATABASE_URL) problems.push('DATABASE_URL is missing');
if (!env.DIRECT_URL) problems.push('DIRECT_URL is missing');
if (env.DATABASE_URL && host(env.DATABASE_URL)?.includes('localhost')) problems.push('DATABASE_URL still points at localhost — a deployed function cannot reach it');
if (env.DATABASE_URL && !env.DATABASE_URL.includes('pgbouncer=true')) problems.push('DATABASE_URL lacks ?pgbouncer=true&connection_limit=1 — serverless will exhaust Supabase connections');
if (env.DATABASE_URL && !env.DATABASE_URL.includes(':6543')) problems.push('DATABASE_URL is not the pooled (:6543) string');
if (env.DIRECT_URL && !env.DIRECT_URL.includes(':5432')) problems.push('DIRECT_URL is not the direct (:5432) string');
if (problems.length) { console.error('\n✖ ' + problems.join('\n✖ ') + '\n'); process.exit(1); }

console.log(`→ direct:  ${host(env.DIRECT_URL)}`);
console.log(`→ pooled:  ${host(env.DATABASE_URL)}`);
console.log('\n[1/3] generating client…');
execSync('npx prisma generate --schema=prisma/schema.prisma', { stdio: 'inherit' });
console.log('\n[2/3] pushing 78 models through the DIRECT connection…');
execSync('npx prisma db push --schema=prisma/schema.prisma --skip-generate', { stdio: 'inherit' });
console.log('\n[3/3] verifying the POOLED connection the app will actually use…');
execFileSync('node', ['-e', "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.$queryRawUnsafe('select 1').then(() => { console.log('pooled connection OK'); process.exit(0); }).catch((e) => { console.error('pooled connection FAILED:', e.message); process.exit(1); });"], { stdio: 'inherit' });
console.log('\n✔ Supabase is ready. Redeploy to push it live.');
