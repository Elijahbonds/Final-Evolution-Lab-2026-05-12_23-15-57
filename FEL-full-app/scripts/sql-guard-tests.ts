#!/usr/bin/env -S npx tsx
/**
 * scripts/sql-guard-tests.ts — the db-guard matcher (scripts/sql-guard/sqlGuard.ts), the coordinator's verdict
 * (scripts/sql-guard/await-db-guard.ts) and the workflow's shape (.github/workflows/db-guard.yml).
 *
 * The fixtures are the REAL files in prisma/pending/, plus diffs built the way Prisma prints them (statements grouped
 * by kind across files). scripts/sql-guard-prisma-tests.ts adds diffs printed by the Prisma CLI itself, offline.
 * Mutation-checked 2026-10-23: 30 mutants (20 in sqlGuard.ts, one per rule; 4 in the coordinator's verdict; 6 in
 * db-guard.yml: environment, ref allowlist, concurrency, permissions, pinning, no pull_request), all turn a check here red.
 *
 * Run: npx tsx scripts/sql-guard-tests.ts
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { decide, dependencyOrder, parseSql, redact, rollbackFor, type Decision, type PendingFile } from './sql-guard/sqlGuard';
import { releaseVerdict, STEP_NO_SECRET, STEP_VERIFIED } from './sql-guard/await-db-guard';

const APP = path.join(__dirname, '..');
const PENDING_DIR = path.join(APP, 'prisma', 'pending');
const pending: PendingFile[] = fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.sql')).sort()
  .map(name => ({ name, sql: fs.readFileSync(path.join(PENDING_DIR, name), 'utf8') }));
const file = (stem: string) => {
  const f = pending.find(p => p.name.includes(stem));
  assert.ok(f, `fixture prisma/pending/*${stem}* is gone; point this test at another real pending file`);
  return f;
};

let pass = 0;
const ok = (name: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${name}`); };
const isMatch = (d: Decision, files: string[]) => assert.deepStrictEqual(d, { kind: 'match', files, statementCount: (d as { statementCount?: number }).statementCount });
const isUnexpected = (d: Decision, re: RegExp) => {
  assert.strictEqual(d.kind, 'unexpected', `expected unexpected, got ${JSON.stringify(d)}`);
  const text = (d as { reasons: string[] }).reasons.join('\n');
  assert.match(text, re);
};

/** A diff in Prisma's shape: every statement of the given files, grouped by kind, as `migrate diff --script` does. */
function prismaShaped(...files: PendingFile[]): string {
  const rank = (norm: string) =>
    norm.startsWith('create type') ? 0 : norm.startsWith('alter table') && !norm.includes('foreign key') ? 1
      : norm.startsWith('create table') ? 2 : norm.startsWith('create') ? 3 : 4;
  const all = files.flatMap(f => parseSql(f.sql).statements);
  return all.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s.norm) - rank(b.s.norm) || a.i - b.i)
    .map(({ s }) => `-- ${['CreateEnum', 'AlterTable', 'CreateTable', 'CreateIndex', 'AddForeignKey'][rank(s.norm)]}\n${s.raw};\n`).join('\n');
}

const p5 = file('mirror-coach-p5-health');
const p6 = file('mirror-coach-p6-warmup');
const p7 = file('mirror-coach-p7-breath');
const p8 = file('mirror-coach-p8-served');
const instructor = file('coach-store-instructor');
const booking = file('coach-store-booking');
const callSignal = file('coach-store-call-signal');
const party = file('party-report');
const creator = file('creator-inquiry');
const books = file('book-shop');

console.log('sql-guard: the matcher');

ok(`each real pending file (${pending.length}) matches exactly itself`, () => {
  assert.ok(pending.length >= 17, `expected the 17 pending files of 2026-10-20 or more, found ${pending.length}`);
  for (const f of pending) {
    const additive = parseSql(f.sql).statements.every(s => s.additive);
    const d = decide(f.sql, pending);
    if (additive) isMatch(d, [f.name]);
    else assert.strictEqual(d.kind, 'unexpected', `${f.name} holds a non-additive statement, so it must never match`);
  }
});

