#!/usr/bin/env -S npx tsx
/**
 * scripts/pending-sql-tests.ts — the pending-SQL planner (scripts/pending-sql/pendingSql.ts) and the shape of its command
 * line (scripts/pending-sql/cli.ts). Offline: the fixtures are the REAL files in prisma/pending/ and catalogs built here.
 *
 * What was measured against a real database (Postgres 16, local throwaway, 2026-11-10) and cannot run here is written
 * down in docs/PENDING-SQL.md §3: 36 files applied in this module's order on an "old production" copy, a second run
 * changed nothing, and `prisma migrate diff` then held no CREATE or ADD line.
 *
 * Run: npx tsx scripts/pending-sql-tests.ts
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { formatPlan, maskStrings, objectsOf, plan, stateOf, stripComments, type Catalog, type FileState } from './pending-sql/pendingSql';

const APP = path.join(__dirname, '..');
const DIR = path.join(APP, 'prisma', 'pending');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort().map((name) => ({ name, sql: fs.readFileSync(path.join(DIR, name), 'utf8') }));
const sqlOf = (stem: string) => { const f = files.find((x) => x.name.includes(stem)); assert.ok(f, `fixture prisma/pending/*${stem}* is gone; point this test at another real pending file`); return f; };

let pass = 0;
const ok = (name: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${name}`); };

const cat = (o: Partial<Record<keyof Catalog, string[]>> = {}): Catalog => ({ tables: new Set(o.tables), columns: new Set(o.columns), types: new Set(o.types), indexes: new Set(o.indexes), constraints: new Set(o.constraints) });
/** The catalog after every file in `names` has been applied on top of `base`. */
function catalogWith(base: Catalog, names: string[]): Catalog {
  const c = { tables: new Set(base.tables), columns: new Set(base.columns), types: new Set(base.types), indexes: new Set(base.indexes), constraints: new Set(base.constraints) };
  for (const n of names) {
    const o = objectsOf(sqlOf(n).sql);
    o.tables.forEach((t) => c.tables.add(t)); o.columns.forEach(([t, col]) => c.columns.add(`${t}.${col}`)); o.types.forEach((t) => c.types.add(t));
    o.indexes.forEach((i) => c.indexes.add(i)); o.constraints.forEach(([t, k]) => c.constraints.add(`${t}.${k}`));
  }
  return c;
}
const all = files.map((f) => ({ ...f, o: objectsOf(f.sql) }));
const createdSomewhere = new Set(all.flatMap((f) => f.o.tables));
/** The tables production had before any pending file: everything a file needs that no pending file creates. */
const BASELINE = cat({ tables: [...new Set(all.flatMap((f) => f.o.needs))].filter((t) => !createdSomewhere.has(t)) });
const states = (c: Catalog): FileState[] => files.map((f) => stateOf(f.name, f.sql, c));
const MANUAL = ['2026-10-19-guest-token-hash-1-add.sql', '2026-10-19-guest-token-hash-2-clear-raw.sql'];

