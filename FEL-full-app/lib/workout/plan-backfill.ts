/**
 * lib/workout/plan-backfill.ts — every stored /workout plan revised, including the ones nobody has opened.
 *
 * MIRROR-COACH P2 (2026-09-25), owner decision #22 (painfree/DECISIONS-2.md): "SWAP EVERY DEPTH DROP IN EVERY WEEK for
 * everyone, with the in-app note, including plans nobody has opened (a database backfill, dry run first)". P1 revised a
 * plan only when its buyer opened /workout (revisePlansOnRead), so a plan nobody opened still held "Depth Drop to
 * Vertical" in the database — and it would until the day someone read it. This walks every WorkoutPlan row and stores
 * the SAME pure revision the read stores (plan-revision.ts revisePlanForStorage), so the row at rest is the one the
 * route would write.
 *
 * MIRROR-COACH P2 review (2026-09-26): what is STORED no longer depends on the owner's age. This first stored
 * revisePlan(weeks, planAudience(dobYear)) — the YOUTH revision for every owner with no birth year — and nothing undid
 * it: an adult who answered 1990 in the P5 intake kept a plan with every Trap-Bar Jump and Approach Bound gone and the
 * youth note, for good (measured: 0 jumps left, against the 12-30 an adult-only revision keeps). #22 requires only the
 * depth-drop revision, for everyone, so that is all that is stored; youth rules are applied when the plan is READ
 * (revisePlansOnRead), and a youth revision P1's read path already stored is undone here (undoYouthRevision).
 *
 *   - A DRY RUN unless `apply` is set: it reads, revises in memory and counts, and writes nothing.
 *   - Pages by id (`id > last`, ascending), so a write in the middle of the walk never moves a row it has yet to read,
 *     and the whole table is covered however large it is. There is no "newest 10" anywhere: every row.
 *   - Idempotent: the revision marks every week it changes, never revises a week it marked, and returns the very value
 *     it was given when there is nothing to do — so a second run counts 0 changed rows and writes 0.
 *   - Each write is the read path's write: `weeks` only, by the plan's id AND its owner's user id; tier and createdAt
 *     never move (dead-buys.ts matches a store charge to a plan by those two).
 *   - A failed write is counted and the walk goes on; running it again finishes the job (idempotent). A row the read
 *     path revised between this walk's read and its write gets the same weeks from both: the stored revision is
 *     deterministic and the same for every reader (true since the P2 review — it used to depend on the reader's age,
 *     and a read whose birth-year lookup failed stored the youth revision).
 *   - Counts per focus and per age band. The band is User.dobYear's: `adult`; `minor` (planAudience says youth for a
 *     birth year that is set — under 18, or 18 only this calendar year); `unknown` (no birth year). A minor or an
 *     unknown age READS the youth revision (owner decision #20: blank = youth rules until answered); the check that
 *     none of them is served a jump runs over that read, not over the stored row.
 *     assumption: a plan whose owner row is missing counts as unknown — WorkoutPlan.userId is a required relation with
 *     onDelete Cascade, so the schema says there are none.
 *
 * The database is offline in this lane (MIRROR-COACH P2): this never ran against one here. The main session runs
 * scripts/workout/revise-all-plans.ts at deploy, dry run first.
 */

import type { Prisma, PrismaClient } from '@/public/_prisma/client';
import { isDepthDrop } from './plan-generator';
import { PLAN_REVISION_YOUTH, isPlyometric, planAudience, planRevisionNote, reviseForYouth, revisePlanForStorage } from './plan-revision';

export type AgeBand = 'adult' | 'minor' | 'unknown';
export const AGE_BANDS: readonly AgeBand[] = ['adult', 'minor', 'unknown'];

/** The age band a plan's owner is counted in: `unknown` without a usable birth year, else by planAudience. */
export function ageBand(dobYear: number | null | undefined, now: Date = new Date()): AgeBand {
  if (typeof dobYear !== 'number' || !Number.isFinite(dobYear) || dobYear < 1900) return 'unknown';
  return planAudience(dobYear, now) === 'adult' ? 'adult' : 'minor';
}

export interface BackfillCount { plans: number; changed: number }

