// A stand-in wallet ledger for the Playbook rewards (EDU-LINKS, 2026-10-07). It behaves as
// lib/wallet/wallet-service.ts grantServerReward does: the amount comes from the reason's rule (DEFAULT_REWARD_RULES via
// computeGrant), and a key already in the ledger returns the ORIGINAL entry — the same delta, nothing new written.
import type { RewardDeps } from '@/lib/education/rewards';
import { DEFAULT_REWARD_RULES, computeGrant } from '@/lib/wallet/reward-rules';

export function fakeLedger() {
  const rows = new Map<string, { playerId: string; reasonCode: string; delta: number }>();
  const calls: string[] = [];
  const deps: RewardDeps = {
    grant: async (a) => {
      calls.push(a.idempotencyKey);
      const prior = rows.get(a.idempotencyKey);
      const delta = prior ? prior.delta : computeGrant(DEFAULT_REWARD_RULES[a.reasonCode], {});
      if (!prior) rows.set(a.idempotencyKey, { playerId: a.playerId, reasonCode: a.reasonCode, delta });
      return { granted: { coins: 0, shards: delta } };
    },
    paidKeys: async (keys) => new Set(keys.filter((k) => rows.has(k))),
  };
  const shards = (playerId: string) => [...rows.values()].filter((r) => r.playerId === playerId).reduce((n, r) => n + r.delta, 0);
  return { deps, rows, calls, shards };
}