console.log('reading the files');
ok('comments are not SQL: a commented-out CREATE or UPDATE is not counted', () => {
  const o = objectsOf(`-- CREATE TABLE "Ghost" (id int);\n/* UPDATE "User" SET x = 1; */\nCREATE TABLE "Real" ("note" TEXT DEFAULT '-- not a comment; UPDATE');\n`);
  assert.deepStrictEqual(o.tables, ['Real']); assert.deepStrictEqual(o.notAdditive, []);
  assert.ok(stripComments(`a '--kept' -- gone`).includes(`'--kept'`)); assert.ok(!stripComments(`a '--kept' -- gone`).includes('gone'));
  assert.strictEqual(maskStrings(`x 'a; UPDATE ''q''' y`), `x '' y`);
});
ok('every real file is read: it creates something, or it is one of the two data migrations', () => {
  assert.ok(files.length >= 38, `prisma/pending/ holds ${files.length} files; this suite was written against 38`);
  for (const f of all) {
    if (MANUAL.includes(f.name)) continue;   // the second guest-token file only rewrites rows: it creates nothing
    const n = f.o.tables.length + f.o.columns.length + f.o.types.length + f.o.indexes.length + f.o.constraints.length;
    assert.ok(n > 0, `${f.name}: nothing found that it creates`);
  }
});
ok('the two guest-token files change rows, so they are manual: listed, never applied', () => {
  assert.deepStrictEqual(all.filter((f) => f.o.notAdditive.length).map((f) => f.name), MANUAL);
  for (const s of states(BASELINE).filter((x) => MANUAL.includes(x.name))) assert.strictEqual(s.status, 'manual');
  assert.ok(plan(states(BASELINE), BASELINE).filter((p) => MANUAL.includes(p.name)).every((p) => p.action === 'skip' && /manual: not additive/.test(p.why)));
});
ok('a statement that removes or rewrites is never additive', () => {
  for (const bad of ['DROP TABLE "X";', 'ALTER TABLE "X" DROP COLUMN "y";', 'ALTER TABLE "X" RENAME TO "Z";', 'ALTER TABLE "X" ALTER COLUMN "y" TYPE TEXT;', 'DELETE FROM "X";', 'TRUNCATE "X";', 'INSERT INTO "X" VALUES (1);', 'GRANT ALL ON "X" TO anon;', 'DO $$ BEGIN DELETE FROM "X"; END $$;']) {
    assert.ok(objectsOf(`CREATE TABLE IF NOT EXISTS "X" (id int);\n${bad}\n`).notAdditive.length > 0, bad);
  }
  for (const fine of ['ALTER TABLE "X" ADD COLUMN "y" TEXT;', 'ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;', 'REVOKE ALL ON "X" FROM anon;', 'COMMENT ON TABLE "X" IS \'drop it later\';', 'CREATE INDEX "X_i" ON "X"("id");']) {
    assert.deepStrictEqual(objectsOf(`CREATE TABLE "X" (id int);\n${fine}\n`).notAdditive, [], fine);
  }
});
ok('the hardened files (teacher, hoops-cam) are re-runnable; a plain CREATE TABLE file is not', () => {
  assert.strictEqual(objectsOf(sqlOf('teacher').sql).rerunnable, true);
  assert.strictEqual(objectsOf(sqlOf('hoops-cam').sql).rerunnable, true);
  assert.strictEqual(objectsOf(sqlOf('party-report').sql).rerunnable, false);
  assert.strictEqual(objectsOf('CREATE TABLE IF NOT EXISTS "A" (id int);\nALTER TABLE "A" ADD CONSTRAINT "A_fk" FOREIGN KEY (id) REFERENCES "B"(id);\n').rerunnable, false, 'a bare ADD CONSTRAINT fails on a second run');
});
ok('the teacher file: its three tables, its foreign keys inside DO blocks, and that it needs User', () => {
  const o = objectsOf(sqlOf('teacher').sql);
  assert.deepStrictEqual(o.tables.slice().sort(), ['TeachCourse', 'TeacherApplication', 'TeacherRole']);
  assert.ok(o.constraints.some(([t, c]) => t === 'TeachCourse' && /_fkey$/.test(c)));
  assert.ok(o.needs.includes('User'));
});

console.log('a file against a catalog');
ok('missing, applied and partial', () => {
  const f = sqlOf('party-report');
  assert.strictEqual(stateOf(f.name, f.sql, BASELINE).status, 'missing');
  const full = catalogWith(BASELINE, ['party-report']);
  assert.deepStrictEqual(stateOf(f.name, f.sql, full).lacks, []); assert.strictEqual(stateOf(f.name, f.sql, full).status, 'applied');
  const o = objectsOf(f.sql);
  const partial = cat({ tables: [...full.tables], indexes: [...full.indexes].filter((i) => i !== o.indexes[0]), constraints: [...full.constraints] });
  const st = stateOf(f.name, f.sql, partial);
  assert.strictEqual(st.status, 'partial'); assert.deepStrictEqual(st.lacks, [`index ${o.indexes[0]}`]);
});
ok('a column added to an existing table is checked as table.column', () => {
  const f = sqlOf('message-read-markers');
  assert.deepStrictEqual(objectsOf(f.sql).columns, [['ProgramMessage', 'readAt']]);
  assert.strictEqual(stateOf(f.name, f.sql, cat({ tables: ['ProgramMessage'] })).status, 'missing');
  assert.strictEqual(stateOf(f.name, f.sql, cat({ tables: ['ProgramMessage'], columns: ['ProgramMessage.readAt'] })).status, 'applied');
});

