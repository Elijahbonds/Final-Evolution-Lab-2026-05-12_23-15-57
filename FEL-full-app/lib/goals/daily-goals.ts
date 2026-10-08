// DAILY GOALS (owner decision, 2026-10-06): "three simple goals per day … rotate from a small pool, seeded by date, same
// for everyone. Derive progress from EXISTING session records server-side … Completing a goal feeds the season pass's
// existing questsDone input."
//
// PURE and import-free (the end card and the season pass track import the copy helpers; the server imports the rest).
//
// THE DAY is the UTC calendar day — the same day the daily XP / shard caps (lib/economy-caps.ts) and the season's
// first-of-day-in-a-mode bonus (season-service isFirstOfDayMode) already count in, so every "today" on the server agrees.
//
// THE RECORDS are the day's GameSession rows (lib/goals/daily-goals-db.ts reads them). app/api/sessions writes a row
// only for a run it PAID — never a NO PLAY, an unpaid / agent / playtest run, or a refused score — so a goal moves only
// on runs the server accepted. Nothing is stored: a goal's progress is recomputed from the rows every time, so it can
// never drift from them, and a goal completes on exactly one run — the one whose row takes it over its target.
//
// ROTATION: the pool holds a few KINDS of goal, each with a couple of sizes. A day's three goals are three different
// kinds (never "win 2" beside "win 3") — always at least one you move just by playing (runs, modes) and at least one
// that asks for wins, so a day is never all-wins for a player on a losing streak — picked and sized by a PRNG seeded
// with the day's key, so everyone has the same three and they change at 00:00 UTC.

export type GoalKind = 'wins' | 'runs' | 'modes' | 'winModes' | 'winRow';

export interface GoalDef {
  id: string;
  kind: GoalKind;
  target: number;
  text: string;
}

/** The pool. Small numbers on purpose: a goal is something a normal evening's play clears. */
export const GOAL_POOL: readonly GoalDef[] = [
  { id: 'wins-2', kind: 'wins', target: 2, text: 'Win 2 games' },
  { id: 'wins-3', kind: 'wins', target: 3, text: 'Win 3 games' },
  { id: 'runs-3', kind: 'runs', target: 3, text: 'Finish 3 runs' },
  { id: 'runs-5', kind: 'runs', target: 5, text: 'Finish 5 runs' },
  { id: 'modes-2', kind: 'modes', target: 2, text: 'Play 2 different modes' },
  { id: 'modes-3', kind: 'modes', target: 3, text: 'Play 3 different modes' },
  { id: 'winModes-2', kind: 'winModes', target: 2, text: 'Win in 2 different modes' },
  { id: 'winRow-2', kind: 'winRow', target: 2, text: 'Win 2 in a row' },
];

/** Kinds you move just by finishing runs; the rest ask for wins. */
export const PLAY_KINDS: ReadonlySet<GoalKind> = new Set<GoalKind>(['runs', 'modes']);

/** Goals a day holds. Also the most goals that can complete in a day, so the most questsDone a day can feed. */
export const DAILY_GOAL_COUNT = 3;

/** One of the day's paid runs, oldest first. */
export interface GoalRun {
  id?: string;
  mode: string;
  won: boolean;
}

export interface GoalState extends GoalDef {
  progress: number;
  done: boolean;
}

/** The UTC day a moment falls in, YYYY-MM-DD (the key the day's goals are seeded with). */
export function utcDayKey(ms: number): string {
  return new Date(Number.isFinite(ms) ? ms : 0).toISOString().slice(0, 10);
}

