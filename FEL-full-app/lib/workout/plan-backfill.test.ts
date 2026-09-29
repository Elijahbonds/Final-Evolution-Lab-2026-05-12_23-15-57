import { describe, expect, it, vi } from 'vitest';
import { PILLAR_LABELS, analyzeMovement, defaultMetrics, type Pillar } from './movement-screen';
import { EARLY_WEEKS, PLAN_POOLS, generatePlan, isDepthDrop, legacyWeeks, type PlanExercise, type PlanWeek } from './plan-generator';
import {
  HELD_FOR_PROTOCOL, PLAN_REVISED_NOTE, PLAN_REVISED_NOTE_YOUTH, PLAN_REVISION, PLAN_REVISION_ALL_WEEKS, PLAN_REVISION_YOUTH,
  isPlyometric, planAudience, planRevisionNote, reviseForYouth, revisePlan, revisePlanForStorage, revisePlansOnRead, undoYouthRevision,
} from './plan-revision';
import {
  DEFAULT_PAGE_SIZE, ageBand, backfillClean, backfillWorkoutPlans, describeDatabaseUrl, formatBackfillReport, parseBackfillArgs,
} from './plan-backfill';
import { RELAUNCH_FREE_LINE } from './plan-sale';

// MIRROR-COACH P2 (2026-09-25), owner decision #22: every depth drop in every week of every past /workout plan swapped,
// with the in-app note, INCLUDING the plans nobody has opened — a backfill over every WorkoutPlan row, dry run first.
// The database is offline in this lane, so it runs here against a stand-in table that behaves like Prisma's for the
// calls it makes (findMany with where/orderBy/take/select, updateMany) and records every call.

const NOW = new Date('2026-09-25T12:00:00Z');
const PILLARS: Pillar[] = ['power', 'mobility', 'symmetry', 'stability', 'cadence', 'posture'];
const TIERS = ['plan_4w', 'program_12w'] as const;
const USERS: Record<string, number | null> = { adult: 1990, minor: 2011, unknown: null, turning18: 2008 };

type Row = { id: string; userId: string; tier: string; focus: string; weeks: unknown; createdAt: Date };

/** P1's stored adult shape (deployed 2026-09-25): weeks 1-4 swapped to the Trap-Bar Jump, later depth drops held. */
function p1Adult(weeks: PlanWeek[]): PlanWeek[] {
  return JSON.parse(JSON.stringify(weeks.map((w) => (!w.days.some((d) => d.exercises.some(isDepthDrop)) ? w : {
    ...w, revision: PLAN_REVISION,
    days: w.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => (!isDepthDrop(e) ? e
      : w.week <= EARLY_WEEKS ? { ...PLAN_POOLS.power[1], replaced: e.name } : { ...e, held: HELD_FOR_PROTOCOL })) })),
  }))));
}

/**
 * The table: the 12 stored plan shapes for an adult, a minor and an owner with no birth year (36 rows), one plan P1
 * already revised for the adult, one already clean, one of a shape nobody knows, and one for an owner born 18 years
 * back (a minor by planAudience's safe rule). Ids sort in the order made.
 */
function table(): Row[] {
  const rows: Row[] = [];
  let n = 0;
  const add = (userId: string, tier: string, focus: string, weeks: unknown) =>
    rows.push({ id: `plan${String(n++).padStart(3, '0')}`, userId, tier, focus, weeks, createdAt: new Date(Date.UTC(2026, 7, 1)) });
  for (const who of ['adult', 'minor', 'unknown']) for (const tier of TIERS) for (const f of PILLARS) add(who, tier, PILLAR_LABELS[f], legacyWeeks(f, tier));
  add('adult', 'program_12w', PILLAR_LABELS.power, p1Adult(legacyWeeks('power', 'program_12w')));
  add('adult', 'plan_4w', PILLAR_LABELS.mobility, JSON.parse(JSON.stringify(generatePlan(analyzeMovement(defaultMetrics()), 'plan_4w').weeks)));
  add('unknown', 'plan_4w', '', null);
  add('turning18', 'plan_4w', PILLAR_LABELS.cadence, legacyWeeks('cadence', 'plan_4w'));
  return rows;
}