ok('the 17 reviewed files of 2026-10-20 are all additive (none would be refused)', () => {
  for (const f of pending.filter(p => p.name < '2026-10-14')) {
    for (const s of parseSql(f.sql).statements) assert.ok(s.additive, `${f.name}: ${s.raw} (${s.reason})`);
  }
});

ok('each real file also matches in Prisma\'s grouped shape (comments and blank lines differ)', () => {
  for (const f of pending) isMatch(decide(prismaShaped(f), pending), [f.name]);
});

ok('a diff equal to two files matches both, in date order', () => {
  isMatch(decide(prismaShaped(p5, p7), pending), [p5.name, p7.name]);
  isMatch(decide(prismaShaped(p7, p5), pending), [p5.name, p7.name]);
});

ok('dependency order beats name order: instructor before booking before call-signal', () => {
  // Alphabetically booking < call-signal < instructor; Booking REFERENCES Instructor and CallSignal REFERENCES Booking.
  isMatch(decide(prismaShaped(callSignal, booking, instructor), pending), [instructor.name, booking.name, callSignal.name]);
});

ok('an enum created in one file and used by a column in another orders them', () => {
  const a = { name: 'a-uses.sql', sql: 'ALTER TABLE "T" ADD COLUMN "k" "Kind" NOT NULL;' };
  const b = { name: 'b-creates.sql', sql: 'CREATE TYPE "Kind" AS ENUM (\'x\');' };
  isMatch(decide(a.sql + b.sql, [a, b]), [b.name, a.name]);
});

ok('statement order within the diff does not matter', () => {
  const reversed = parseSql(p6.sql).statements.map(s => `${s.raw};`).reverse().join('\n');
  isMatch(decide(reversed, pending), [p6.name]);
});

ok('whitespace, comments and keyword case do not matter', () => {
  const messy = `/* header */ create   table "BreathLog"(\n"id" text not null, "userId" TEXT NOT NULL,"kind" Text Not Null,` +
    `"sessionId" TEXT,"seconds" INTEGER, -- a note; with a semicolon\n"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,` +
    `CONSTRAINT "BreathLog_pkey" PRIMARY KEY ( "id" ) ) ;` +
    `CREATE INDEX "BreathLog_userId_kind_createdAt_idx" ON "BreathLog" ( "userId" , "kind" , "createdAt" );` +
    `ALTER TABLE "BreathLog" ADD CONSTRAINT "BreathLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`;
  isMatch(decide(messy, pending), [p7.name]);
});

ok('column order inside CREATE TABLE and ADD COLUMN clause order do not matter', () => {
  const t1 = { name: 't.sql', sql: 'CREATE TABLE "T" ("a" TEXT NOT NULL, "b" INTEGER, CONSTRAINT "T_pkey" PRIMARY KEY ("a"));' };
  isMatch(decide('CREATE TABLE "T" (CONSTRAINT "T_pkey" PRIMARY KEY ("a"), "b" INTEGER, "a" TEXT NOT NULL);', [t1]), ['t.sql']);
  const g = { name: 'g.sql', sql: 'ALTER TABLE "G" ADD COLUMN "x" TEXT,\nADD COLUMN "y" BOOLEAN NOT NULL DEFAULT false;' };
  isMatch(decide('ALTER TABLE "G" ADD COLUMN "y" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "x" TEXT;', [g]), ['g.sql']);
});

ok('quoted names and string literals are compared exactly (case and spaces kept)', () => {
  const f = { name: 'q.sql', sql: 'CREATE TABLE "Q" ("v" TEXT NOT NULL DEFAULT \'A  b;c\');' };
  isMatch(decide('create table "Q"("v" text not null default \'A  b;c\')', [f]), ['q.sql']);
  isUnexpected(decide('CREATE TABLE "Q" ("v" TEXT NOT NULL DEFAULT \'a b;c\');', [f]), /NO PENDING FILE/);
  isUnexpected(decide('CREATE TABLE "q" ("v" TEXT NOT NULL DEFAULT \'A  b;c\');', [f]), /NO PENDING FILE/);
});

