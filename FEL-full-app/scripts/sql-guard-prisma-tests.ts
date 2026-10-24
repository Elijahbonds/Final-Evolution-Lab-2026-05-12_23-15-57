#!/usr/bin/env -S npx tsx
/**
 * scripts/sql-guard-prisma-tests.ts — the db-guard matcher against what PRISMA ITSELF PRINTS, offline.
 *
 * scripts/sql-guard-tests.ts proves the rules on hand-built diffs. This proves the one assumption those cannot: that
 * `prisma migrate diff --script` (the exact command db-guard runs against production) prints each reviewed pending
 * file in a form the matcher accepts. No database is involved: each case builds a "production" schema by cutting the
 * pending file's models or fields out of prisma/schema.prisma, then asks the Prisma CLI from the lockfile for
 * `--from-schema-datamodel <that> --to-schema-datamodel prisma/schema.prisma --script`, which is the diff production
 * would print if it lacked exactly those files.
 *
 * Measured 2026-10-20 (Prisma 6.7.0): every schema-backed pending file matches; the hand-written AdventureSave file
 * does NOT (inline PRIMARY KEY / REFERENCES, not Prisma's form), so if production ever lacked that table the guard
 * would stop and ask rather than apply it; a production that already has a raw-SQL table (PartyReport) prints a DROP,
 * and the guard stops.
 *
 * Run: npx tsx scripts/sql-guard-prisma-tests.ts
 */
import assert from 'node:assert';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { decide, type Decision, type PendingFile } from './sql-guard/sqlGuard';

const run = promisify(execFile);
const APP = path.join(__dirname, '..');
const SCHEMA_PATH = path.join(APP, 'prisma', 'schema.prisma');
const SCHEMA = fs.readFileSync(SCHEMA_PATH, 'utf8');
const PRISMA = require.resolve('prisma/build/index.js', { paths: [APP] });
const PENDING_DIR = path.join(APP, 'prisma', 'pending');
const pending: PendingFile[] = fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.sql')).sort()
  .map(name => ({ name, sql: fs.readFileSync(path.join(PENDING_DIR, name), 'utf8') }));
const named = (stem: string) => {
  const f = pending.find(p => p.name.includes(stem));
  assert.ok(f, `fixture prisma/pending/*${stem}* is gone`);
  return f.name;
};

// ---- schema surgery: take a model, an enum or a field back out, as production would lack it ----

function blockRange(schema: string, kind: 'model' | 'enum', name: string): [number, number] | null {
  const m = new RegExp(`^${kind} ${name} \\{`, 'm').exec(schema);
  if (!m) return null;
  const end = schema.indexOf('\n}', m.index);
  assert.ok(end !== -1, `${kind} ${name} has no closing brace`);
  return [m.index, end + 2];
}

/** Removes `model X` / `enum X` and every field (in any model) whose type is X, X? or X[]. */
function withoutType(schema: string, name: string): string {
  let s = schema;
  for (const kind of ['model', 'enum'] as const) {
    const r = blockRange(s, kind, name);
    if (r) s = s.slice(0, r[0]) + s.slice(r[1]);
  }
  return s.replace(new RegExp(`^[ \\t]+\\w+[ \\t]+${name}(\\?|\\[\\])?([ \\t].*)?\\n`, 'gm'), '');
}

/** Removes one field line from one model. */
function withoutField(schema: string, model: string, field: string): string {
  const r = blockRange(schema, 'model', model);
  assert.ok(r, `model ${model} not found`);
  const block = schema.slice(r[0], r[1]);
  const cut = block.replace(new RegExp(`^[ \\t]+${field}[ \\t].*\\n`, 'm'), '');
  assert.notStrictEqual(cut, block, `field ${model}.${field} not found`);
  return schema.slice(0, r[0]) + cut + schema.slice(r[1]);
}

interface Case { name: string; prod: string; expect: (d: Decision) => void }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-guard-prisma-'));

