// Pattern coverage and pull-over-push — two weekly reads on a coached program (MIRROR-COACH P2, 2026-09-25).
//
// WHAT WAS MISSING. The coach's roster said a client's card, PRQ and a game count, and nothing about the coached
// work: whether this week's sessions trained all six foundational patterns, or only squatted. The builder checked a
// session's own shape (lib/coach/structure.ts sessionWarnings) but never a week's balance, so a block of bench,
// push-ups and dips with one set of rows went out without a word. Both reads key on the pattern tag the P2 schema
// added to ProgramExercise (`pattern`, NULLABLE: null = never tagged) and on the session's section.
//
// THE ABSENCE-VS-ZERO RULE, which shapes both. An untagged exercise is not "no pattern", it is "we don't know which".
// So the coverage strip never says a pattern was missed when an untagged exercise could have been it — that cell
// reads `untagged` and the strip says how many exercises need a tag — and the pull-over-push check counts tagged sets
// only and says so when untagged sets could change the answer.
//
// ONLY WORKING SETS COUNT. Prep, Prime and Cool-down are the ramp in and out (a band pull-apart in Prep, a few crisp
// jumps in Prime): counting them would let a warm-up drill balance a block of heavy pressing, or tick "pull" for a
// week that never rowed. Key, Assist and Finish count. A row stored before the P2 push has no section and reads as
// `key`, the schema default — exactly what it was.
//
// FEL'S NUMBERS, not a book's. The six patterns are the plain names every strength coach uses (squat, hinge, lunge,
// push, pull, carry: the P2 schema's MovementPattern enum), and the pulling rule is FEL's own default — at least as
// many pulling sets as pressing sets, leaning to three for every two when a note on file mentions the shoulder. No
// ratio table, rowing law or program is taken from anywhere. Every line of copy here is a suggestion about sets, never
// a claim about a body: coverage.test.ts screens it through lib/share/screen.ts.
//
// Pure: no Prisma client value, no DOM. The route (app/api/coach/roster/route.ts) and the builder
// (components/coach/program-builder.tsx) hand it plain rows.
import type { MovementPattern, SessionSection } from '@/public/_prisma/client';

// ── the six patterns ────────────────────────────────────────────────────────────────────────────────────────────────

/** The six foundational patterns the strip shows, in the order a coach reads them. */
export const COVERAGE_PATTERNS = ['squat', 'hinge', 'lunge', 'push', 'pull', 'carry'] as const satisfies readonly MovementPattern[];
export type CoveragePattern = (typeof COVERAGE_PATTERNS)[number];

export const PATTERN_LABELS: Record<CoveragePattern, string> = {
  squat: 'Squat', hinge: 'Hinge', lunge: 'Lunge', push: 'Push', pull: 'Pull', carry: 'Carry',
};

/** The sections whose sets are the session's work. See "ONLY WORKING SETS COUNT" above. */
export const WORKING_SECTIONS: readonly SessionSection[] = ['key', 'assist', 'finish'];

/** The strip's window: a rolling seven days ending now, not the calendar week (see coverage.test.ts). */
export const COVERAGE_WINDOW_DAYS = 7;

/** One prescribed exercise as these reads need it: its catalogue row's tag, its section, its sets. */
export interface PatternedItem {
  /** ProgramExercise.pattern — null / undefined = never tagged. */
  pattern?: MovementPattern | string | null;
  /** SessionExercise.section — null / undefined = `key` (the schema default; a row stored before the P2 push). */
  section?: SessionSection | string | null;
  sets?: number | null;
}

export const isWorking = (i: PatternedItem): boolean => (WORKING_SECTIONS as readonly string[]).includes(i.section ?? 'key');
const tagOf = (i: PatternedItem): string | null => (typeof i.pattern === 'string' && i.pattern ? i.pattern : null);

