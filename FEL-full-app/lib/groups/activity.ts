// TEAMS-SQUADS: what members did, as the core reads it, and everything computed from it — the friend streak, training
// buddies, duo goals, the friends-only boards, the weekly league (and its rollover), and a team's weekly roll-up.
//
// WHERE EVERY NUMBER COMES FROM (none is typed or sent by a page; routes take no numbers):
//   · a drill day   — the daily drill's claim, its WalletLedgerEntry under daily_drill:<PT day>:<user> (lib/daily-drill).
//                     The claim is once a day and only for today's drill (lib/daily-drill/claim.ts). Everyone has these.
//   · a run / a win — GameSession rows (when, and `won`), counted, never a score: allowed for teens, as days played are
//                     (lib/progress-card/summary.ts CardGames.runs).
//   · a PR          — a verified adult's GameSession best this week over their best before it (scores: adults only).
//   · measured reps — saved Mirror sets (MirrorSession.reps, squat/lunge): only an adult who saves numbers (scanSaveGate)
//                     AND turned on sharing with this group. A minor has none on the server (owner decision 1, 2026-10-07).
//   · a jump        — a JumpRecord (lib/jump/seam.ts, JUMP-PRO #437) from a saved assessment's T5 read, same gates as
//                     reps; the boards and feed keep only `verified: true` records.
// The reader (server.ts) applies the gates inside its queries; every function here applies them AGAIN on the member's
// facts, so a row that should not have been fetched still never reaches a view.
// Pure.

import type { JumpRecord } from '@/lib/jump/seam';
import { sharesMeasured, showsScores } from './rules';
import { dayOf, dayStart, addDays, prevWeekKey, weekBounds, weekDays } from './week';
import type { DuoTarget, GroupAct, MemberFacts } from './types';
import { DUO_TARGETS } from './types';

export interface Activity {
  /** userId → the PT days (read window) the daily drill was done. */
  drillDays: Record<string, readonly string[]>;
  runs: readonly { userId: string; at: number; won: boolean }[];
  prs: readonly { userId: string; mode: string; modeName: string; score: number; previous: number; at: number }[];
  reps: readonly { userId: string; id: string; patternId: string; reps: number; at: number }[];
  jumps: readonly { userId: string; id: string; record: JumpRecord; at: number }[];
  /** ChallengeLinks the group's posted-challenge acts point at. */
  challenges: readonly { code: string; ownerUserId: string | null; modeName: string; score: number; at: number }[];
}

export const EMPTY_ACTIVITY: Activity = { drillDays: {}, runs: [], prs: [], reps: [], jumps: [], challenges: [] };

const did = (a: Activity, userId: string, day: string) => (a.drillDays[userId] ?? []).includes(day);
const inWeek = (at: number, weekKey: string) => { const b = weekBounds(weekKey); return at >= b.start.getTime() && at < b.end.getTime(); };

// ── training buddies + the friend streak ─────────────────────────────────────────────────────────────────────────

export interface Buddy { userId: string; name: string; doneToday: boolean; nudgedByMe: boolean; canNudge: boolean }

/** Each member's drill today, done or not, and whether the viewer may nudge them (not themselves, not done, once a day). */
export function buddies(members: readonly MemberFacts[], a: Activity, viewerId: string, acts: readonly GroupAct[], now: number): Buddy[] {
  const today = dayOf(now);
  return members.map((m) => {
    const doneToday = did(a, m.userId, today);
    const nudgedByMe = acts.some((x) => x.kind === 'nudge' && x.fromUserId === viewerId && x.toUserId === m.userId && x.ref === today);
    return { userId: m.userId, name: m.name, doneToday, nudgedByMe, canNudge: m.userId !== viewerId && !doneToday && !nudgedByMe };
  });
}

export const STREAK_LOOKBACK_DAYS = 35;

