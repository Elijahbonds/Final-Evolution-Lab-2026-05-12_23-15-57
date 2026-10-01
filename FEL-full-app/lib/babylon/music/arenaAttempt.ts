// lib/babylon/music/arenaAttempt.ts — the room's side of an Arena music attempt: posting its START and its FINISH so that a
// flaky connection never loses a played set, and what the room does with each answer. PURE except the fetch and the
// storage it is handed (StudioMode hands the real ones; the tests hand stubs).
//
// MUSIC-SUITE P6 FIX PASS (2026-09-26). What the phase review found in StudioMode's startArenaSet / finishArena, verified:
//   * A START WHOSE REPLY WAS LOST BURNT THE ATTEMPT. Any network error or non-409 answer returned the room to READY with
//     "Couldn't reach the Arena — nothing was used; try again." — but the route commits the start before it answers, so
//     after a lost reply (a flaky phone, a proxy 502/504) the retry got 409 ONE_ATTEMPT and the room went to 'refused'
//     without a note played. Now the start carries the room's attemptId (makeAttemptId, one per page): a retry with it gets
//     the SAME start back (/api/arena/music-attempt isStartReplay), the post is retried on a network error / timeout / 5xx,
//     and an outcome the room cannot know is said as unknown, never as "nothing was used".
//   * A FAILED FINISH LOST THE SET. The finish was posted once, with no timeout, and the room called onEnd with its judged
//     score whatever happened — a finish that never landed left the attempt unfinished on the server (rejudged 0), so the
//     shell's submit was refused 422 SCORE_MISMATCH: the set was gone, and in a human duel the honest player lost by
//     forfeit at the deadline. A hung request left the room on "Sending your set…" forever. Now the finish is retried with
//     a timeout, a 409 ALREADY_FINISHED (the first reply was lost) counts as sent, onEnd is called only once the Arena has
//     the set, and until then the taps are KEPT ON THE DEVICE (saveArenaFinish, by match): the room offers SEND AGAIN, and
//     reopening the duel re-posts them (the start answers 409 ONE_ATTEMPT {finished: false} and the room finds them here).
//   * #29 HALF-DONE. After a reload the start's 409 ONE_ATTEMPT set 'refused' and nothing ever called onEnd: the 0 the rule
//     promises was never submitted, the duel waited for its deadline, and the lobby sweep (which read no attempts) refunded
//     it. The 409 now says what the used attempt scores ({finished, score}) and arenaStartVerdict makes it 'used': the room
//     hands the shell that score (0 for a set left after START) so it is submitted NOW. (The sweep scores it too, at the
//     deadline, for a cheater who never submits a 0 against himself — lib/arena-reclaim.ts.)
//
// MUSIC-SUITE P9 (2026-09-29): the Cypher's Arena dance attempt posts through this same client (postArenaAttempt and the
// start / finish verdicts, unchanged) — /api/arena/music-attempt takes a dance duel through the same route code
// (lib/arena-music.ts HOUSE_SET_RULES). Its press list is kept on the device by lib/babylon/dance/arenaDance.ts (the
// {lane, tMs} check in readArenaFinish below is music's own).

import type { HouseTap } from './houseBeat';

/** Tries per post, the timeout of each, and the waits between them. TUNE(elijah). */
export const ARENA_POST_TRIES = 3;
export const ARENA_POST_TIMEOUT_MS = 8_000;
export const ARENA_POST_BACKOFF_MS: readonly number[] = [1_000, 2_500];

/**
 * One id per room (per page): what makes a retried START the same start. Reloading makes a new one, so a reload cannot
 * replay a set. Shape: what the route stores (lib/arena-music.ts cleanAttemptId: 8–64 of [A-Za-z0-9_-]).
 */
export function makeAttemptId(rand: () => number = Math.random, now: number = Date.now()): string {
  let r = '';
  for (let i = 0; i < 12; i++) r += Math.floor(rand() * 36).toString(36);
  return `room-${now.toString(36)}-${r}`;
}

/** What a post came back with: the HTTP status (null = no answer at all: a network error or the timeout) and its JSON. */
export interface ArenaPostResult { status: number | null; body: Record<string, unknown> | null }

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ status: number; json: () => Promise<unknown> }>;

/**
 * POST `body` to /api/arena/music-attempt, retried on no answer (a network error, the timeout) or a 5xx — the same body
 * each time (the attemptId, the same tap list: the route answers a repeat idempotently). Any other answer is final.
 */