export interface PlanBackfillReport {
  mode: 'dry-run' | 'apply';
  pageSize: number;
  pages: number;
  /** Rows read. */
  scanned: number;
  /** Rows the revision changed (a dry run: would change). */
  changed: number;
  /** Rows written (always 0 in a dry run). */
  written: number;
  /** Writes that threw; the row is left as it was and a second run tries again. */
  writeFailures: number;
  /** Writes that matched no row (deleted, or moved to another owner, between the read and the write). */
  writesMissed: number;
  /** The first few failed or missed ids, for the log. */
  problemIds: string[];
  /** Depth drops in the scanned rows as stored, and after the revision (in memory for a dry run). After must be 0. */
  depthDropsBefore: number;
  depthDropsAfter: number;
  /** Jumps of any kind a youth or unknown-age owner would be SERVED after the revision (the read's youth view). Must be 0. */
  youthPlyometricsAfter: number;
  /** Rows that carried a STORED youth revision (P1's read path) and were restored to the adult-only revision. P2 review. */
  youthRevisionsUndone: number;
  /** Weeks the revision changed, and how many of them per week number ("1".."12"). */
  weeksRevised: number;
  weeksRevisedByNumber: Record<string, number>;
  /** Per stored `focus` label ("(none)" for a blank one), and per age band. */
  byFocus: Record<string, BackfillCount>;
  byBand: Record<AgeBand, BackfillCount>;
  /** Which note each changed plan now shows, by the note's text. */
  notes: Record<string, number>;
}

export interface PlanBackfillOptions {
  apply: boolean;
  pageSize?: number;
  now?: Date;
  /** Called after each page, for progress on a long run. */
  onPage?: (report: Readonly<PlanBackfillReport>) => void;
}

export const DEFAULT_PAGE_SIZE = 200;
const PROBLEM_IDS_KEPT = 20;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const weeksOf = (weeks: unknown): Obj[] => (Array.isArray(weeks) ? weeks.filter(isObj) : []);
const exercisesOf = (weeks: unknown): Obj[] => weeksOf(weeks)
  .flatMap((w) => (Array.isArray(w.days) ? w.days : [])).filter(isObj)
  .flatMap((d) => (Array.isArray(d.exercises) ? d.exercises : [])).filter(isObj);

/**
 * Walk every WorkoutPlan row, page by page, and revise each for its owner (revisePlan + planAudience). Writes only
 * with `apply`. Returns the counts; never throws for a failed write (it is counted), only for a failed read.
 */
export async function backfillWorkoutPlans(db: Pick<PrismaClient, 'workoutPlan'>, opts: PlanBackfillOptions): Promise<PlanBackfillReport> {
  const pageSize = Math.max(1, Math.floor(opts.pageSize ?? DEFAULT_PAGE_SIZE));
  const now = opts.now ?? new Date();
  const report: PlanBackfillReport = {
    mode: opts.apply ? 'apply' : 'dry-run', pageSize, pages: 0, scanned: 0, changed: 0, written: 0, writeFailures: 0,
    writesMissed: 0, problemIds: [], depthDropsBefore: 0, depthDropsAfter: 0, youthPlyometricsAfter: 0, youthRevisionsUndone: 0, weeksRevised: 0,
    weeksRevisedByNumber: {}, byFocus: {}, byBand: { adult: { plans: 0, changed: 0 }, minor: { plans: 0, changed: 0 }, unknown: { plans: 0, changed: 0 } },
    notes: {},
  };
  const problem = (id: string) => { if (report.problemIds.length < PROBLEM_IDS_KEPT) report.problemIds.push(id); };

  let after: string | null = null;
  for (;;) {
    // typed here: `after` is read from this page, so without it the loop's inference is circular (TS7022)
    const rows: { id: string; userId: string; focus: string; weeks: unknown; user: { dobYear: number | null } | null }[] = await db.workoutPlan.findMany({
      where: after === null ? {} : { id: { gt: after } },
      orderBy: { id: 'asc' },
      take: pageSize,
      select: { id: true, userId: true, focus: true, weeks: true, user: { select: { dobYear: true } } },
    });
    if (!rows.length) break;
    report.pages++;
    for (const row of rows) {
      report.scanned++;
      const dobYear = row.user?.dobYear ?? null;
      const band = ageBand(dobYear, now);
      const audience = planAudience(dobYear, now);
      const focus = typeof row.focus === 'string' && row.focus.trim() ? row.focus : '(none)';
      const byFocus = (report.byFocus[focus] ??= { plans: 0, changed: 0 });
      byFocus.plans++;
      report.byBand[band].plans++;
      report.depthDropsBefore += exercisesOf(row.weeks).filter(isDepthDrop).length;

      const r = revisePlanForStorage(row.weeks);
      report.depthDropsAfter += exercisesOf(r.weeks).filter(isDepthDrop).length;
      // what a youth or unknown-age owner is SERVED: the read's youth view over the stored revision
      const served = audience === 'youth' ? reviseForYouth(r.weeks).weeks : r.weeks;
      if (audience === 'youth') report.youthPlyometricsAfter += exercisesOf(served).filter(isPlyometric).length;
      if (weeksOf(row.weeks).some((w) => w.revision === PLAN_REVISION_YOUTH)) report.youthRevisionsUndone++;
      if (!r.changed) continue;

      report.changed++;
      byFocus.changed++;
      report.byBand[band].changed++;
      const before = Array.isArray(row.weeks) ? (row.weeks as unknown[]) : [];
      (r.weeks as unknown[]).forEach((wk, i) => {
        if (wk === before[i]) return;                     // the revision hands back an unchanged week as the same object
        report.weeksRevised++;
        const n = String(isObj(wk) && typeof wk.week === 'number' ? wk.week : i + 1);
        report.weeksRevisedByNumber[n] = (report.weeksRevisedByNumber[n] ?? 0) + 1;
      });
      const note = planRevisionNote(served) ?? '(no note)';
      report.notes[note] = (report.notes[note] ?? 0) + 1;

      if (!opts.apply) continue;
      try {
        const res = await db.workoutPlan.updateMany({ where: { id: row.id, userId: row.userId }, data: { weeks: r.weeks as Prisma.InputJsonValue } });
        if (res.count === 1) report.written++;
        else { report.writesMissed++; problem(row.id); }
      } catch (e) {
        report.writeFailures++;
        problem(row.id);
        console.error(`[workout/plan-backfill] plan ${row.id} was not written; run again to retry it`, e);
      }
    }
    opts.onPage?.(report);
    after = rows[rows.length - 1].id;
    if (rows.length < pageSize) break;
  }
  return report;
}