ok('a diff with an extra statement is unexpected and names the stray', () => {
  const d = decide(`${p7.sql}\nCREATE TABLE "Mystery" ("id" TEXT NOT NULL);`, pending);
  isUnexpected(d, /NO PENDING FILE: CREATE TABLE "Mystery"/);
});

ok('a statement repeated more often than the files hold it is unexpected', () => {
  isUnexpected(decide(`${p8.sql}\n${p8.sql}`, pending), /.+/);
});

ok('a file only partly in the diff is unexpected, never "apply the rest"', () => {
  const stmts = parseSql(p5.sql).statements;
  const partial = stmts.slice(0, -1).map(s => `${s.raw};`).join('\n');
  isUnexpected(decide(partial, pending), new RegExp(`PARTLY APPLIED\\?: ${p5.name.replace(/\./g, '\\.')} has ${stmts.length - 1} of its ${stmts.length}`));
});

ok('DROP of the raw-SQL tables stops, and names the pending file that made each', () => {
  for (const [table, f] of [['PartyReport', party], ['CreatorInquiry', creator], ['BookEntitlement', books], ['BookFulfillmentEvent', books]] as const) {
    const d = decide(`-- DropTable\nDROP TABLE "${table}";\n`, pending);
    isUnexpected(d, new RegExp(`DESTRUCTIVE: DROP TABLE "${table}".*created by prisma/pending/${f.name.replace(/\./g, '\\.')}`));
    // It stops AT the destructive statement: the report is that reason alone, not a cover search's noise after it.
    assert.deepStrictEqual((d as { reasons: string[] }).reasons.map(r => r.split(':')[0]), ['DESTRUCTIVE']);
  }
});

ok('a DROP next to an otherwise exact match stops the whole run (nothing applied)', () => {
  isUnexpected(decide(`${p8.sql}\nDROP TABLE "PartyReport";`, pending), /DESTRUCTIVE/);
  isUnexpected(decide(`${p8.sql}\nDROP INDEX "PartyReport_createdAt_idx";`, pending), /DESTRUCTIVE/);
});

ok('ALTER ... DROP, a retype, a rename, SET NOT NULL and data changes are never applied', () => {
  for (const sql of [
    'ALTER TABLE "ProgramMessage" DROP COLUMN "readAt";',
    'ALTER TABLE "GameSession" DROP CONSTRAINT "GameSession_runId_fkey";',
    'ALTER TABLE "Session" ALTER COLUMN "kind" DROP DEFAULT;',
    'ALTER TABLE "Session" ALTER COLUMN "kind" SET DATA TYPE TEXT;',
    'ALTER TABLE "Session" ALTER COLUMN "kind" TYPE TEXT;',
    'ALTER TABLE "Session" RENAME COLUMN "kind" TO "k";',
    'ALTER TABLE "Session" ALTER COLUMN "kind" SET NOT NULL;',
    'ALTER TABLE "Session" ADD COLUMN "z" TEXT, DROP COLUMN "kind";',
    'TRUNCATE "User";', 'DELETE FROM "User";', 'UPDATE "User" SET "role" = \'x\';', 'INSERT INTO "User" VALUES (1);',
    'CREATE TABLE "Tmp" ("a" TEXT) ON COMMIT DROP;',
    'BEGIN;', 'CREATE EXTENSION "x";', 'GRANT ALL ON "User" TO public;',
  ]) {
    const d = decide(sql, [{ name: 'same.sql', sql }]);
    assert.strictEqual(d.kind, 'unexpected', `must stop: ${sql}`);
  }
});

