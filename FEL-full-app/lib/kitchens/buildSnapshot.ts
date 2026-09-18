// FEL Kitchens — the READ-ONLY upstream. Your Build's store (`BuildStore`, `MovementSignature`, `BuildRx`) lives in the
// Vite twin, not on this disk, so Kitchens reads a small snapshot with the same field meanings, built from what this
// tree does have: the PRQ (lib/prq.ts, 0–100) and the movement screen (lib/workout/movement-screen.ts). Nothing here
// writes to either. When BuildStore lands, `snapshotFromBuildStore` replaces `snapshotFromTree` and the rest holds.

import { analyzeMovement, defaultMetrics, type MovementMetrics, type Pillar, type ScreenResult } from '@/lib/workout/movement-screen';
import type { LeakId } from './types';

export interface BuildSnapshot {
  /** MovementSignature.scanDate — the KitchenStore key. */
  scanDate: string;
  /** 0–1 (the soft prep's scale). This tree's PRQ is 0–100 and is divided by 100. */
  prqScore: number;
  leak: LeakId;
  leakLabel: string;
  /** Optional radar-style weights (0–100) for secondary theme bias. */
  pillars?: Partial<Record<Pillar, number>>;
  disclaimer?: string;
}

export const LEAK_LABEL: Record<LeakId, string> = {
  'mid-back': 'Mid-back',
  'knee-valgus': 'Knee valgus',
  'hip-drop': 'Hip drop',
  ankle: 'Ankle',
};

/**
 * Owner decision (2026-09-05): the movement screen is the leak source until a Mirror scan is wired. Valgus above 0.45 on either knee → knee-valgus;
 * asymmetry above 12 % → hip-drop; otherwise the weakest pillar decides.
 */
export function leakFromScreen(metrics: MovementMetrics, screen: ScreenResult): LeakId {
  if (Math.max(metrics.valgusL, metrics.valgusR) > 0.45) return 'knee-valgus';
  if (metrics.asymmetryPct > 12) return 'hip-drop';
  switch (screen.weakest) {
    case 'mobility': return 'mid-back';
    case 'stability': return 'knee-valgus';
    case 'symmetry': return 'hip-drop';
    default: return 'ankle'; // posture / power / cadence — landing mechanics
  }
}

/** Build the read-only snapshot from what this tree holds. `prq0to100` is `/api/profile`'s `prq`. */
export function snapshotFromTree(input: { prq0to100: number; metrics?: MovementMetrics; scanDate?: string; disclaimer?: string }): BuildSnapshot {
  const metrics = input.metrics ?? defaultMetrics();
  const screen = analyzeMovement(metrics);
  const leak = leakFromScreen(metrics, screen);
  return {
    scanDate: input.scanDate ?? new Date().toISOString().slice(0, 10),
    prqScore: Math.max(0, Math.min(1, (Number(input.prq0to100) || 0) / 100)),
    leak,
    leakLabel: LEAK_LABEL[leak],
    pillars: screen.pillars,
    disclaimer: input.disclaimer,
  };
}
