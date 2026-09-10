/**
 * lib/mastery/mastery-service.ts
 * ==============================
 * M13 Step 3 — Mastery tiers (server-authoritative).
 *
 * Pure math lives in mastery-core.ts (verified): a rolling 10-sample window,
 * min 3 samples, tiers never decay. This service rehydrates the core from the
 * ModeMastery row, records one graded sample, persists the new snapshot, and
 * emits a mastery-up telemetry event for feedback parity.
 *
 * Because different modes expose different quality signals, deriveMasteryInput
 * maps a finished GameSession to the right metric contract + a normalized raw
 * value. All constants are TUNE(elijah).
 */

import { prisma } from '@/lib/db';
import { recordServerEvent } from '@/lib/analytics-server';
import { MasteryCore, type MasteryModeState, type MasteryUpEvent } from './mastery-core';
import { buildLadder, type Ladder } from './mastery-ladder';

export interface SessionSignal {
  mode: string;
  score: number;
  won: boolean;
  hits?: number;
  misses?: number;
  maxCombo?: number;
}

/** Map an FEL play-mode + its session to a mastery metric key and raw value. */
export function deriveMasteryInput(sig: SessionSignal): { metricKey: string; raw: number } {
  const hits = Math.max(0, sig.hits ?? 0);
  const misses = Math.max(0, sig.misses ?? 0);
  const attempts = hits + misses;
  // A bounded [0,1] per-session quality used by the generic + derived signals.
  const quality = Math.max(
    0,
    Math.min(1, (sig.won ? 0.5 : 0) + Math.min(0.4, sig.score / 200) + Math.min(0.1, (sig.maxCombo ?? 0) / 50)),
  );
  // The core selects the metric contract by mode key (falling back to
  // `generic` for modes without a bespoke contract), so `raw` is shaped to
  // match whatever contract THIS mode key resolves to inside the core.
  switch (sig.mode) {
    case 'dunkContest':
      // dunkContest.toScore expects an avg judge card in [5,10] -> quality.
      return { metricKey: 'dunkContest', raw: 5 + 5 * quality };
    case 'threePoint':
      // threePoint.toScore expects a green rate in [0,1].
      return { metricKey: 'threePoint', raw: attempts > 0 ? hits / attempts : quality };
    case 'hoops1v1':
      // hoops1v1.toScore expects a win-streak-like value; scale quality to /10.
      return { metricKey: 'hoops1v1', raw: quality * 10 };
    default:
      // Every other mode resolves to the generic contract (toScore = identity).
      return { metricKey: 'generic', raw: quality };
  }
}

export interface RecordMasteryResult {
  mode: string;
  metricKey: string;
  avg: number;
  tier: string;
  tierIndex: number;
  events: MasteryUpEvent[];
}

/** Record one graded session for mastery. Best-effort at the call site. */
export async function recordMastery(userId: string, sig: SessionSignal): Promise<RecordMasteryResult> {
  const { metricKey, raw } = deriveMasteryInput(sig);
  const row = await prisma.modeMastery.findUnique({ where: { userId_mode: { userId, mode: sig.mode } } });
  const persisted: number[] = row && Array.isArray(row.samples) ? (row.samples as number[]) : [];
  const state: Record<string, MasteryModeState> = {
    [sig.mode]: { samples: persisted, tier: row?.tier ?? 0 },
  };
  // Samples are keyed by the play-mode; the core routes to the right metric
  // contract by that same key (unknown modes -> generic identity contract).
  const core = new MasteryCore(state);
  const res = core.record(sig.mode, raw);
  const snap = core.state[sig.mode];

  await prisma.modeMastery.upsert({
    where: { userId_mode: { userId, mode: sig.mode } },
    update: { samples: snap.samples as any, tier: snap.tier, updatedAt: new Date() },
    create: { userId, mode: sig.mode, samples: snap.samples as any, tier: snap.tier },
  });

  for (const ev of res.events) {
    await recordServerEvent({
      name: 'mastery_up',
      userId,
      props: { mode: sig.mode, tier: ev.tier, metricKey },
    });
  }

  return { mode: sig.mode, metricKey, avg: res.avg, tier: res.tier, tierIndex: res.tierIndex, events: res.events };
}

/** Full mastery map for an athlete (hub cards + profile badges). */
export async function getMasteryMap(userId: string): Promise<Record<string, { tier: string; tierIndex: number }>> {
  const rows = await prisma.modeMastery.findMany({ where: { userId } });
  const out: Record<string, { tier: string; tierIndex: number }> = {};
  const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Venice Legend'];
  for (const r of rows) {
    out[r.mode] = { tier: r.tier ? TIERS[r.tier - 1] : 'Unranked', tierIndex: r.tier };
  }
  return out;
}

/**
 * Full ladder read for the athlete-facing progression page: per-mode tier,
 * position inside the band, form trend and what moves it next. Derived
 * entirely from the persisted snapshots — see mastery-ladder.ts.
 */
export async function getMasteryLadder(userId: string): Promise<Ladder> {
  const rows = await prisma.modeMastery.findMany({ where: { userId } });
  const snapshots: Record<string, MasteryModeState> = {};
  for (const r of rows) {
    snapshots[r.mode] = {
      samples: Array.isArray(r.samples) ? (r.samples as number[]) : [],
      tier: r.tier ?? 0,
    };
  }
  return buildLadder(snapshots);
}