/**
 * Consecutive PT days on which EVERY member (who had joined by that day's end) did the daily drill, ending today when
 * everyone has done today's, else yesterday. A day with fewer than two such members ends it: a friend streak takes two.
 */
export function friendStreak(members: readonly Pick<MemberFacts, 'userId' | 'joinedAt'>[], a: Activity, groupCreatedAt: number, now: number): { days: number; todayAll: boolean } {
  const today = dayOf(now);
  const first = dayOf(groupCreatedAt);
  const allDid = (day: string) => {
    const end = dayStart(addDays(day, 1)).getTime();
    const there = members.filter((m) => m.joinedAt < end);
    return there.length >= 2 && there.every((m) => did(a, m.userId, day));
  };
  const todayAll = allDid(today);
  let day = todayAll ? today : addDays(today, -1);
  let days = 0;
  while (days < STREAK_LOOKBACK_DAYS && day >= first && allDid(day)) { days += 1; day = addDays(day, -1); }
  return { days, todayAll };
}

// ── duo goals ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DuoGoal { a: string; b: string; aName: string; bName: string; target: DuoTarget; together: number; met: boolean; weekKey: string }

export const isDuoTarget = (v: unknown): v is DuoTarget => typeof v === 'number' && (DUO_TARGETS as readonly number[]).includes(v);
export const duoKey = (weekKey: string, x: string, y: string) => { const [a, b] = [x, y].sort(); return `duo:${weekKey}:${a}:${b}`; };

/** This week's duo goals: the days both partners did the drill, against the target they picked. */
export function duoGoals(members: readonly MemberFacts[], a: Activity, acts: readonly GroupAct[], weekKey: string): DuoGoal[] {
  const name = (id: string) => members.find((m) => m.userId === id)?.name ?? null;
  const days = weekDays(weekKey);
  return acts.flatMap((x) => {
    if (x.kind !== 'duo' || x.ref !== weekKey || !x.fromUserId || !x.toUserId) return [];
    const target = Number(x.preset);
    const aName = name(x.fromUserId), bName = name(x.toUserId);
    if (!isDuoTarget(target) || !aName || !bName) return [];
    const together = days.filter((d) => did(a, x.fromUserId!, d) && did(a, x.toUserId!, d)).length;
    return [{ a: x.fromUserId, b: x.toUserId, aName, bName, target, together, met: together >= target, weekKey }];
  });
}

// ── the friends-only boards ──────────────────────────────────────────────────────────────────────────────────────

export interface BoardRow { userId: string; name: string; value: number; display: string }
export interface Boards {
  /** Daily drills done this week: every member. */
  drill: BoardRow[];
  /** Saved Mirror reps this week: adults who save numbers and share them with this group. */
  reps: BoardRow[];
  /** Best VERIFIED jump (lib/jump/seam.ts JumpRecord.verified) in the read window: same gate as reps. */
  jump: BoardRow[];
  /** Members with numbers the boards could not show (a minor, or an adult not sharing): a count, no names. */
  measuredHidden: number;
}

const rank = (rows: BoardRow[]) => rows.sort((x, y) => y.value - x.value || x.name.localeCompare(y.name));
export const inchesOf = (cm: number) => Math.round((cm / 2.54) * 10) / 10;

export function boards(members: readonly MemberFacts[], a: Activity, weekKey: string): Boards {
  const days = weekDays(weekKey);
  const drill = rank(members.map((m) => {
    const n = days.filter((d) => did(a, m.userId, d)).length;
    return { userId: m.userId, name: m.name, value: n, display: `${n}/7` };
  }));
  const sharing = members.filter(sharesMeasured);
  const reps = rank(sharing.flatMap((m) => {
    const n = a.reps.filter((r) => r.userId === m.userId && inWeek(r.at, weekKey) && Number.isFinite(r.reps) && r.reps > 0).reduce((s, r) => s + Math.round(r.reps), 0);
    return n > 0 ? [{ userId: m.userId, name: m.name, value: n, display: `${n} reps` }] : [];
  }));
  const jump = rank(sharing.flatMap((m) => {
    const best = a.jumps
      .filter((j) => j.userId === m.userId && j.record.verified === true && j.record.blocks.length === 0 && j.record.heightCm > 0)
      .reduce<number | null>((b, j) => (b === null || j.record.heightCm > b ? j.record.heightCm : b), null);
    return best !== null ? [{ userId: m.userId, name: m.name, value: best, display: `${inchesOf(best)} in` }] : [];
  }));
  return { drill, reps, jump, measuredHidden: members.length - sharing.length };
}