/** FNV-1a 32-bit — a stable seed from the day's key. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small deterministic PRNG. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** PURE: the day's three goals — three different kinds, the same for everyone on that UTC day. */
export function goalsFor(dayKey: string, pool: readonly GoalDef[] = GOAL_POOL): GoalDef[] {
  const r = rng(hash(`fel-daily-goals:${dayKey}`));
  const kinds = Array.from(new Set(pool.map((g) => g.kind)));
  // Fisher–Yates on the kinds, then one size of each of the first three
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  // one play kind and one win kind (the first of each in the shuffled order), then the next kind left, kept in that order
  const play = kinds.find((k) => PLAY_KINDS.has(k));
  const win = kinds.find((k) => !PLAY_KINDS.has(k));
  const picked = new Set<GoalKind>([play, win].filter((k): k is GoalKind => Boolean(k)));
  for (const k of kinds) { if (picked.size >= DAILY_GOAL_COUNT) break; picked.add(k); }
  return kinds.filter((k) => picked.has(k)).map((k) => {
    const sizes = pool.filter((g) => g.kind === k);
    return sizes[Math.floor(r() * sizes.length)];
  });
}

/** PURE: how far a day's runs (oldest first) take one goal, never past its target. */
export function goalProgress(goal: Pick<GoalDef, 'kind' | 'target'>, runs: readonly GoalRun[]): number {
  let n = 0;
  switch (goal.kind) {
    case 'wins': n = runs.filter((r) => r.won).length; break;
    case 'runs': n = runs.length; break;
    case 'modes': n = new Set(runs.map((r) => r.mode)).size; break;
    case 'winModes': n = new Set(runs.filter((r) => r.won).map((r) => r.mode)).size; break;
    case 'winRow': {
      // done once any run of wins reached the target; until then, the run of wins going NOW (a loss starts it again),
      // so "1 more win in a row" is true when the card says it
      let cur = 0, best = 0;
      for (const r of runs) { cur = r.won ? cur + 1 : 0; best = Math.max(best, cur); }
      n = best >= goal.target ? best : cur;
      break;
    }
  }
  return Math.min(goal.target, n);
}

/** PURE: the day's goals with their progress. */
export function goalStates(dayKey: string, runs: readonly GoalRun[]): GoalState[] {
  return goalsFor(dayKey).map((g) => {
    const progress = goalProgress(g, runs);
    return { ...g, progress, done: progress >= g.target };
  });
}

/**
 * PURE: the goals THIS run completed — done with it, not done without it. `thisRunId` is the run's own row (already in
 * `runs`, the day's rows). With no id to leave out, nothing is credited: a goal is never paid on a guess.
 */
export function completedBy(dayKey: string, runs: readonly GoalRun[], thisRunId: string | null | undefined): string[] {
  if (!thisRunId || !runs.some((r) => r.id === thisRunId)) return [];
  const before = goalStates(dayKey, runs.filter((r) => r.id !== thisRunId));
  const after = goalStates(dayKey, runs);
  return after.filter((g, i) => g.done && !before[i].done).map((g) => g.id);
}

// ── copy (the end card and the season pass track) ──

const NOUN: Record<GoalKind, [string, string]> = {
  wins: ['win', 'wins'],
  runs: ['run', 'runs'],
  modes: ['new mode', 'new modes'],
  winModes: ['win in a new mode', 'wins in new modes'],
  winRow: ['win in a row', 'wins in a row'],
};

/** "2 more wins" — what is left of a goal, in words (null when it is done). */
export function goalRemaining(g: Pick<GoalState, 'kind' | 'target' | 'progress' | 'done'>): string | null {
  if (g.done) return null;
  const left = Math.max(0, g.target - g.progress);
  if (left <= 0) return null;
  const [one, many] = NOUN[g.kind] ?? ['', ''];
  return `${left} more ${left === 1 ? one : many}`;
}

/** A goal's state as the server sends it, checked: anything malformed is dropped rather than drawn. */
export function readGoalStates(raw: unknown): GoalState[] {
  if (!Array.isArray(raw)) return [];
  const out: GoalState[] = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue;
    const o = g as Record<string, unknown>;
    const target = Number(o.target), progress = Number(o.progress);
    if (typeof o.id !== 'string' || typeof o.text !== 'string' || typeof o.kind !== 'string' || !(o.kind in NOUN)) continue;
    if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(progress)) continue;
    const p = Math.max(0, Math.min(target, progress));
    out.push({ id: o.id, kind: o.kind as GoalKind, target, text: o.text, progress: p, done: p >= target });
  }
  return out.slice(0, DAILY_GOAL_COUNT);
}
