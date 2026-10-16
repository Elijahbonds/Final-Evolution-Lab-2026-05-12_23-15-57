// TIER-SERVER (QA top-5 #5, PM ruling 2026-10-15): the opponent tier of a run is the SERVER's, recorded when the run starts.
//
// The tier lived only in the browser (readTier / tierForRun), so one side of a staked duel could play ROOKIE. Now
// /api/sessions/start records it in the run's existing `result` JSON (no new column): PRO whenever the start names a
// head-to-head (arenaMatchId, mp, c), whatever the client picked; otherwise the player's pick. The finish keeps it (every
// write of the stored answer carries it over, so a finish cannot replace it), a finish that claims another tier on a staked
// run is refused, and an Arena duel settles only on a run whose server tier is PRO (lib/arena-duel-run.ts).
import { TIERS, type Tier } from '@/lib/babylon/core/Difficulty';

export const STAKED_TIER: Tier = 'pro';
const HEAD_TO_HEAD_KEYS = ['arenaMatchId', 'mp', 'c'] as const;

export function isTier(v: unknown): v is Tier {
  return typeof v === 'string' && (TIERS as readonly string[]).includes(v);
}

/** The start body names a head-to-head run (a staked duel, an async challenge, a challenge link). */
export function headToHeadStart(body: unknown): boolean {
  const b = (body ?? {}) as Record<string, unknown>;
  return HEAD_TO_HEAD_KEYS.some((k) => typeof b[k] === 'string' && (b[k] as string).length > 0);
}

/** The tier the server records at start: PRO on any head-to-head run (the client's pick is not read), else the pick. */
export function serverTierFor(body: unknown): { tier: Tier | null; staked: boolean } {
  const staked = headToHeadStart(body);
  if (staked) return { tier: STAKED_TIER, staked };
  const picked = (body as Record<string, unknown> | null)?.tier;
  return { tier: isTier(picked) ? picked : null, staked };
}

/** The run's result JSON as written at start: only the tier, no answer yet (storedResult() reads it as none). */
export function startResult(t: { tier: Tier | null; staked: boolean }): { tier: Tier | null; staked: boolean } {
  return { tier: t.tier, staked: t.staked };
}

/** The server's tier copy off a run row (never the request's). */
export function runTierOf(run: { result?: unknown } | null | undefined): { tier: Tier | null; staked: boolean } {
  const r = run?.result as Record<string, unknown> | null | undefined;
  return { tier: isTier(r?.tier) ? (r!.tier as Tier) : null, staked: r?.staked === true };
}

/** A stored answer with the run's server tier carried over: a finish's write never drops or replaces it. */
export function keepTier<T extends object>(result: T, run: { result?: unknown } | null | undefined): T & { tier?: Tier | null; staked?: boolean } {
  const t = runTierOf(run);
  return { ...result, tier: t.tier, staked: t.staked };
}

/** A finish that names a tier other than the server's on a staked run is refused (null = fine). */
export function finishTierRefusal(run: { result?: unknown } | null | undefined, claimed: unknown): string | null {
  const t = runTierOf(run);
  if (!t.staked || claimed === undefined || claimed === null) return null;
  return claimed === t.tier ? null : 'TIER_MISMATCH';
}
