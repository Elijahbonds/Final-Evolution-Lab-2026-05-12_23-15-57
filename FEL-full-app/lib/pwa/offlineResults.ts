// Offline runs reaching the history (offline-push, round 8, 2026-10-26): what POST /api/offline/results accepts, and
// the one statement that records it. Server only.
//
// PRACTICE, NEVER PAID. A run played with no signal never had a server run (POST /api/sessions/start), so the server
// never timed it and cannot vouch for its score (ECONOMY-SESSIONS-HARDEN: every paid run finishes a run the server
// started). It is recorded in OfflinePlay (prisma/pending/2026-10-26-offline-plays.sql), which nothing that pays reads:
// no GameSession, no XP, coins, Lab Credits, streak, PRQ, season XP, mastery or Arena score. Paying offline runs is an
// owner call (the lane report), not a default.
//
// What is accepted: a run of an offline-play page's mode (lib/pwa/offlinePlay.ts — the single-player catalogue), a whole
// score 0..MAX_SCORE, a duration up to six hours, played in the last OFFLINE_RESULT_MAX_AGE_MS and not in the future,
// and the device's id for the run (one row per run however often it is re-sent). The table is read through the pending
// seam (lib/coach/pendingSchema.ts): before the SQL is applied the route answers 503 not_ready and the phone keeps the
// run queued.
import { randomUUID } from 'node:crypto';
import { pendingProbe, type RawDb } from '@/lib/coach/pendingSchema';
import { MODE_INFO, canonicalModeKey } from '@/lib/game-data';
import { isOfflinePage } from './offlinePlay';

export const OFFLINE_RESULT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** A clock a little ahead of the server's is still believed. */
export const OFFLINE_RESULT_FUTURE_SLACK_MS = 5 * 60 * 1000;
export const OFFLINE_MAX_SCORE = 1_000_000_000;
export const OFFLINE_MAX_DURATION_MS = 6 * 60 * 60 * 1000;
/** (new) Offline runs one account may send an hour. A queue holds at most 50 (lib/offline-cache.ts). */
export const OFFLINE_RESULTS_PER_HOUR = 120;
/** The header lib/offline-cache.ts sends the device's id for the run in. */
export const RUN_KEY_HEADER = 'x-client-result-id';

const probe = pendingProbe('offline_play', `SELECT 1 AS "ok" FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'OfflinePlay' LIMIT 1`);
export function resetOfflinePlayProbe(): void { probe.reset(); }

export interface OfflineResult { runKey: string; mode: string; score: number; won: boolean; durationSec: number; playedAt: Date }

/** Is this a mode whose page plays offline? (canonical key, listed, its page on the offline list) */
export function offlineMode(raw: unknown): string | null {
  const key = canonicalModeKey(typeof raw === 'string' ? raw : '');
  const info = Object.prototype.hasOwnProperty.call(MODE_INFO, key) ? MODE_INFO[key] : null;
  return info && info.href.startsWith('/play/') && isOfflinePage(info.href) ? key : null;
}

export function parseOfflineResult(body: unknown, runKey: unknown, now: number = Date.now()):
  { ok: true; value: OfflineResult } | { ok: false; error: string } {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, error: 'bad_body' };
  const key = typeof runKey === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(runKey) ? runKey : null;
  if (!key) return { ok: false, error: 'run_key_required' };
  const mode = offlineMode(b.mode);
  if (!mode) return { ok: false, error: 'mode_not_offline' };
  const score = b.score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > OFFLINE_MAX_SCORE) return { ok: false, error: 'bad_score' };
  const ms = b.durationMs === undefined ? 0 : b.durationMs;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0 || ms > OFFLINE_MAX_DURATION_MS) return { ok: false, error: 'bad_duration' };
  const at = typeof b.completedAt === 'string' ? Date.parse(b.completedAt) : NaN;
  if (!Number.isFinite(at)) return { ok: false, error: 'bad_time' };
  if (at > now + OFFLINE_RESULT_FUTURE_SLACK_MS) return { ok: false, error: 'in_the_future' };
  if (at < now - OFFLINE_RESULT_MAX_AGE_MS) return { ok: false, error: 'too_old' };
  return { ok: true, value: { runKey: key, mode, score, won: b.won === true, durationSec: Math.round(ms / 1000), playedAt: new Date(at) } };
}

export const INSERT_OFFLINE_PLAY = `INSERT INTO "OfflinePlay" ("id", "userId", "runKey", "mode", "score", "won", "durationSec", "playedAt")
VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT ("userId", "runKey") DO NOTHING`;

export type RecordOutcome = { status: 'recorded' } | { status: 'already' } | { status: 'not_ready' } | { status: 'failed' };

/** Record one offline run. Never throws: a missing table is not_ready (the phone keeps it), any other failure failed. */
export async function recordOfflinePlay(db: RawDb, userId: string, r: OfflineResult, now: number = Date.now()): Promise<RecordOutcome> {
  if (!(await probe.ready(db, now))) return { status: 'not_ready' };
  try {
    const n = await db.$executeRawUnsafe(INSERT_OFFLINE_PLAY, randomUUID(), userId, r.runKey, r.mode, r.score, r.won, r.durationSec, r.playedAt);
    return { status: n > 0 ? 'recorded' : 'already' };
  } catch (e) {
    probe.fail('offline_play_insert_failed', e, now);
    return { status: 'failed' };
  }
}