ok('a pending file that contains a DROP is ineligible even when the diff equals it', () => {
  const bad = { name: '2026-12-01-has-drop.sql', sql: 'CREATE TABLE "N" ("id" TEXT NOT NULL);\nALTER TABLE "Old" DROP COLUMN "gone";' };
  isUnexpected(decide(bad.sql, [...pending, bad]), /DESTRUCTIVE/);
  const sneaky = { name: '2026-12-02-only-additive-part.sql', sql: 'CREATE TABLE "N2" ("id" TEXT NOT NULL);\nDROP TABLE "Old2";' };
  isUnexpected(decide('CREATE TABLE "N2" ("id" TEXT NOT NULL);', [...pending, sneaky]), /MATCHES ONLY AN INELIGIBLE FILE.*only-additive-part/);
});

ok('two pending files with the same statements are ambiguous: stop', () => {
  const dup = { name: '2026-12-03-copy-of-p8.sql', sql: p8.sql };
  isUnexpected(decide(p8.sql, [...pending, dup]), /more than one set/);
});

ok('an empty diff is "empty" (Prisma prints a comment for it)', () => {
  assert.deepStrictEqual(decide('', pending), { kind: 'empty' });
  assert.deepStrictEqual(decide('-- This is an empty migration.\n', pending), { kind: 'empty' });
  assert.deepStrictEqual(decide('\n  ;\n;  -- x\n', pending), { kind: 'empty' });
});

ok('text it cannot split safely is unexpected', () => {
  isUnexpected(decide('CREATE FUNCTION f() RETURNS void AS $$ BEGIN DROP TABLE "User"; END $$ LANGUAGE plpgsql;', pending), /dollar-quoted/);
  isUnexpected(decide('CREATE TABLE "X" ("a" TEXT DEFAULT \'unterminated);', pending), /unterminated/);
  isUnexpected(decide('/* never closed', pending), /unterminated/);
});

ok('a dependency cycle has no order', () => {
  const a = { name: 'a', creates: new Set(['A']), needs: new Set(['B']) };
  const b = { name: 'b', creates: new Set(['B']), needs: new Set(['A']) };
  assert.strictEqual(dependencyOrder([a, b]), null);
  assert.deepStrictEqual(dependencyOrder([b, { ...a, needs: new Set<string>() }]), ['a', 'b']);
});

ok('rollback lines: tables, added columns and enums, newest first; the guard never runs them', () => {
  assert.deepStrictEqual(rollbackFor(p6.sql), [
    'DROP TABLE "ReadinessCheckIn";',
    'ALTER TABLE "GuardianConsent" DROP COLUMN "selfRequested";',
    'ALTER TABLE "GuardianConsent" DROP COLUMN "acceptedById";',
    'ALTER TABLE "ClientSession" DROP COLUMN "cooldownDoneAt";',
    'ALTER TABLE "Session" DROP COLUMN "kind";',
    'DROP TYPE "SessionKind";',
  ]);
  assert.deepStrictEqual(rollbackFor(file('message-read-markers').sql), ['ALTER TABLE "ProgramMessage" DROP COLUMN "readAt";']);
  for (const f of pending) assert.ok(rollbackFor(f.sql).length > 0, `${f.name} has no rollback`);
});

ok('redact removes every part of the URL from public output', () => {
  const url = 'postgresql://fel_admin:s3cr%40t@34.12.56.78:5432/feldb?sslmode=require';
  const err = "Error: P1001: Can't reach database server at `34.12.56.78:5432` for user fel_admin on feldb with s3cr@t";
  const out = redact(`${err}\n${url}`, url);
  for (const leak of ['34.12.56.78', 'fel_admin', 'feldb', 's3cr', url]) assert.ok(!out.includes(leak), `leaked ${leak}: ${out}`);
  assert.match(out, /P1001/);
  assert.strictEqual(redact('nothing to hide', undefined), 'nothing to hide');
});

console.log('sql-guard: the coordinator\'s verdict');

const sha = 'a'.repeat(40);
const facts = { targetSha: sha, headSha: sha, conclusion: 'success', steps: {} as Record<string, string>, prismaChanged: true };

