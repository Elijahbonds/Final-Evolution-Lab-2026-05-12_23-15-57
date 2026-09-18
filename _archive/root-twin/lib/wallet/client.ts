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
  granted: { coins: number; shards: number };
  balances: { coins: number; shards: number };
  capped?: boolean;
}

/**
 * Silent balance-sync event (no reward toast). Dispatched after a SPEND or any
 * other action that changes the balance without an "earn". The HUD applies the
 * fresh server balances but does not pop a "+N" toast.
 */
export const WALLET_SYNC_EVENT = 'fel:wallet-sync';

export interface WalletSyncDetail {
  balances: { coins: number; shards: number };
}

/** Broadcast fresh server balances to any mounted HUD (no toast). */
export function syncWalletBalances(balances: { coins: number; shards: number }): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<WalletSyncDetail>(WALLET_SYNC_EVENT, { detail: { balances } }));
}

/** Fire-and-forget earn report. Resolves to true on 2xx, false otherwise. */
export async function reportEarn(report: EarnReport): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/wallet/earn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    });
    if (!res.ok) return false;
    // Best-effort: broadcast the grant so the HUD can react. Never throw.
    try {
      const data = await res.json();
      const granted = {
        coins: Number(data?.granted?.coins ?? 0),
        shards: Number(data?.granted?.shards ?? 0),
      };
      const balances = {
        coins: Number(data?.balances?.coins ?? 0),
        shards: Number(data?.balances?.shards ?? 0),
      };
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent<WalletEarnDetail>(WALLET_EARN_EVENT, {
            detail: { granted, balances, capped: !!data?.capped },
          }),
        );
      }
    } catch {
      /* response body optional — a bare 2xx is still a success */
    }
    return true;
  } catch {
    return false; // Never surface a wallet failure into the game loop.
  }
}