console.log('the plan');
const additive = files.map((f) => f.name).filter((n) => !MANUAL.includes(n));
ok('on a database with none of them: every additive file is applied, none is held back, and each one needs only what is already there', () => {
  const steps = plan(states(BASELINE), BASELINE);
  const apply = steps.filter((s) => s.action === 'apply').map((s) => s.name);
  assert.deepStrictEqual(apply.slice().sort(), additive);
  assert.deepStrictEqual(steps.filter((s) => s.action === 'stop'), []);
  const have = new Set(BASELINE.tables);
  for (const n of apply) {
    const o = objectsOf(sqlOf(n).sql);
    for (const need of o.needs) assert.ok(have.has(need), `${n} is planned before the file that creates ${need}`);
    o.tables.forEach((t) => have.add(t));
  }
});
ok('the coach store goes instructor, booking, call signal (the runbook\'s order, not the alphabet\'s)', () => {
  const apply = plan(states(BASELINE), BASELINE).filter((s) => s.action === 'apply').map((s) => s.name);
  const at = (stem: string) => apply.findIndex((n) => n.includes(stem));
  assert.ok(at('coach-store-instructor') < at('coach-store-booking') && at('coach-store-booking') < at('coach-store-call-signal'));
});
ok('on a database that has them all: nothing to apply', () => {
  const full = catalogWith(BASELINE, additive);
  const steps = plan(states(full), full);
  assert.deepStrictEqual(steps.filter((s) => s.action !== 'skip'), []);
  assert.match(formatPlan(steps), /^pending SQL: 0 to apply, 0 held back, \d+ skipped/);
});
ok('a schema-current database (db push) still needs only the raw-SQL files', () => {
  const schemaBacked = ['mirror-coach-p5', 'mirror-coach-p6', 'mirror-coach-p7', 'mirror-coach-p8', 'economy-caps', 'adult-optin', 'coach-store-instructor', 'coach-store-booking', 'coach-store-call-signal', 'coach-store-program-access', 'coach-store-referral', 'adventure-save', 'message-read-markers', 'coach-availability', 'rate-limits'];
  const c = catalogWith(BASELINE, schemaBacked);
  const apply = plan(states(c), c).filter((s) => s.action === 'apply').map((s) => s.name);
  for (const stem of ['teacher', 'hoops-cam', 'group-booking', 'program-ask', 'studio-share']) assert.ok(apply.some((n) => n.includes(stem)), `${stem} should be planned`);
  assert.ok(!apply.some((n) => schemaBacked.some((s) => n.includes(s))));
});
ok('partly applied: a re-runnable file is applied, any other STOPS with what it has and what it lacks', () => {
  const full = catalogWith(BASELINE, additive);
  const lose = (c: Catalog, what: { table?: string; index?: string }): Catalog => cat({ tables: [...c.tables].filter((t) => t !== what.table), columns: [...c.columns], types: [...c.types], indexes: [...c.indexes].filter((i) => i !== what.index), constraints: [...c.constraints] });
  const a = lose(full, { table: 'TeachCourse' });
  const teacher = plan(states(a), a).find((s) => s.name.includes('teacher'))!;
  assert.strictEqual(teacher.action, 'apply'); assert.match(teacher.why, /re-runnable; lacks table TeachCourse/);
  const idx = objectsOf(sqlOf('party-report').sql).indexes[0];
  const b = lose(full, { index: idx });
  const party = plan(states(b), b).find((s) => s.name.includes('party-report'))!;
  assert.strictEqual(party.action, 'stop'); assert.match(party.why, /partly applied and not re-runnable: has table PartyReport/); assert.ok(party.why.includes(`lacks index ${idx}`));
});
ok('a file whose table nobody provides is held back, with the table named', () => {
  const st = [stateOf('z.sql', 'CREATE TABLE "Child" (id int, "p" int REFERENCES "Nowhere"(id));', cat())];
  assert.deepStrictEqual(plan(st, cat()), [{ name: 'z.sql', action: 'stop', why: 'needs Nowhere (no pending file creates it)' }]);
});
ok('--only: the others are skipped, and a selected file that needs a skipped one is held back', () => {
  const only = new Set(files.filter((f) => f.name.includes('coach-store-booking')).map((f) => f.name));
  const steps = plan(states(BASELINE), BASELINE, only);
  assert.deepStrictEqual(steps.filter((s) => s.action === 'apply'), []);
  const booking = steps.find((s) => s.name.includes('coach-store-booking'))!;
  assert.strictEqual(booking.action, 'stop'); assert.match(booking.why, /needs Instructor \(from 2026-10-04-coach-store-instructor\.sql\)/);
  const two = new Set(files.filter((f) => /teacher|hoops-cam/.test(f.name)).map((f) => f.name));
  assert.deepStrictEqual(plan(states(BASELINE), BASELINE, two).filter((s) => s.action === 'apply').map((s) => s.name).sort(), [...two].sort());
});

console.log('the command line');
const cli = fs.readFileSync(path.join(APP, 'scripts', 'pending-sql', 'cli.ts'), 'utf8');
ok('the database URL comes from the environment and reaches the child through its environment, never argv; it is never printed', () => {
  assert.match(cli, /const url = process\.env\[envName\]/);
  assert.match(cli, /env: \{ \.\.\.process\.env, DATABASE_URL: url, DIRECT_URL: url \}/);
  assert.ok(!/'--url'/.test(cli), 'no --url argument: it would put the secret in the process list');
  // the value itself (`${url}`, or `url` as an argument) never reaches a console call; "--url-env" in the usage text is a name
  assert.ok(!/console\.(log|error)\([^;]*(\$\{url\}|[(,]\s*url\b)/.test(cli.replace(/redact\([^)]*\)/g, 'REDACTED')), 'the URL is never logged');
  assert.ok(/console\.(log|error)\([^;]*(\$\{url\}|[(,]\s*url\b)/.test('console.log(`db ${url}`);') && /console\.(log|error)\([^;]*(\$\{url\}|[(,]\s*url\b)/.test('console.error("x", url);'), 'control: the check does catch a logged URL');
});
ok('plan returns before anything is spawned; apply re-reads the catalog after every file and stops unless it is now applied', () => {
  const planReturn = cli.indexOf("if (mode === 'plan')"), spawn = cli.indexOf('spawnSync(');
  assert.ok(planReturn > 0 && spawn > planReturn);
  assert.match(cli, /if \(now\.status !== 'applied'\) \{[\s\S]*?return 1;/);
  assert.match(cli, /if \(r\.status !== 0\) \{[\s\S]*?return 1;/);
});

console.log(`\npending-sql: ${pass} checks passed`);