export async function postArenaAttempt(
  fetchFn: FetchLike,
  body: Record<string, unknown>,
  opts: { tries?: number; timeoutMs?: number; backoffMs?: readonly number[]; sleep?: (ms: number) => Promise<void> } = {},
): Promise<ArenaPostResult> {
  const tries = Math.max(1, opts.tries ?? ARENA_POST_TRIES);
  const timeoutMs = opts.timeoutMs ?? ARENA_POST_TIMEOUT_MS;
  const backoff = opts.backoffMs ?? ARENA_POST_BACKOFF_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: ArenaPostResult = { status: null, body: null };
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleep(backoff[Math.min(i - 1, backoff.length - 1)] ?? 0);
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { ctl?.abort(); reject(new Error('timeout')); }, timeoutMs); });
      const res = await Promise.race([
        fetchFn('/api/arena/music-attempt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...(ctl ? { signal: ctl.signal } : {}) }),
        timeout,
      ]);
      const json = (await Promise.race([res.json().catch(() => null), timeout])) as Record<string, unknown> | null;
      last = { status: res.status, body: json && typeof json === 'object' ? json : null };
      if (res.status < 500) return last;
    } catch {
      last = { status: null, body: null };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return last;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** What the room does with START's answer. */
export type ArenaStartVerdict =
  | { kind: 'play' }
  | { kind: 'used'; finished: boolean; score: number }
  | { kind: 'refused'; line: string }
  | { kind: 'retry'; line: string };

/** The words for an answer the room could not get (after every retry): the start may or may not have gone in. */
export const ARENA_START_UNKNOWN =
  "Couldn't confirm your START with the Arena. Press START again: if it went through, the same attempt is picked up.";

export function arenaStartVerdict(r: ArenaPostResult): ArenaStartVerdict {
  const b = r.body ?? {};
  if (r.status !== null && r.status >= 200 && r.status < 300 && b.ok !== false) return { kind: 'play' };
  // the attempt is used (a reload, another tab, a second press after the retry window): post what it scores
  if (r.status === 409 && b.error === 'ONE_ATTEMPT') return { kind: 'used', finished: b.finished === true, score: Math.max(0, Math.round(num(b.score) ?? 0)) };
  // nothing was used, and pressing again can work: no opponent yet
  if (r.status === 409 && b.error === 'WAITING_OPPONENT') return { kind: 'retry', line: text(b.detail) ?? 'Waiting for an opponent to join — your one attempt waits too.' };
  // no answer, or a server error after every retry: the outcome is unknown — never "nothing was used"
  if (r.status === null || r.status >= 500) return { kind: 'retry', line: ARENA_START_UNKNOWN };
  // anything else is the Arena's final word (closed, expired, too late, already scored, pre-house-beat, not a player…)
  return { kind: 'refused', line: text(b.detail) ?? `The Arena said no (${r.status}).` };
}

/** What the room does with FINISH's answer. */
export type ArenaFinishVerdict = { kind: 'sent'; score: number | null } | { kind: 'unsent'; line: string; final: boolean };
export const ARENA_FINISH_UNSENT =
  "Your set didn't reach the Arena — it's kept on this device. SEND AGAIN, or reopen this duel before it expires and it is sent then.";

export function arenaFinishVerdict(r: ArenaPostResult): ArenaFinishVerdict {
  const b = r.body ?? {};
  if (r.status !== null && r.status >= 200 && r.status < 300 && b.ok !== false) return { kind: 'sent', score: num(b.score) };
  // a finish is already on file (the route answers a repeat of the SAME list 200, so this one is another list — another
  // tab's): the set is in, and the score to post is the recorded one, which the 409 carries
  if (r.status === 409 && b.error === 'ALREADY_FINISHED') return { kind: 'sent', score: num(b.score) };
  if (r.status === null || r.status >= 500) return { kind: 'unsent', line: ARENA_FINISH_UNSENT, final: false };
  // a refusal a retry cannot change (the list refused, the duel closed or expired): said as the Arena said it
  return { kind: 'unsent', line: `Your set was refused by the Arena: ${text(b.detail) ?? r.status}.`, final: true };
}

// ── the set kept on the device until the Arena has it ─────────────────────────────────────────────────────────────
type StoreLike = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void };
export const arenaFinishKey = (matchId: string): string => `fel.arena.finish.${matchId}`;

/** Keep the finished set's taps for this duel (sessionStorage: this tab, this visit). false = nothing could be kept. */
export function saveArenaFinish(store: StoreLike | null | undefined, matchId: string, taps: readonly HouseTap[]): boolean {
  try { store?.setItem(arenaFinishKey(matchId), JSON.stringify(taps)); return !!store; } catch { return false; }
}
/** The kept taps for this duel, or null (none, or not a list of { lane, tMs }). */
export function readArenaFinish(store: StoreLike | null | undefined, matchId: string): HouseTap[] | null {
  try {
    const raw = store?.getItem(arenaFinishKey(matchId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.every((t) => t && typeof t.lane === 'string' && typeof t.tMs === 'number') ? v : null;
  } catch { return null; }
}
export function clearArenaFinish(store: StoreLike | null | undefined, matchId: string): void {
  try { store?.removeItem(arenaFinishKey(matchId)); } catch { /* nothing kept */ }
}
