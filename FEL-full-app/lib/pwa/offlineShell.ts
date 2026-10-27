// Offline play inside a game (offline-push, round 8, 2026-10-26): what components/games/game-shell.tsx needs when there
// is no signal. Three small seams, so the shell (a caution file) changes by a few lines:
//
//   1. rememberOfflineProfile — every time /api/profile answers, the few fields the shell needs to start a game (the
//      account id, PRQ, grade, the badge's display) are kept on this device;
//   2. offlineProfile — when /api/profile cannot be reached at all (a network error, not an answer), offline play is on
//      and the page is not a ranked, staked or Arena play, the shell starts the game from that copy instead of saying
//      "Can't reach the server";
//   3. queueOfflineRun + offlineAnswer — a run with no server run (the start could not reach the server) is queued in
//      lib/offline-cache.ts under the account that played it, and the end card says it was played offline and will be
//      added to the history (unpaidCopy PLAYED_OFFLINE). components/offline/offline-sync.tsx sends it when the signal is
//      back, to POST /api/offline/results, as practice: never paid (that route's header says why).
//
// Everything here is OFF unless NEXT_PUBLIC_OFFLINE_PLAY_ENABLED is on (read literally, so Next inlines it).
import { getSessionResultQueue } from '@/lib/offline-cache';
import { needsServer, offlinePlayOn } from './offlinePlay';

export const OFFLINE_PROFILE_KEY = 'fel-offline-profile';
/** A window event: an offline run was queued (detail: { mode }); the banner says so. */
export const OFFLINE_QUEUED_EVENT = 'fel-offline-queued';
/** The end card's reason for a run played offline (lib/sessions/unpaidCopy.ts). */
export const PLAYED_OFFLINE = 'PLAYED_OFFLINE';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;

export function offlineEnabled(): boolean {
  return offlinePlayOn(process.env.NEXT_PUBLIC_OFFLINE_PLAY_ENABLED);
}

const deviceStore = (): Store => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** What the shell keeps: exactly the /api/profile fields it reads to start a game, and nothing else. */
export interface OfflineProfile {
  userId: string;
  prq: number;
  grade: { key: string; label: string; color: string; speedMult: number; hangBonus: number };
  prqDisplay?: { score?: number | null; measured?: number; total?: number };
}

function shape(j: unknown): OfflineProfile | null {
  const p = j as { profile?: { userId?: unknown }; userId?: unknown; prq?: unknown; grade?: Record<string, unknown>; prqDisplay?: unknown } | null;
  const userId = typeof p?.profile?.userId === 'string' ? p.profile.userId : typeof p?.userId === 'string' ? p.userId : null;
  const g = p?.grade;
  if (!userId || !g || typeof g !== 'object') return null;
  if (typeof g.key !== 'string' || typeof g.label !== 'string' || typeof g.color !== 'string') return null;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const d = p?.prqDisplay as OfflineProfile['prqDisplay'] | undefined;
  return {
    userId,
    prq: num(p?.prq, 50),
    grade: { key: g.key, label: g.label, color: g.color, speedMult: num(g.speedMult, 1), hangBonus: num(g.hangBonus, 0) },
    ...(d && typeof d === 'object' ? { prqDisplay: { score: typeof d.score === 'number' ? d.score : null, measured: num(d.measured, 0), total: num(d.total, 0) } } : {}),
  };
}

/** /api/profile answered: keep what a game needs to start offline next time. A no-op with offline play off. */
export function rememberOfflineProfile(j: unknown, st: Store = deviceStore(), on = offlineEnabled()): void {
  if (!on) return;
  const p = shape(j);
  if (!p) return;
  try { st?.setItem(OFFLINE_PROFILE_KEY, JSON.stringify(p)); } catch { /* storage full or blocked: no offline start */ }
}

/** The kept profile, when a game may start from it: offline play on, and not a play that needs the server. */
export function offlineProfile(search: string, st: Store = deviceStore(), on = offlineEnabled()): OfflineProfile | null {
  if (!on || needsServer(search)) return null;
  try { return shape(JSON.parse(st?.getItem(OFFLINE_PROFILE_KEY) ?? 'null')); } catch { return null; }
}

/** Signed out (or someone else signed in): the kept profile goes. */
export function forgetOfflineProfile(st: Store = deviceStore()): void {
  try { st?.removeItem(OFFLINE_PROFILE_KEY); } catch { /* nothing to remove */ }
}

/** The browser says there is no network. */
export function isOfflineNow(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** The run the shell finished, as far as the queue needs it. */
export interface OfflineRun { score?: number; won?: boolean; duration?: number }

/**
 * Queue a run that had no server run, under the account that played it. False (nothing queued) with offline play off,
 * with no account, or on a ranked, staked or Arena play. `duration` is the room's own seconds (GameResult.duration).
 */
export function queueOfflineRun(mode: string, run: OfflineRun | null | undefined, userId: string | null, search: string,
  now: number = Date.now(), on = offlineEnabled()): boolean {
  if (!on || !userId || !mode || needsServer(search)) return false;
  const seconds = Number(run?.duration);
  getSessionResultQueue().enqueue({
    mode,
    score: Math.max(0, Math.round(Number(run?.score) || 0)),
    won: Boolean(run?.won),
    completedAt: new Date(now).toISOString(),
    durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0,
  }, userId);
  try { window.dispatchEvent(new CustomEvent(OFFLINE_QUEUED_EVENT, { detail: { mode } })); } catch { /* no window */ }
  return true;
}

/**
 * The answer the shell's finish chain reads for a queued offline run, in /api/sessions' shape: a decided refusal with
 * reason PLAYED_OFFLINE, so the card says "played offline" and nothing else in the chain (Story, Arena, challenges)
 * runs. Nothing was sent anywhere.
 */
export function offlineAnswer(): Response {
  return new Response(JSON.stringify({ ok: false, paid: false, reason: PLAYED_OFFLINE }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