/** A stand-in for prisma.workoutPlan with the owners' birth years joined, recording every call. */
function fakeDb(rows: Row[], opts: { throwOn?: string; missOn?: string } = {}) {
  const reads: { where: unknown; take: number; ids: string[] }[] = [];
  const writes: { where: { id: string; userId: string }; data: Record<string, unknown> }[] = [];
  const db = {
    workoutPlan: {
      findMany: vi.fn(async (args: { where: { id?: { gt: string } }; orderBy: { id: 'asc' }; take: number; select: Record<string, unknown> }) => {
        expect(args.orderBy).toEqual({ id: 'asc' });
        expect(args.select).toEqual({ id: true, userId: true, focus: true, weeks: true, user: { select: { dobYear: true } } });
        const gt = args.where.id?.gt;
        const page = rows.filter((r) => gt === undefined || r.id > gt).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, args.take)
          .map((r) => ({ id: r.id, userId: r.userId, focus: r.focus, weeks: JSON.parse(JSON.stringify(r.weeks)), user: { dobYear: USERS[r.userId] ?? null } }));
        reads.push({ where: args.where, take: args.take, ids: page.map((r) => r.id) });
        return page;
      }),
      updateMany: vi.fn(async (args: { where: { id: string; userId: string }; data: Record<string, unknown> }) => {
        writes.push(args);
        if (args.where.id === opts.throwOn) throw new Error('connection reset');
        if (args.where.id === opts.missOn) return { count: 0 };
        let count = 0;
        for (const r of rows) if (r.id === args.where.id && r.userId === args.where.userId) { r.weeks = JSON.parse(JSON.stringify(args.data.weeks)); count++; }
        return { count };
      }),
    },
  };
  return { db: db as never, reads, writes, rows };
}

const exercisesOf = (weeks: unknown): PlanExercise[] => (Array.isArray(weeks) ? (weeks as PlanWeek[]) : []).flatMap((w) => w.days.flatMap((d) => d.exercises));
const TOTAL = 40;            // 36 + P1's + clean + odd + turning 18
const CHANGED = 38;          // everything but the clean plan and the odd one

describe('the age band a plan is counted in (User.dobYear)', () => {
  it('adult, minor, or unknown — a birth year 18 years back is a minor, as planAudience rules; no year is unknown', () => {
    expect(ageBand(1990, NOW)).toBe('adult');
    expect(ageBand(2007, NOW)).toBe('adult');
    expect(ageBand(2008, NOW)).toBe('minor');
    expect(ageBand(2011, NOW)).toBe('minor');
    for (const v of [null, undefined, Number.NaN, 1800]) expect(ageBand(v as number | null, NOW), String(v)).toBe('unknown');
    // unknown is revised as youth (owner decision #20: blank = youth rules until answered), but counted on its own
    expect(planAudience(null, NOW)).toBe('youth');
  });
});