// ── the weekly league ────────────────────────────────────────────────────────────────────────────────────────────

/** (new, owner call) Points: a drill day (the real reps everyone has on the server), a finished run, a win. */
export const LEAGUE_POINTS = { drillDay: 10, run: 2, win: 3 } as const;
/** (new) Runs and wins counted per member per week, so grinding games cannot outweigh a week of training. */
export const LEAGUE_CAPS = { runs: 15, wins: 10 } as const;

export interface Standing { userId: string; name: string; drillDays: number; runs: number; wins: number; points: number; place: number }

export function standings(members: readonly MemberFacts[], a: Activity, weekKey: string): Standing[] {
  const days = weekDays(weekKey);
  const rows = members.map((m) => {
    const drillDays = days.filter((d) => did(a, m.userId, d)).length;
    const mine = a.runs.filter((r) => r.userId === m.userId && inWeek(r.at, weekKey));
    const runs = Math.min(mine.length, LEAGUE_CAPS.runs);
    const wins = Math.min(mine.filter((r) => r.won).length, LEAGUE_CAPS.wins);
    const points = drillDays * LEAGUE_POINTS.drillDay + runs * LEAGUE_POINTS.run + wins * LEAGUE_POINTS.win;
    return { userId: m.userId, name: m.name, drillDays, runs, wins, points, joinedAt: m.joinedAt, place: 0 };
  });
  rows.sort((x, y) => y.points - x.points || y.drillDays - x.drillDays || x.joinedAt - y.joinedAt || x.userId.localeCompare(y.userId));
  // equal points and drill days share a place
  rows.forEach((r, i) => { const p = rows[i - 1]; r.place = p && p.points === r.points && p.drillDays === r.drillDays ? p.place : i + 1; });
  return rows.map(({ joinedAt: _j, ...r }) => r);
}

export const leagueKey = (weekKey: string) => `league:${weekKey}`;

export interface TrophyAward { dedupeKey: string; ref: string; toUserId: string | null; points: number | null; preset: 'league_winner' | 'none' }

/**
 * The weekly ROLLOVER. Once a week has ended, its league is settled exactly once: the winner's trophy (or a 'none' row
 * when fewer than two members played or nobody scored, so the week is not re-read every visit). Nothing to do when the
 * group did not exist for that week, or the row is already there (the unique dedupeKey makes a race write it once).
 */
export function rolloverAward(groupCreatedAt: number, members: readonly MemberFacts[], a: Activity, currentWeek: string, acts: readonly GroupAct[]): TrophyAward | null {
  const week = prevWeekKey(currentWeek);
  const key = leagueKey(week);
  if (acts.some((x) => x.dedupeKey === key)) return null;
  if (groupCreatedAt >= weekBounds(week).end.getTime()) return null;
  const table = standings(members.filter((m) => m.joinedAt < weekBounds(week).end.getTime()), a, week);
  const top = table[0];
  const winners = table.filter((r) => r.place === 1);
  if (table.length < 2 || !top || top.points <= 0 || winners.length !== 1) {
    // a tie at the top shares nothing on the shelf: assumption, owner call (docs/TEAMS-SQUADS.md)
    return { dedupeKey: key, ref: week, toUserId: null, points: top?.points ?? null, preset: 'none' };
  }
  return { dedupeKey: key, ref: week, toUserId: top.userId, points: top.points, preset: 'league_winner' };
}

