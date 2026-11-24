// arenaRun — the Physics Arena's sessions (owner 2026-11-24: "the arena counts for XP and progress"; docs/PHYSICS-ARENA-PLAN.md §8).
// The page starts a server run when a game starts (POST /api/sessions/start, the server's clock) and finishes it when the game ends,
// through the shell's own finish outbox (lib/sessions/finishOutbox.ts: saved first, retried, paid once by the server). The game's
// play log rides as `stats.arena`; the server rebuilds the score from it (lib/sessions/arenaScore.ts) and pays XP and progress
// only — no Lab Credits (owner 2026-11-24 c). Signed out, or with arena.xpOn 0, nothing is posted: a practice court.

import type { SessionResult } from '../core/sessionResult';
import { sendFinish, type FinishDeps } from '@/lib/sessions/finishOutbox';
import type { ArenaSessionKey } from '@/lib/sessions/arenaScore';

/** The arena's sports (the page's `?sport=`) and the session key each one's games are saved under. */
export const ARENA_SESSION_KEY: Readonly<Record<'hoops' | 'threes' | 'threepoint', ArenaSessionKey>> = {
  hoops: 'arenaHoops', threes: 'arenaThrees', threepoint: 'arenaThreePoint',
};

/** Start a server run for the next game. The run id, or null (signed out, offline, refused). `playtest` (the page's ?playtest=1,
 *  GameShell's own test) starts it unpaid: that is the one run where the feel panel's overrides apply (feel-panel/sessionGate), so
 *  a run with overrides never pays. `agent` (?agent=1) is an agent's run, unpaid too. */
export async function startArenaRun(key: ArenaSessionKey, o: { agent: boolean; playtest: boolean; fetch?: typeof fetch }): Promise<string | null> {
  const f = o.fetch ?? fetch;
  try {
    const r = await f(`/api/sessions/start${o.agent ? '?agent=1' : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: key, ...(o.playtest ? { playtest: true } : {}) }) });
    if (!r?.ok) return null;
    const j = await r.json();
    return typeof j?.runId === 'string' ? j.runId : null;
  } catch {
    return null;
  }
}

/** The finish's body for one ended game (the card the mode handed the page). The score and the win are claims the server checks. */
export function arenaFinishBody(runId: string, key: ArenaSessionKey, res: SessionResult): string {
  const d = (res.detail ?? {}) as { arena?: unknown; opponentScore?: unknown; won?: unknown };
  return JSON.stringify({
    runId, mode: key, score: res.score, opponentScore: typeof d.opponentScore === 'number' ? d.opponentScore : 0, won: d.won === true,
    duration: res.durationSec, played: true, stats: { arena: d.arena ?? null },
  });
}

export interface ArenaPayout { paid: boolean; xp: number; reason: string | null }

/** Finish the run with the game's card; what the server paid (or why not), or null when no answer came. */
export async function finishArenaRun(runId: string, key: ArenaSessionKey, res: SessionResult, deps: FinishDeps, store: Pick<Storage, 'getItem' | 'setItem'> | null): Promise<ArenaPayout | null> {
  const r = await sendFinish(store, runId, deps, Date.now(), arenaFinishBody(runId, key, res), null);
  if (!r) return null;
  try {
    const j = await r.json();
    return { paid: j?.paid === true, xp: Number.isFinite(j?.xp) ? Number(j.xp) : 0, reason: typeof j?.reason === 'string' ? j.reason : null };
  } catch {
    return null;
  }
}