// ── the coverage strip ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One pattern's cell.
 *   done           — a coached session completed in the window included a working exercise tagged with it.
 *   open           — it is tagged in the program, and nothing done in the window was (or could have been) it.
 *   notProgrammed  — the program is fully tagged and it is not in there: the coach's own choice, stated plainly.
 *   untagged       — can't tell: an untagged exercise (done in the window, or in the program) could be it.
 * There is no `missed`: a pattern the coach never programmed was not missed by the athlete, and one hidden behind an
 * untagged exercise is unknown, not zero.
 */
export type CoverageState = 'done' | 'open' | 'notProgrammed' | 'untagged';

export interface CoverageCell {
  pattern: CoveragePattern;
  label: string;
  state: CoverageState;
  /** One line for a tooltip / screen reader: what the cell means for this client. */
  note: string;
}

export interface CoverageStrip {
  cells: CoverageCell[];
  windowDays: number;
  /** Completed coached sessions in the window. */
  sessionsDone: number;
  /** Working exercises with no pattern tag among the ones done in the window (counted once per session done). */
  untaggedDone: number;
  /** Distinct working exercises with no pattern tag in the program. */
  untaggedProgrammed: number;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * The six-pattern strip for one client.
 *
 * @param programmed every exercise in the client's active program(s), any section (the working ones are picked here).
 * @param done one entry per coached session COMPLETED in the window, each the exercises of that session.
 * @param untaggedProgrammedCount distinct untagged exercises in the program, when the caller can de-duplicate them
 *   (the same catalogue row prescribed in eight sessions is one exercise to tag, not eight); defaults to the count of
 *   untagged working items in `programmed`.
 */
export function patternCoverage(
  programmed: readonly PatternedItem[],
  done: readonly (readonly PatternedItem[])[],
  untaggedProgrammedCount?: number,
): CoverageStrip {
  const workDone = done.flatMap((s) => s.filter(isWorking));
  const workProgrammed = programmed.filter(isWorking);
  const doneTags = new Set(workDone.map(tagOf).filter((t): t is string => t !== null));
  const programmedTags = new Set(workProgrammed.map(tagOf).filter((t): t is string => t !== null));
  const untaggedDone = workDone.filter((i) => tagOf(i) === null).length;
  const untaggedInProgram = workProgrammed.filter((i) => tagOf(i) === null).length;
  const untaggedProgrammed = untaggedProgrammedCount ?? untaggedInProgram;

  const cells = COVERAGE_PATTERNS.map((pattern): CoverageCell => {
    const label = PATTERN_LABELS[pattern];
    if (doneTags.has(pattern)) return { pattern, label, state: 'done', note: `${label}: done in the last ${COVERAGE_WINDOW_DAYS} days.` };
    if (untaggedDone > 0) {
      return { pattern, label, state: 'untagged', note: `${label}: can't tell. ${plural(untaggedDone, 'exercise', 'exercises')} done in the last ${COVERAGE_WINDOW_DAYS} days ${untaggedDone === 1 ? 'has' : 'have'} no pattern tag.` };
    }
    if (programmedTags.has(pattern)) return { pattern, label, state: 'open', note: `${label}: in the program, not done in the last ${COVERAGE_WINDOW_DAYS} days.` };
    if (untaggedInProgram > 0) {
      return { pattern, label, state: 'untagged', note: `${label}: can't tell. ${plural(untaggedProgrammed, 'exercise', 'exercises')} in the program ${untaggedProgrammed === 1 ? 'has' : 'have'} no pattern tag.` };
    }
    return { pattern, label, state: 'notProgrammed', note: `${label}: not in this program.` };
  });

  return { cells, windowDays: COVERAGE_WINDOW_DAYS, sessionsDone: done.length, untaggedDone, untaggedProgrammed };
}

/**
 * The one line under the strip: the window, the sessions it read, and — when tags are missing — what to do about it.
 * "untagged" is always explained, because a cell that says "can't tell" without saying why reads as a fault.
 */
export function coverageLine(strip: CoverageStrip): string {
  const head = `Last ${strip.windowDays} days · ${plural(strip.sessionsDone, 'coached session', 'coached sessions')}`;
  const untagged = strip.untaggedDone || strip.untaggedProgrammed;
  if (!strip.cells.some((c) => c.state === 'untagged') || !untagged) return `${head}.`;
  const where = strip.untaggedDone ? 'done this week' : 'in the program';
  return `${head} · ${plural(untagged, 'exercise', 'exercises')} ${where} ${untagged === 1 ? 'has' : 'have'} no pattern tag: tag ${untagged === 1 ? 'it' : 'them'} in My catalogue to fill the strip.`;
}

/** A CoachingProgram row as the roster route reads it: its sessions' exercises, each with its catalogue row's tag. */
export interface CoverageProgramRow {
  id: string;
  clientId: string;
  isActive: boolean;
  blocks: readonly {
    sessions: readonly {
      id: string;
      exercises: readonly { id?: string | null; exerciseId?: string | null; sets?: number | null; section?: string | null; exercise?: { pattern?: string | null } | null }[];
    }[];
  }[];
}
/**
 * A completed ClientSession, as the roster route reads it. `loggedExerciseIds` (MIRROR-COACH P2 review, 2026-09-26):
 * the SessionExercise ids that have a log with WORK in it (lib/coach/setLog.ts LOGGED_WORK_WHERE). When the caller read
 * them, only those exercises count as done: a client who logged the squat and tapped Done had Hinge and Pull marked
 * "done in the last 7 days" — the over-claim mirror of the "missed" the strip was built never to say. Undefined = not
 * read, and the whole completed session counts, as before.
 */
export interface CompletedSessionRow { clientId: string; sessionId: string; completedAt: Date | string | null; loggedExerciseIds?: readonly string[] | null }

/**
 * One client's strip from the roster route's rows. Null when this coach has no ACTIVE program for them — there is no
 * program to cover, which is the coach's backlog (compliance's `awaitingProgram`), not six empty cells.
 *
 * `programmed` is the active program(s); `done` resolves each session completed in the window against ALL of this
 * coach's programs for the client, so a session finished just before a block was archived still counts.
 */
export function clientCoverage(
  programs: readonly CoverageProgramRow[],
  completed: readonly CompletedSessionRow[],
  clientId: string,
  nowMs: number,
): CoverageStrip | null {
  const mine = programs.filter((p) => p.clientId === clientId);
  const active = mine.filter((p) => p.isActive);
  if (!active.length) return null;
  type Ex = CoverageProgramRow['blocks'][number]['sessions'][number]['exercises'][number];
  const item = (e: Ex): PatternedItem & { exerciseId: string | null; id: string | null } => ({
    pattern: e.exercise?.pattern ?? null, section: e.section ?? null, sets: e.sets ?? null, exerciseId: e.exerciseId ?? null, id: e.id ?? null,
  });
  const sessionItems = new Map<string, (PatternedItem & { id: string | null })[]>();
  for (const p of mine) for (const b of p.blocks) for (const s of b.sessions) sessionItems.set(s.id, s.exercises.map(item));
  const programmed = active.flatMap((p) => p.blocks.flatMap((b) => b.sessions.flatMap((s) => s.exercises.map(item))));
  const from = nowMs - COVERAGE_WINDOW_DAYS * 86_400_000;
  const done = completed
    .filter((c) => c.clientId === clientId && c.completedAt != null)
    .filter((c) => { const t = new Date(c.completedAt as Date | string).getTime(); return t > from && t <= nowMs; })
    .map((c) => {
      const items = sessionItems.get(c.sessionId);
      if (!items || c.loggedExerciseIds == null) return items;
      const logged = new Set(c.loggedExerciseIds);
      return items.filter((i) => i.id !== null && logged.has(i.id));
    })
    .filter((x): x is (PatternedItem & { id: string | null })[] => !!x);
  // one catalogue row prescribed in eight sessions is ONE exercise to tag
  const untaggedIds = new Set(programmed.filter((i) => isWorking(i) && tagOf(i) === null).map((i, k) => i.exerciseId ?? `row-${k}`));
  return patternCoverage(programmed, done, untaggedIds.size);
}

// ── pull over push ──────────────────────────────────────────────────────────────────────────────────────────────────

/** FEL's default: at least as many pulling sets as pressing sets in a week. */
export const PULL_PER_PUSH = 1;
/**
 * FEL's stricter lean when a note on file mentions the shoulder: three pulling sets for every two pressing sets. FEL's
 * own number, chosen as a modest step past 1:1 — the owner can change it here and every reader follows.
 */
export const PULL_PER_PUSH_SHOULDER = 1.5;

export interface PullPushCheck {
  /** Working sets tagged `push`, and tagged `pull`. */
  push: number;
  pull: number;
  /** Pulling sets FEL suggests for this much pressing, and how many more that is. */
  need: number;
  short: number;
  /** Working sets with no pattern tag — they could be either. */
  untaggedSets: number;
  shoulderNote: boolean;
  /** true when the untagged sets could not close the gap even if every one of them were a pull. */
  sure: boolean;
  /** The builder's line: a suggestion, never a refusal. */
  text: string;
}

/**
 * Does any of these notes mention the shoulder? The whole word, either number — but NOT as a measure of stance or a
 * screen word (MIRROR-COACH P2 review, 2026-09-26): "shoulder-width stance" is where the feet go, and a note the Mirror
 * wrote ("From the screen: shoulder level failed…", mirrorToProgram.ts `because`) is a screen finding; each raised the
 * pull target to 3:2 and told the coach "a note on this program mentions the shoulder". A cue about the shoulder
 * itself ("shoulder blades tucked", "felt it in my shoulder") still counts.
 */
export function mentionsShoulder(notes: readonly (string | null | undefined)[]): boolean {
  const NOT_ABOUT_A_SHOULDER = /\bshoulders?[- ](?:width|wide|level|height)\b/gi;
  return notes.some((n) => {
    if (typeof n !== 'string' || /^\s*From the screen:/i.test(n)) return false;
    return /\bshoulders?\b/i.test(n.replace(NOT_ABOUT_A_SHOULDER, ''));
  });
}

/**
 * The weekly pull-over-push check for one block of the builder (a block is the builder's "week"; a two-week block is
 * checked as a whole, and the ratio reads the same either way). Null when there is nothing to say: no pressing, or
 * enough pulling.
 */
export function pullPushCheck(
  items: readonly PatternedItem[],
  opts: { shoulderNote?: boolean; label?: string } = {},
): PullPushCheck | null {
  const work = items.filter(isWorking);
  const sets = (pred: (i: PatternedItem) => boolean) => work.filter(pred).reduce((s, i) => s + Math.max(0, Math.round(i.sets ?? 0)), 0);
  const push = sets((i) => tagOf(i) === 'push');
  const pull = sets((i) => tagOf(i) === 'pull');
  const untaggedSets = sets((i) => tagOf(i) === null);
  const shoulderNote = !!opts.shoulderNote;
  if (push === 0) return null;
  const need = Math.ceil(push * (shoulderNote ? PULL_PER_PUSH_SHOULDER : PULL_PER_PUSH));
  if (pull >= need) return null;
  const short = need - pull;
  const sure = untaggedSets < short;
  const where = opts.label ? ` for ${opts.label}` : '';
  const counts = `Suggestion${where}: ${plural(push, 'pressing set', 'pressing sets')} and ${plural(pull, 'pulling set', 'pulling sets')}.`;
  const rule = shoulderNote
    ? ` A note on this program mentions the shoulder, so FEL leans further toward pulling here: 3 pulling sets for every 2 pressing, ${need} in all. Add ${plural(short, 'pulling set', 'pulling sets')}, or trade a pressing set for a row.`
    : ` FEL's default is at least as much pulling as pressing. Add ${plural(short, 'pulling set', 'pulling sets')}, or trade a pressing set for a row.`;
  // said whenever there are untagged sets, not only when they could close the gap: the counts above leave them out
  // either way, so "add 5" may be "add 3" once they are tagged
  const caveat = untaggedSets > 0 ? ` Counted from tagged exercises only: ${plural(untaggedSets, 'set here has', 'sets here have')} no pattern tag.` : '';
  return { push, pull, need, short, untaggedSets, shoulderNote, sure, text: counts + rule + caveat };
}