export interface Trophy { weekKey: string; userId: string; name: string; points: number }

/** The shelf: every settled week with a winner who is still a member, newest first. */
export function trophyShelf(members: readonly MemberFacts[], acts: readonly GroupAct[]): Trophy[] {
  return acts
    .filter((x) => x.kind === 'trophy' && x.preset === 'league_winner' && x.toUserId && x.ref)
    .flatMap((x) => { const m = members.find((y) => y.userId === x.toUserId); return m ? [{ weekKey: x.ref!, userId: m.userId, name: m.name, points: x.points ?? 0 }] : []; })
    .sort((x, y) => y.weekKey.localeCompare(x.weekKey));
}

// ── a team's weekly roll-up (the coach's view) ───────────────────────────────────────────────────────────────────

export interface RollupRow { userId: string; name: string; minor: boolean; drillDays: number; runsThisWeek: number; runsLastWeek: number; trend: 'up' | 'down' | 'same' | null }
export interface Rollup { weekKey: string; rows: RollupRow[]; totals: { athletes: number; active: number; drillDays: number; runs: number }; drillAssigned: boolean }

/**
 * Counts only — drill days and runs — which is what every member's visibility allows a coach (profile v2: a coach sees
 * no Mirror number outside the per-booking share, and a teen's scores stay on the device). Athletes on the coach's live
 * roster only (COACH-LOOP §3); the owner and coaches are not athletes here.
 */
export function teamRollup(members: readonly MemberFacts[], a: Activity, weekKey: string, drillAssigned: boolean): Rollup {
  const last = prevWeekKey(weekKey);
  const athletes = members.filter((m) => m.role === 'member' && m.onRoster);
  const rows = athletes.map((m) => {
    const drillDays = weekDays(weekKey).filter((d) => did(a, m.userId, d)).length;
    const runsThisWeek = a.runs.filter((r) => r.userId === m.userId && inWeek(r.at, weekKey)).length;
    const runsLastWeek = a.runs.filter((r) => r.userId === m.userId && inWeek(r.at, last)).length;
    const lastDrill = weekDays(last).filter((d) => did(a, m.userId, d)).length;
    const now = drillDays + runsThisWeek, before = lastDrill + runsLastWeek;
    const trend = now === 0 && before === 0 ? null : now > before ? 'up' as const : now < before ? 'down' as const : 'same' as const;
    return { userId: m.userId, name: m.name, minor: m.band !== 'adult', drillDays, runsThisWeek, runsLastWeek, trend };
  }).sort((x, y) => x.drillDays - y.drillDays || x.name.localeCompare(y.name));
  return {
    weekKey, rows, drillAssigned,
    totals: {
      athletes: rows.length,
      active: rows.filter((r) => r.drillDays + r.runsThisWeek > 0).length,
      drillDays: rows.reduce((s, r) => s + r.drillDays, 0),
      runs: rows.reduce((s, r) => s + r.runsThisWeek, 0),
    },
  };
}

// ── the gates, once more, on the way out ─────────────────────────────────────────────────────────────────────────

/** Drop every row a member's facts do not allow (defence in depth over the reader's own query gates). */
export function allowedActivity(members: readonly MemberFacts[], a: Activity): Activity {
  const by = new Map(members.map((m) => [m.userId, m]));
  const measured = (id: string) => { const m = by.get(id); return !!m && sharesMeasured(m); };
  const scores = (id: string) => { const m = by.get(id); return !!m && showsScores(m); };
  return {
    drillDays: Object.fromEntries(Object.entries(a.drillDays).filter(([id]) => by.has(id))),
    runs: a.runs.filter((r) => by.has(r.userId)),
    prs: a.prs.filter((p) => scores(p.userId)),
    reps: a.reps.filter((r) => measured(r.userId)),
    jumps: a.jumps.filter((j) => measured(j.userId)),
    challenges: a.challenges,
  };
}

