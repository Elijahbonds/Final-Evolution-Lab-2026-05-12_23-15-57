// TEEN-WRITE-BLOCK (2026-09-29): every place under app/api and lib that WRITES movement numbers — WorkoutScan,
// MirrorSession, PrqEntry, AthleteBuild (its prq snapshot), CampSession (its prqDelta/movementDelta) — is in GAP 1's
// table (lib/privacy/scanSaveGate.ts SCAN_SAVE_ROUTES, gated or routed) or on the NOT-MOVEMENT list below with a reason.
// A new write route fails this test until somebody decides which it is. Static, like lib/api/routeContract.test.ts.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCAN_SAVE_ROUTES } from './scanSaveGate';

const ROOT = join(__dirname, '../..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const WRITE = '(?:create|createMany|update|updateMany|upsert)';
const DETECTORS: { what: string; re: RegExp }[] = [
  { what: 'WorkoutScan', re: new RegExp(`\\bworkoutScan\\s*\\.\\s*${WRITE}\\b`) },
  { what: 'MirrorSession', re: new RegExp(`\\bmirrorSession\\s*\\.\\s*${WRITE}\\b`) },
  { what: 'AthleteBuild (prq)', re: new RegExp(`\\bathleteBuild\\s*\\.\\s*${WRITE}\\b`) },
  { what: 'CampSession (deltas)', re: new RegExp(`\\bcampSession\\s*\\.\\s*${WRITE}\\b`) },
  { what: 'PrqEntry', re: new RegExp(`\\bprqEntry\\s*\\.\\s*${WRITE}\\b|\\bcreatePrqEntry\\s*\\(|\\bwriteFormPlan\\s*\\(|\\bwriteForm\\s*\\(`) },
  { what: 'raw SQL', re: /INSERT\s+INTO\s+"?(?:WorkoutScan|PrqEntry|MirrorSession|AthleteBuild|CampSession)\b|UPDATE\s+"?(?:WorkoutScan|PrqEntry|MirrorSession|AthleteBuild|CampSession)\b/i },
];

/** Writers that are not movement data, each with the reason (GAP 1 names what is pose-derived and what is not). */
const NOT_MOVEMENT: Record<string, string> = {
  'app/api/prq/entries/route.ts': "manual PrqEntry rows (source 'manual', typed by the athlete): GAP 1 says not pose-derived",
  'lib/prq-entries.ts': 'the generic PrqEntry writer (createPrqEntry). Each CALLER is classified by its source: the camera callers are 1d (assessment) and 1f (sessions form, via lib/move/formWrite.ts); the manual route and the sessions drillResult are not movement',
};
/** app/api/sessions/route.ts (1f) also writes the drillResult PrqEntry (GAP 1: not pose-derived); only its `form` write is movement. */

const files = [...walk(join(ROOT, 'app/api')), ...walk(join(ROOT, 'lib'))].map((f) => relative(ROOT, f).split('\\').join('/'));
const writers = files
  .map((f) => ({ file: f, what: DETECTORS.filter((d) => d.re.test(readFileSync(join(ROOT, f), 'utf8'))).map((d) => d.what) }))
  .filter((w) => w.what.length > 0);
const covered = new Set(SCAN_SAVE_ROUTES.flatMap((r) => [r.file, ...(r.via ?? [])]));

describe('every movement write site is gated, routed, or named as not movement', () => {
  it('control: the detectors see the writers that exist, and a synthetic new one', () => {
    const found = writers.map((w) => w.file);
    for (const known of ['app/api/mirror/dunks/route.ts', 'app/api/mirror/sessions/route.ts', 'app/api/mirror/assessment/route.ts', 'lib/move/formWrite.ts', 'app/api/v1/camp/sessions/route.ts', 'app/api/v1/creator/athlete/route.ts']) {
      expect(found, known).toContain(known);
    }
    const synthetic = 'await prisma.workoutScan.create({ data: { userId, kind: "jump", metrics } })';
    expect(DETECTORS.some((d) => d.re.test(synthetic))).toBe(true);
    expect(DETECTORS.some((d) => d.re.test('await tx.prqEntry.createMany({ data })'))).toBe(true);
    expect(DETECTORS.some((d) => d.re.test('await prisma.workoutScan.findMany({ where })'))).toBe(false);
  });

  it('no write site is uncovered (app/dev and tests excluded)', () => {
    const uncovered = writers
      .filter((w) => !w.file.startsWith('app/dev/') && !covered.has(w.file) && !(w.file in NOT_MOVEMENT))
      .map((w) => `${w.file} (${w.what.join(', ')})`);
    expect(uncovered).toEqual([]);
  });

  it('the lists are not stale: every table file and every NOT-MOVEMENT file still writes', () => {
    const found = new Set(writers.map((w) => w.file));
    for (const f of [...covered, ...Object.keys(NOT_MOVEMENT)]) expect(found.has(f), f).toBe(true);
  });

  it('every GATED route imports canSaveScanNumbers and calls it; a routed one is still in the table with its holder', () => {
    for (const r of SCAN_SAVE_ROUTES) {
      const src = readFileSync(join(ROOT, r.file), 'utf8');
      if (r.status === 'gated') {
        expect(src, r.file).toMatch(/import \{[^}]*\bcanSaveScanNumbers\b[^}]*\} from '@\/lib\/privacy\/scanSaveGate'/);
        expect(src, r.file).toMatch(/canSaveScanNumbers\(prisma, /);
      } else {
        expect(r.holder, r.id).toBeTruthy();
      }
    }
  });

  it('the table tells the truth the other way too: a row whose file calls canSaveScanNumbers is marked gated', () => {
    // TEEN-WRITE-BLOCK-2 (FE PM 23:05 PT): every row is gated now (1a, 1b, 1d, 1e, 1f and 1g joined 1c and 1h)
    for (const r of SCAN_SAVE_ROUTES) {
      const calls = /canSaveScanNumbers\(prisma, /.test(readFileSync(join(ROOT, r.file), 'utf8'));
      expect(r.status === 'gated', `${r.id} ${r.file}`).toBe(calls);
    }
  });
});