async function diffFrom(prodSchema: string, label: string): Promise<string> {
  const from = path.join(tmp, `${label}.prisma`);
  fs.writeFileSync(from, prodSchema);
  const { stdout } = await run(process.execPath, [PRISMA, 'migrate', 'diff', '--from-schema-datamodel', from,
    '--to-schema-datamodel', SCHEMA_PATH, '--script'], {
    cwd: APP,
    // No database is read: both sides are schema files. The URLs only satisfy env() in the datasource block.
    env: { ...process.env, CHECKPOINT_DISABLE: '1', DATABASE_URL: 'postgresql://none:none@127.0.0.1:1/none', DIRECT_URL: 'postgresql://none:none@127.0.0.1:1/none' },
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

const match = (...stems: string[]) => (d: Decision) =>
  assert.deepStrictEqual(d.kind === 'match' ? d.files : d, stems.map(named));

const cases: Case[] = [
  { name: 'p5 health: three tables', prod: ['HealthIntake', 'PainCheckIn', 'HealthConsent'].reduce(withoutType, SCHEMA), expect: match('p5-health') },
  {
    name: 'p6 warm-up: an enum, four columns on three tables, one table',
    prod: [['ClientSession', 'cooldownDoneAt'], ['GuardianConsent', 'selfRequested'], ['GuardianConsent', 'acceptedById']]
      .reduce((s, [m, f]) => withoutField(s, m, f), ['SessionKind', 'ReadinessCheckIn'].reduce(withoutType, SCHEMA)),
    expect: match('p6-warmup'),
  },
  { name: 'p7 breath log', prod: withoutType(SCHEMA, 'BreathLog'), expect: match('p7-breath') },
  { name: 'p8 served exercise: one column', prod: withoutField(SCHEMA, 'ExerciseLog', 'servedExerciseId'), expect: match('p8-served') },
  {
    name: 'economy caps: two columns, a unique index and an FK',
    prod: [['GameSession', 'runId'], ['GameSession', 'run'], ['SessionRun', 'agentRun'], ['SessionRun', 'gameSession']]
      .reduce((s, [m, f]) => withoutField(s, m, f), SCHEMA),
    expect: match('economy-caps'),
  },
  { name: 'AB-04 scan-save opt-in', prod: withoutType(SCHEMA, 'ScanSaveOptIn'), expect: match('adult-optin') },
  {
    name: 'coach store: five files, in dependency order',
    prod: ['CallSignal', 'Booking', 'ProgramAccess', 'CoachStoreReferral', 'Instructor'].reduce(withoutType, SCHEMA),
    expect: match('coach-store-instructor', 'coach-store-booking', 'coach-store-call-signal', 'coach-store-program-access', 'coach-store-referral'),
  },
  { name: 'read markers: ProgramMessage.readAt', prod: withoutField(SCHEMA, 'ProgramMessage', 'readAt'), expect: match('message-read-markers') },
  { name: 'coach availability', prod: withoutType(SCHEMA, 'CoachAvailability'), expect: match('coach-availability') },
  // RATE-LIMIT-WIRE (lane/rate-limits): an @@map'd table with a named index, so Prisma's names must be the file's
  { name: 'rate limits: rate_limits and its reset_at index', prod: withoutType(SCHEMA, 'RateLimit'), expect: match('rate-limits') },
  {
    name: 'two files at once (p5 + p7), interleaved by Prisma',
    prod: ['HealthIntake', 'PainCheckIn', 'HealthConsent', 'BreathLog'].reduce(withoutType, SCHEMA),
    expect: match('p5-health', 'p7-breath'),
  },
  {
    name: 'the whole mirror-coach backlog (p5-p8) at once',
    prod: withoutField(['HealthIntake', 'PainCheckIn', 'HealthConsent', 'BreathLog', 'SessionKind', 'ReadinessCheckIn'].reduce(withoutType,
      [['ClientSession', 'cooldownDoneAt'], ['GuardianConsent', 'selfRequested'], ['GuardianConsent', 'acceptedById']]
        .reduce((s, [m, f]) => withoutField(s, m, f), SCHEMA)), 'ExerciseLog', 'servedExerciseId'),
    expect: match('p5-health', 'p6-warmup', 'p7-breath', 'p8-served'),
  },
  {
    name: 'p8 + one change no pending file explains: stop',
    prod: withoutField(withoutField(SCHEMA, 'ExerciseLog', 'servedExerciseId'), 'GameSession', 'maxCombo'),
    expect: d => { assert.strictEqual(d.kind, 'unexpected'); assert.match(d.kind === 'unexpected' ? d.reasons.join('\n') : '', /NO PENDING FILE: ALTER TABLE "GameSession" ADD COLUMN\s+"maxCombo"/); },
  },
  {
    name: 'AdventureSave (hand-written, not Prisma\'s form): stop and ask, never a near-match',
    prod: withoutType(SCHEMA, 'AdventureSave'),
    expect: d => { assert.strictEqual(d.kind, 'unexpected'); assert.match(d.kind === 'unexpected' ? d.reasons.join('\n') : '', /NO PENDING FILE: CREATE TABLE "AdventureSave"/); },
  },
  {
    name: 'production already has the raw-SQL PartyReport table: the DROP stops',
    prod: `${SCHEMA}\nmodel PartyReport {\n  id           String   @id\n  reporterId   String?\n  reportedId   String?\n  reportedName String\n  partyCode    String\n  reason       String\n  reportedAt   DateTime\n  createdAt    DateTime @default(now())\n  @@index([reportedId])\n  @@index([createdAt])\n}\n`,
    expect: d => { assert.strictEqual(d.kind, 'unexpected'); assert.match(d.kind === 'unexpected' ? d.reasons.join('\n') : '', /DESTRUCTIVE: DROP TABLE "PartyReport".*2026-10-13-party-report\.sql/); },
  },
  { name: 'production equals the schema: empty', prod: SCHEMA, expect: d => assert.deepStrictEqual(d, { kind: 'empty' }) },
];

(async () => {
  console.log('sql-guard: Prisma\'s own diffs (offline, no database)');
  let pass = 0;
  const failures: string[] = [];
  const results = await Promise.all(cases.map(async (c, i) => {
    try { return { c, diff: await diffFrom(c.prod, `case-${i}`) }; } catch (e) { return { c, error: e as Error }; }
  }));
  for (const r of results) {
    try {
      if ('error' in r) throw r.error;
      r.c.expect(decide(r.diff, pending));
      pass++;
      console.log(`  ✓ ${r.c.name}`);
    } catch (e) {
      failures.push(r.c.name);
      console.log(`  ✗ ${r.c.name}\n    ${String((e as Error).message).split('\n').join('\n    ')}`);
      if (!('error' in r)) console.log(`    the diff Prisma printed:\n${r.diff.replace(/^/gm, '      ')}`);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nsql-guard-prisma: ${pass} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
})();
