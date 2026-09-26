/**
 * lib/wallet/client.ts — CLIENT-side earn reporter (browser only).
 *
 * The client NEVER computes or sends a currency amount. It reports a
 * performance EVENT (what happened) and the server decides the worth. This
 * helper is best-effort: a failed report must never block or crash gameplay.
 *
 * Everything money-related is decided server-side in
 * lib/wallet/wallet-service.ts + lib/wallet/reward-rules.ts.
 */
'use client';

export type DunkStyleLike = 'POWER' | 'FLASHY' | 'SIGNATURE';

const STYLE_FINISH: Record<DunkStyleLike, string> = {
  POWER: 'finish_tomahawk',
  FLASHY: 'finish_windmill',
  SIGNATURE: 'finish_360',
};

const COMBO_MIDS = ['spin_360', 'double_clutch', 'between_legs'];

/**
 * Build a legal trick chain (takeoff → optional mids → finish) describing an
 * attempt. This is only a description — the server re-validates it and clamps
 * the score to the chain ceiling, so an exaggerated chain cannot inflate pay.
 */
export function buildDunkChain(style: DunkStyleLike, combo: number): string[] {
  const mids = COMBO_MIDS.slice(0, Math.max(0, Math.min(3, Math.floor(combo))));
  return ['takeoff_a', ...mids, STYLE_FINISH[style] ?? 'finish_dunk'];
}

export function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `k_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export interface EarnReport {
  idempotency_key: string;
  event_type: string;
  payload: Record<string, unknown>;
}

/**
 * Browser event fired after a successful earn so any mounted HUD can refresh
 * its balance and pop a "+N coins / +N shards" reward toast. The detail carries
 * the SERVER-computed grant + fresh balances — the client never invents these.
 */
export const WALLET_EARN_EVENT = 'fel:wallet-earn';

export interface WalletEarnDetail {
  granted: { coins: number; shards: number; lc?: number };
  balances: { coins: number; shards: number; lc?: number };
  capped?: boolean;
}

/**
 * Silent balance-sync event (no reward toast). Dispatched after a SPEND or any
 * other action that changes the balance without an "earn". The HUD applies the
 * fresh server balances but does not pop a "+N" toast.
 */
export const WALLET_SYNC_EVENT = 'fel:wallet-sync';

export interface WalletSyncDetail {
  balances: { coins: number; shards: number; lc?: number };
}

/** Broadcast fresh server balances to any mounted HUD (no toast). */
export function syncWalletBalances(balances: { coins: number; shards: number }): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<WalletSyncDetail>(WALLET_SYNC_EVENT, { detail: { balances } }));
}

/** Fire-and-forget earn report. Resolves to true on 2xx, false otherwise. */
export async function reportEarn(report: EarnReport): Promise<boolean> {
  return (await postEarn(report)) !== null;
}

/** What a report was paid: the server's grant, and whether a rate or daily cap cut it (a zero grant, or part of one). */
export interface EarnGrant { coins: number; shards: number; capped: boolean }

/**
 * The same report, resolving to what the SERVER granted for it — null when the report failed or the server refused the event
 * (it refuses with a 200 whose `rejected` names why: run_already_paid, session_not_won, replay_detected…), a zero grant on a 2xx
 * whose body could not be read. A cap is not a refusal: it comes back `capped`, with the coins the cap left (often 0). For a
 * results card that shows the coins a run paid (BRAINBRAWL-POLISH-2 N10: the end card showed XP, shards, credits and PRQ, and
 * never the wallet coins that had just landed).
 */
export async function reportEarnGrant(report: EarnReport): Promise<EarnGrant | null> {
  const r = await postEarn(report);
  return r && !r.rejected ? { ...r.granted, capped: r.capped } : null;
}

/** One POST to /api/v1/wallet/earn — null on a non-2xx or a network failure. Never throws. */
async function postEarn(report: EarnReport): Promise<{ granted: { coins: number; shards: number }; capped: boolean; rejected: string | null } | null> {
  try {
    const res = await fetch('/api/v1/wallet/earn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    });
    if (!res.ok) return null;
    // Best-effort: broadcast the grant so the HUD can react. Never throw.
    const out = { granted: { coins: 0, shards: 0 }, capped: false, rejected: null as string | null };
    try {
      const data = await res.json();
      out.granted = {
        coins: Number(data?.granted?.coins ?? 0),
        shards: Number(data?.granted?.shards ?? 0),
      };
      out.capped = !!data?.capped;
      out.rejected = typeof data?.rejected === 'string' && data.rejected ? data.rejected : null;
      const balances = {
        coins: Number(data?.balances?.coins ?? 0),
        shards: Number(data?.balances?.shards ?? 0),
        lc: Number(data?.balances?.lc ?? 0),
      };
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent<WalletEarnDetail>(WALLET_EARN_EVENT, {
            detail: { granted: out.granted, balances, capped: out.capped },
          }),
        );
      }
    } catch {
      /* response body optional — a bare 2xx is still a success */
    }
    return out;
  } catch {
    return null; // Never surface a wallet failure into the game loop.
  }
}