ok('GO only when the run verified production on the very commit main will move to', () => {
  assert.strictEqual(releaseVerdict({ ...facts, steps: { [STEP_VERIFIED]: 'success' } }).go, true);
  assert.strictEqual(releaseVerdict({ ...facts, headSha: 'b'.repeat(40), steps: { [STEP_VERIFIED]: 'success' } }).go, false);
  assert.strictEqual(releaseVerdict({ ...facts, conclusion: 'failure', steps: { [STEP_VERIFIED]: 'success' } }).go, false);
  assert.strictEqual(releaseVerdict({ ...facts, steps: { [STEP_VERIFIED]: 'skipped' } }).go, false);
});

ok('no secret yet: STOP when the release touches prisma/, GO with a warning when it does not', () => {
  assert.strictEqual(releaseVerdict({ ...facts, steps: { [STEP_NO_SECRET]: 'success' } }).go, false);
  const v = releaseVerdict({ ...facts, prismaChanged: false, steps: { [STEP_NO_SECRET]: 'success' } });
  assert.ok(v.go && v.warning);
});

ok('db-guard not dispatchable yet (not on main): the same fallback as no secret', () => {
  assert.strictEqual(releaseVerdict({ unavailable: 'workflow not found on the default branch', prismaChanged: true }).go, false);
  const v = releaseVerdict({ unavailable: 'workflow not found on the default branch', prismaChanged: false });
  assert.ok(v.go && v.warning && /not found/.test(v.warning));
});

console.log('sql-guard: the workflow');

const workflow = fs.readFileSync(path.join(APP, '..', '.github', 'workflows', 'db-guard.yml'), 'utf8');
const ci = fs.readFileSync(path.join(APP, '..', '.github', 'workflows', 'ci.yml'), 'utf8');

ok('db-guard.yml has the step names the coordinator reads', () => {
  assert.ok(workflow.includes(`name: '${STEP_VERIFIED}'`), STEP_VERIFIED);
  assert.ok(workflow.includes(`name: '${STEP_NO_SECRET}'`), STEP_NO_SECRET);
});

ok('db-guard.yml: dispatch + main pushes under prisma/ only, one run at a time, least privilege, pinned actions', () => {
  assert.match(workflow, /^on:\n {2}workflow_dispatch:/m);
  assert.match(workflow, /^ {2}push:\n {4}branches: \[main\]\n {4}paths: \['FEL-full-app\/prisma\/\*\*'\]/m);
  assert.ok(!/pull_request/.test(workflow.replace(/^#.*$/gm, '')), 'no pull_request trigger: a PR must never reach the production secret');
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /^concurrency:\n {2}group: db-guard-production\n {2}cancel-in-progress: false$/m);
  const uses = workflow.match(/uses: \S+/g) ?? [];
  assert.ok(uses.length >= 2);
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${u} is not pinned to a commit`);
  assert.ok(!/db push|migrate deploy|migrate dev|migrate reset|--accept-data-loss/.test(workflow.replace(/^\s*#.*$/gm, '')), 'only migrate diff and db execute');
  assert.match(workflow, /db execute --url "\$PROD_DIRECT_URL" --file "prisma\/pending\/\$f"/);});

ok('db-guard.yml: the secret sits behind the production-db environment, and only main / lane/finish-release run', () => {
  assert.match(workflow, /^ {4}environment: production-db$/m);
  assert.match(workflow, /refs\/heads\/main\|refs\/heads\/lane\/finish-release\) ;;\n\s+\*\) echo "::error[^\n]*"; exit 1;;/);
  const secretStep = workflow.indexOf("name: secret present?");
  assert.ok(secretStep > 0 && workflow.indexOf('refs/heads/main|', secretStep) < workflow.indexOf('PROD_DIRECT_URL}" ]', secretStep),
    'the ref check comes before the secret is looked at');
});

ok('ci.yml never sees the production secret', () => {
  assert.ok(!ci.includes('PROD_DIRECT_URL'));
});

console.log(`\nsql-guard: ${pass} checks passed`);