describe('the dry run (the default)', () => {
  it('reads every row and writes NOTHING: no update call, every row exactly as it was', async () => {
    const { db, writes, rows } = fakeDb(table());
    const before = JSON.parse(JSON.stringify(rows));
    const r = await backfillWorkoutPlans(db, { apply: parseBackfillArgs([]).apply, now: NOW });
    expect(r.mode).toBe('dry-run');
    expect(writes).toEqual([]);
    expect(JSON.parse(JSON.stringify(rows))).toEqual(before);
    expect(r.written).toBe(0);
    expect({ scanned: r.scanned, changed: r.changed }).toEqual({ scanned: TOTAL, changed: CHANGED });
    expect(formatBackfillReport(r)[0]).toMatch(/^DRY RUN — nothing is written/);
    expect(formatBackfillReport(r).at(-1)).toBe(`Re-run with --apply to write ${CHANGED} plan(s).`);
  });

  it('counts per focus and per age band — minors and unknown ages on their own lines', async () => {
    const { db } = fakeDb(table());
    const r = await backfillWorkoutPlans(db, { apply: false, now: NOW });
    expect(r.byBand).toEqual({
      adult: { plans: 14, changed: 13 },          // 12 stored shapes + P1's (changed) + the clean one (not)
      minor: { plans: 13, changed: 13 },          // 12 + the owner born 18 years back
      unknown: { plans: 13, changed: 12 },        // 12 + the odd one (not)
    });
    const L = PILLAR_LABELS;
    expect(r.byFocus).toEqual({
      [L.power]: { plans: 7, changed: 7 }, [L.mobility]: { plans: 7, changed: 6 }, [L.symmetry]: { plans: 6, changed: 6 },
      [L.stability]: { plans: 6, changed: 6 }, [L.cadence]: { plans: 7, changed: 7 }, [L.posture]: { plans: 6, changed: 6 },
      '(none)': { plans: 1, changed: 0 },
    });
    const text = formatBackfillReport(r).join('\n');
    expect(text).toMatch(/minor\s+plans\s+13\s+changed\s+13/);
    expect(text).toMatch(/unknown\s+plans\s+13\s+changed\s+12/);
    expect(text).toMatch(/per age band \(minor = birth year under 18; unknown = no birth year, READ as youth, stored as everyone's\)/);
  });

  it('counts the depth drops as stored (108 in the 36 stored shapes, 8 left in P1\'s) and none after', async () => {
    const { db } = fakeDb(table());
    const r = await backfillWorkoutPlans(db, { apply: false, now: NOW });
    expect(r.depthDropsBefore).toBe(36 * 3 + 8 + 1);                          // + the turning-18 owner's 4-week cadence plan
    expect(r.depthDropsAfter).toBe(0);
    expect(r.youthPlyometricsAfter).toBe(0);
  });
});

describe('--apply', () => {
  it('ALL 12 WEEKS: every week of an adult\'s 12-week power plan is revised, and the count covers weeks 1 to 12', async () => {
    const { db, rows } = fakeDb(table());
    const r = await backfillWorkoutPlans(db, { apply: true, now: NOW });
    expect(Object.keys(r.weeksRevisedByNumber).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const power12 = rows.find((x) => x.userId === 'adult' && x.tier === 'program_12w' && x.focus === PILLAR_LABELS.power)!;
    expect((power12.weeks as PlanWeek[]).map((w) => w.revision)).toEqual(Array(12).fill(PLAN_REVISION_ALL_WEEKS));
    const mob12 = rows.find((x) => x.userId === 'adult' && x.tier === 'program_12w' && x.focus === PILLAR_LABELS.mobility)!;
    expect((mob12.weeks as PlanWeek[]).filter((w) => w.revision).map((w) => w.week)).toEqual([1, 6, 11]);
  });

  it('writes every changed row once, weeks only, by its id AND its owner; leaves no depth drop in any row and SERVES no jump to a minor or unknown age', async () => {
    const { db, writes, rows } = fakeDb(table());
    const r = await backfillWorkoutPlans(db, { apply: true, now: NOW });
    expect({ written: r.written, failures: r.writeFailures, missed: r.writesMissed }).toEqual({ written: CHANGED, failures: 0, missed: 0 });
    expect(backfillClean(r)).toBe(true);
    expect(writes).toHaveLength(CHANGED);
    expect(new Set(writes.map((w) => w.where.id)).size).toBe(CHANGED);
    for (const w of writes) {
      expect(Object.keys(w.data)).toEqual(['weeks']);
      expect(w.where.userId).toBe(rows.find((x) => x.id === w.where.id)!.userId);
    }
    for (const row of rows) {
      expect(exercisesOf(row.weeks).filter(isDepthDrop), row.id).toEqual([]);
      expect(exercisesOf(row.weeks).filter((e) => e.held), row.id).toEqual([]);
      // P2 review (2026-09-26): the youth revision is not STORED (it could not be undone); it is what a youth owner reads
      if (row.userId !== 'adult') expect(exercisesOf(reviseForYouth(row.weeks).weeks).filter(isPlyometric), row.id).toEqual([]);
      expect((row.weeks as PlanWeek[] | null ?? []).some((w) => w.revision === PLAN_REVISION_YOUTH), row.id).toBe(false);
    }
  });

  it('stores exactly what the plan route would store, and the route serves each owner their view: the read finds nothing left to write', async () => {
    const original = table();
    const { db, rows } = fakeDb(table());
    await backfillWorkoutPlans(db, { apply: true, now: NOW });
    for (const [i, row] of rows.entries()) {
      expect(row.weeks, row.id).toEqual(revisePlanForStorage(original[i].weeks).weeks);
      const read = fakeDb([row]);
      const [served] = await revisePlansOnRead(read.db, row.userId, [{ ...row }], planAudience(USERS[row.userId], NOW));
      expect(read.writes, row.id).toEqual([]);
      expect(served.weeks, row.id).toEqual(revisePlan(original[i].weeks, planAudience(USERS[row.userId], NOW)).weeks);
    }
  });

  it('IDEMPOTENT: a second run changes 0 rows and writes 0; a dry run after it says the same', async () => {
    const { db, writes } = fakeDb(table());
    await backfillWorkoutPlans(db, { apply: true, now: NOW });
    const n = writes.length;
    const second = await backfillWorkoutPlans(db, { apply: true, now: NOW });
    expect({ changed: second.changed, written: second.written, weeksRevised: second.weeksRevised }).toEqual({ changed: 0, written: 0, weeksRevised: 0 });
    expect(writes).toHaveLength(n);
    expect(second.scanned).toBe(TOTAL);
    const dry = await backfillWorkoutPlans(db, { apply: false, now: NOW });
    expect(dry.changed).toBe(0);
    expect(formatBackfillReport(second).at(-1)).toBe('CLEAN: a second run should report changed 0.');
  });

  it('THE NOTE: every changed plan shows its owner one — the youth note for minors and unknown ages — with no refund and "when they ship"', async () => {
    const { db, rows } = fakeDb(table());
    const r = await backfillWorkoutPlans(db, { apply: true, now: NOW });
    expect(r.notes).toEqual({ [PLAN_REVISED_NOTE]: 13, [PLAN_REVISED_NOTE_YOUTH]: 25 });
    for (const row of rows) {
      const [served] = await revisePlansOnRead(fakeDb([row]).db, row.userId, [{ ...row }], planAudience(USERS[row.userId], NOW));
      const note = served.revisionNote;
      if (row.id === 'plan037' || row.id === 'plan038') { expect(note, row.id).toBeNull(); continue; }   // the clean and the odd one
      expect(note, row.id).toBe(row.userId === 'adult' ? PLAN_REVISED_NOTE : PLAN_REVISED_NOTE_YOUTH);
      expect(note).toContain(RELAUNCH_FREE_LINE);
      expect(note).not.toMatch(/refund/i);
      // what is at rest is everyone's revision: the adult note, never the youth mark (P2 review)
      expect(planRevisionNote(row.weeks), row.id).toBe(PLAN_REVISED_NOTE);
    }
  });

  // MIRROR-COACH P2 review (2026-09-26): the backfill STORED the youth revision for every owner with no birth year, and
  // nothing undid it. An owner who then answers an adult year must get the adult plan and the adult note back — whether
  // the youth revision was stored by P1's read path before the deploy or never.
  it('an unknown-age owner who answers an ADULT birth year reads the adult plan and the adult note — jumps and all', async () => {
    const t = table();
    const { db, rows } = fakeDb(t);
    await backfillWorkoutPlans(db, { apply: true, now: NOW });
    const power = rows.find((x) => x.userId === 'unknown' && x.tier === 'program_12w' && x.focus === PILLAR_LABELS.power)!;
    const [asUnknown] = await revisePlansOnRead(fakeDb([power]).db, 'unknown', [{ ...power }], planAudience(null, NOW));
    expect(exercisesOf(asUnknown.weeks).filter(isPlyometric)).toEqual([]);
    expect(asUnknown.revisionNote).toBe(PLAN_REVISED_NOTE_YOUTH);
    // …they answer 1990
    const [asAdult] = await revisePlansOnRead(fakeDb([power]).db, 'unknown', [{ ...power }], planAudience(1990, NOW));
    expect(exercisesOf(asAdult.weeks).filter(isPlyometric).length).toBe(30);          // what an adult-only revision keeps
    expect(exercisesOf(asAdult.weeks).filter(isDepthDrop)).toEqual([]);
    expect(asAdult.revisionNote).toBe(PLAN_REVISED_NOTE);
  });

  it('a youth revision P1\'s read path already STORED is undone: the row goes back to the adult-only revision, counted', async () => {
    const legacy = legacyWeeks('power', 'program_12w');
    const p1Youth = reviseForYouth(legacy).weeks;                        // what P1 stored for an owner with no birth year
    expect(exercisesOf(p1Youth).filter(isPlyometric)).toEqual([]);
    const rows: Row[] = [{ id: 'plan900', userId: 'unknown', tier: 'program_12w', focus: PILLAR_LABELS.power, weeks: p1Youth, createdAt: new Date(Date.UTC(2026, 7, 1)) }];
    const { db } = fakeDb(rows);
    const r = await backfillWorkoutPlans(db, { apply: true, now: NOW });
    expect({ changed: r.changed, written: r.written, youthRevisionsUndone: r.youthRevisionsUndone, youthPlyometricsAfter: r.youthPlyometricsAfter }).toEqual({ changed: 1, written: 1, youthRevisionsUndone: 1, youthPlyometricsAfter: 0 });
    expect(rows[0].weeks).toEqual(revisePlanForStorage(legacy).weeks);    // exactly as if P1 had never stored it
    expect(exercisesOf(rows[0].weeks).filter(isPlyometric).length).toBe(30);
    expect(undoYouthRevision(rows[0].weeks).changed).toBe(false);
    expect(formatBackfillReport(r).join('\n')).toMatch(/stored youth revisions undone: 1/);
  });

  it('a P1-revised plan loses its held depth drops and its repeated Trap-Bar Jump', async () => {
    const { db, rows } = fakeDb(table());
    await backfillWorkoutPlans(db, { apply: true, now: NOW });
    const p1 = rows.find((x) => x.id === 'plan036')!;
    expect(exercisesOf(p1.weeks).filter((e) => e.held)).toEqual([]);
    for (const w of p1.weeks as PlanWeek[]) {
      const names = w.days.flatMap((d) => d.exercises.map((e) => e.name));
      expect(new Set(names).size, `w${w.week}`).toBe(names.length);
    }
  });

  it('a failed write is counted and the walk goes on; the next run finishes it', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = table();
    const first = fakeDb(t, { throwOn: 'plan005' });
    const r = await backfillWorkoutPlans(first.db, { apply: true, now: NOW });
    expect({ written: r.written, writeFailures: r.writeFailures, problemIds: r.problemIds }).toEqual({ written: CHANGED - 1, writeFailures: 1, problemIds: ['plan005'] });
    expect(backfillClean(r)).toBe(false);
    expect(formatBackfillReport(r).at(-1)).toMatch(/^NOT CLEAN/);
    const again = await backfillWorkoutPlans(fakeDb(t).db, { apply: true, now: NOW });
    expect({ changed: again.changed, written: again.written }).toEqual({ changed: 1, written: 1 });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('a write that matches no row (deleted, or not that owner\'s, since the read) is counted as missed, not as written', async () => {
    const { db } = fakeDb(table(), { missOn: 'plan010' });
    const r = await backfillWorkoutPlans(db, { apply: true, now: NOW });
    expect({ written: r.written, writesMissed: r.writesMissed, problemIds: r.problemIds }).toEqual({ written: CHANGED - 1, writesMissed: 1, problemIds: ['plan010'] });
    expect(backfillClean(r)).toBe(false);
  });
});

describe('paging: every row, once, however many', () => {
  it('pages by id ascending with `id > last`: 40 rows at 7 a page is 6 pages, each row read once', async () => {
    const { db, reads } = fakeDb(table());
    const r = await backfillWorkoutPlans(db, { apply: false, pageSize: 7, now: NOW });
    expect(r.pages).toBe(6);
    expect(reads).toHaveLength(6);
    expect(reads[0].where).toEqual({});
    for (let i = 1; i < reads.length; i++) expect(reads[i].where).toEqual({ id: { gt: reads[i - 1].ids.at(-1) } });
    const ids = reads.flatMap((x) => x.ids);
    expect(ids).toHaveLength(TOTAL);
    expect(new Set(ids).size).toBe(TOTAL);
  });

  it('a last page that is exactly full asks once more and stops at the empty one; the default page is 200', async () => {
    const { db, reads } = fakeDb(table());
    const r = await backfillWorkoutPlans(db, { apply: true, pageSize: 10, now: NOW });
    expect(r.pages).toBe(4);
    expect(reads.map((x) => x.ids.length)).toEqual([10, 10, 10, 10, 0]);
    expect(r.written).toBe(CHANGED);                                          // writing mid-walk moves no row it has yet to read
    const d = fakeDb(table());
    await backfillWorkoutPlans(d.db, { apply: false, now: NOW });
    expect(d.reads[0].take).toBe(DEFAULT_PAGE_SIZE);
  });

  it('an empty table: 0 pages, nothing written, clean', async () => {
    const { db } = fakeDb([]);
    const r = await backfillWorkoutPlans(db, { apply: true, now: NOW });
    expect({ pages: r.pages, scanned: r.scanned, written: r.written }).toEqual({ pages: 0, scanned: 0, written: 0 });
    expect(backfillClean(r)).toBe(true);
  });
});

describe('the script\'s flags', () => {
  it('dry run unless --apply; --dry-run may be said; never both; anything else is refused', () => {
    expect(parseBackfillArgs([])).toEqual({ apply: false, pageSize: DEFAULT_PAGE_SIZE });
    expect(parseBackfillArgs(['--dry-run'])).toEqual({ apply: false, pageSize: DEFAULT_PAGE_SIZE });
    expect(parseBackfillArgs(['--apply'])).toEqual({ apply: true, pageSize: DEFAULT_PAGE_SIZE });
    expect(parseBackfillArgs(['--apply', '--page-size', '50'])).toEqual({ apply: true, pageSize: 50 });
    expect(parseBackfillArgs(['--page-size=1000'])).toEqual({ apply: false, pageSize: 1000 });
    expect(() => parseBackfillArgs(['--apply', '--dry-run'])).toThrow(/choose one/);
    for (const bad of [['--aply'], ['apply'], ['--page-size'], ['--page-size', '0'], ['--page-size=1001'], ['--page-size', '2.5']]) {
      expect(() => parseBackfillArgs(bad), bad.join(' ')).toThrow();
    }
  });

  it('names the target database as host and name, never the user or password', () => {
    const s = describeDatabaseUrl('postgresql://fel_user:s3cret@db.example.com:5432/fel?schema=public');
    expect(s).toBe('db.example.com:5432/fel');
    expect(s).not.toMatch(/s3cret|fel_user/);
    expect(describeDatabaseUrl(undefined)).toBe('(DATABASE_URL is not set)');
    expect(describeDatabaseUrl('not a url')).toBe('(DATABASE_URL is not a URL)');
  });
});
