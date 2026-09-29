import { describe, expect, it, vi } from 'vitest';
import { isDepthDrop, legacyWeeks } from '@/lib/workout/plan-generator';
import { reviseAllPlans, type ReviseAllPlansIo } from './revise-all-plans';

// MIRROR-COACH P2 (2026-09-25): scripts/workout/revise-all-plans.ts, the owner-decision-#22 backfill, run end to end on
// a stand-in table (the lane's database is offline, and the script never runs against one in this phase). Named
// .suite.test.ts because vitest.config.ts collects only `scripts/**/*.suite.test.ts` under scripts/ — a plain .test.ts
// here would be collected by nobody and pass silently forever. The counting, paging and idempotence are covered in
// lib/workout/plan-backfill.test.ts; this covers the script: dry run by default, the flags, the exit codes, and that a
// bad flag never opens the database.

type Row = { id: string; userId: string; focus: string; weeks: unknown };

function io(rows: Row[], dob: Record<string, number | null>, opts: { throwOn?: string } = {}) {
  const lines: string[] = [];
  const updates: string[] = [];
  const close = vi.fn(async () => {});
  const db = {
    workoutPlan: {
      findMany: vi.fn(async ({ where, take }: { where: { id?: { gt: string } }; take: number }) => rows
        .filter((r) => !where.id || r.id > where.id.gt).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, take)
        .map((r) => ({ ...r, weeks: JSON.parse(JSON.stringify(r.weeks)), user: { dobYear: dob[r.userId] ?? null } }))),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; userId: string }; data: { weeks: unknown } }) => {
        updates.push(where.id);
        if (where.id === opts.throwOn) throw new Error('connection reset');
        const r = rows.find((x) => x.id === where.id && x.userId === where.userId);
        if (r) r.weeks = JSON.parse(JSON.stringify(data.weeks));
        return { count: r ? 1 : 0 };
      }),
    },
  };
  const open = vi.fn(async () => ({ db: db as never, close }));
  const it: ReviseAllPlansIo = { open, log: (l) => lines.push(l), databaseUrl: 'postgresql://owner:pw-not-printed@db.example.com:5432/fel' };
  return { io: it, lines, updates, open, close, rows };
}

const table = (): Row[] => [
  { id: 'a', userId: 'adult', focus: 'Explosive Power', weeks: legacyWeeks('power', 'program_12w') },
  { id: 'b', userId: 'kid', focus: 'Mobility & Range', weeks: legacyWeeks('mobility', 'plan_4w') },
  { id: 'c', userId: 'noyear', focus: 'Mobility & Range', weeks: legacyWeeks('mobility', 'program_12w') },
];
const DOB = { adult: 1990, kid: 2012, noyear: null };
const drops = (rows: Row[]) => rows.reduce((n, r) => n + (r.weeks as { days: { exercises: { name: string }[] }[] }[])
  .reduce((k, w) => k + w.days.reduce((j, d) => j + d.exercises.filter(isDepthDrop).length, 0), 0), 0);

describe('scripts/workout/revise-all-plans.ts', () => {
  it('importing it runs nothing and opens no database (it runs only as the entry script)', () => {
    expect(process.argv[1]?.endsWith('revise-all-plans.ts')).toBe(false);
    expect(typeof reviseAllPlans).toBe('function');
  });

  it('with no flags it is a DRY RUN: it reads, prints the counts, writes nothing, closes, exits 0', async () => {
    const t = io(table(), DOB);
    const before = JSON.parse(JSON.stringify(t.rows));
    expect(await reviseAllPlans([], t.io)).toBe(0);
    expect(t.updates).toEqual([]);
    expect(t.rows).toEqual(before);
    expect(t.open).toHaveBeenCalledTimes(1);
    expect(t.close).toHaveBeenCalledTimes(1);
    expect(t.lines[0]).toBe('revise-all-plans: DRY RUN against db.example.com:5432/fel (page size 200)');
    expect(t.lines.join('\n')).not.toMatch(/pw-not-printed|owner:/);
    expect(t.lines.join('\n')).toMatch(/minor\s+plans\s+1\s+changed\s+1/);
    expect(t.lines.join('\n')).toMatch(/unknown\s+plans\s+1\s+changed\s+1/);
    expect(t.lines).toContain('Re-run with --apply to write 3 plan(s).');
    expect(JSON.parse(t.lines.at(-1)!)).toMatchObject({ mode: 'dry-run', scanned: 3, changed: 3, written: 0 });
  });

  it('--apply writes, exits 0, and a second --apply changes 0 rows', async () => {
    const t = io(table(), DOB);
    expect(drops(t.rows)).toBeGreaterThan(0);
    expect(await reviseAllPlans(['--apply'], t.io)).toBe(0);
    expect(t.updates.sort()).toEqual(['a', 'b', 'c']);
    expect(drops(t.rows)).toBe(0);
    t.lines.length = 0;
    expect(await reviseAllPlans(['--apply'], t.io)).toBe(0);
    expect(t.updates).toHaveLength(3);
    expect(JSON.parse(t.lines.at(-1)!)).toMatchObject({ mode: 'apply', changed: 0, written: 0 });
  });

  it('a bad flag exits 2 without opening the database', async () => {
    for (const argv of [['--aply'], ['--apply', '--dry-run'], ['--page-size', 'lots']]) {
      const t = io(table(), DOB);
      expect(await reviseAllPlans(argv, t.io), argv.join(' ')).toBe(2);
      expect(t.open).not.toHaveBeenCalled();
    }
  });

  it('a failed write exits 1 (not clean) and still closes the database', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = io(table(), DOB, { throwOn: 'b' });
    expect(await reviseAllPlans(['--apply', '--page-size', '2'], t.io)).toBe(1);
    expect(t.close).toHaveBeenCalledTimes(1);
    expect(t.lines.join('\n')).toMatch(/NOT CLEAN/);
    err.mockRestore();
  });
});