/** True when the run left nothing wrong: no failed or missed write, no depth drop and no youth jump left. */
export function backfillClean(r: PlanBackfillReport): boolean {
  return r.writeFailures === 0 && r.writesMissed === 0 && r.depthDropsAfter === 0 && r.youthPlyometricsAfter === 0;
}

export interface BackfillArgs { apply: boolean; pageSize: number }

/**
 * The script's flags. A DRY RUN by default; `--apply` writes. `--dry-run` may be given to say so, and never together
 * with `--apply`. `--page-size N` (1-1000). Anything else is refused, so a mistyped flag never runs.
 */
export function parseBackfillArgs(argv: readonly string[]): BackfillArgs {
  let apply = false, dry = false, pageSize = DEFAULT_PAGE_SIZE;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') apply = true;
    else if (a === '--dry-run') dry = true;
    else if (a === '--page-size' || a.startsWith('--page-size=')) {
      const v = a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i];
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 1000) throw new Error(`--page-size must be a whole number from 1 to 1000 (got ${v ?? 'nothing'})`);
      pageSize = n;
    } else throw new Error(`unknown flag ${a} (use --dry-run, --apply, --page-size N)`);
  }
  if (apply && dry) throw new Error('--apply and --dry-run together: choose one');
  return { apply, pageSize };
}

/** The target database as host:port/name, never the user or password, for the log. */
export function describeDatabaseUrl(url: string | undefined): string {
  if (!url) return '(DATABASE_URL is not set)';
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname || ''}`;
  } catch {
    return '(DATABASE_URL is not a URL)';
  }
}

/** The report as the lines the script prints. */
export function formatBackfillReport(r: PlanBackfillReport): string[] {
  const table = (title: string, rows: [string, BackfillCount][]) => [
    `${title}:`,
    ...rows.map(([k, c]) => `  ${k.padEnd(24)} plans ${String(c.plans).padStart(6)}   changed ${String(c.changed).padStart(6)}`),
  ];
  const weekNums = Object.keys(r.weeksRevisedByNumber).sort((a, b) => Number(a) - Number(b));
  return [
    `${r.mode === 'apply' ? 'APPLY' : 'DRY RUN — nothing is written'}: ${r.scanned} plans in ${r.pages} page(s) of up to ${r.pageSize}`,
    `  changed ${r.changed} · unchanged ${r.scanned - r.changed} · written ${r.written} · write failures ${r.writeFailures} · writes that matched no row ${r.writesMissed}`,
    `  depth drops: ${r.depthDropsBefore} stored → ${r.depthDropsAfter} after · jumps served to youth/unknown owners: ${r.youthPlyometricsAfter} · stored youth revisions undone: ${r.youthRevisionsUndone}`,
    `  weeks revised: ${r.weeksRevised}${weekNums.length ? ` (${weekNums.map((n) => `w${n} ${r.weeksRevisedByNumber[n]}`).join(', ')})` : ''}`,
    ...table('per focus', Object.entries(r.byFocus).sort(([a], [b]) => a.localeCompare(b))),
    ...table('per age band (minor = birth year under 18; unknown = no birth year, READ as youth, stored as everyone\'s)', AGE_BANDS.map((b) => [b, r.byBand[b]] as [string, BackfillCount])),
    'notes the changed plans now show their owners:',
    ...Object.entries(r.notes).map(([n, c]) => `  ${String(c).padStart(6)} × ${n}`),
    ...(r.problemIds.length ? [`  first failed or missed ids: ${r.problemIds.join(', ')}`] : []),
    r.mode === 'apply'
      ? (backfillClean(r) ? 'CLEAN: a second run should report changed 0.' : 'NOT CLEAN: run again (it is idempotent) and read the failures above.')
      : `Re-run with --apply to write ${r.changed} plan(s).`,
  ];
}
