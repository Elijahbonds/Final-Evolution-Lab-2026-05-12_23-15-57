export const PRQ_ATTRS = [
  'strength',
  'speed',
  'endurance',
  'agility',
  'power',
  'flexibility',
  'recovery',
  'mental',
] as const;

export type PrqAttr = (typeof PRQ_ATTRS)[number];

/**
 * PrqEntry.source for a reading the body camera ESTIMATED (movement play, 2026-09-24): the jump a player makes in front
 * of the camera, timed off the pose stream. It lives here, in the pure leaf, because the shield readers
 * (scanToSnapshot, camp deltas) must not import the Prisma-bound lib/prq-entries to ask about it.
 */
export const PRQ_CAMERA_SOURCE = 'camera';

/**
 * Sources that are estimates. They feed the PRQ vector (the owner: "the measured jump height feeds PRQ power as a
 * camera estimate"), and nothing that grants the verified shield may stand on them ("never the verified shield").
 */
export const PRQ_ESTIMATE_SOURCES: readonly string[] = [PRQ_CAMERA_SOURCE];

export function isPrqEstimate(source: string | null | undefined): boolean {
  return typeof source === 'string' && PRQ_ESTIMATE_SOURCES.includes(source);
}

export interface PrqGrade {
  key: 'ELITE' | 'PRIMED' | 'READY' | 'RECOVERING';
  label: string;
  color: string;
  speedMult: number;
  hangBonus: number;
}

export function prqScore(attrs: Record<string, number> | null | undefined): number {
  if (!attrs) return 0;
  const vals = PRQ_ATTRS.map((a) => Number(attrs?.[a] ?? 0));
  const sum = vals.reduce((s, v) => s + (isFinite(v) ? v : 0), 0);
  return Math.round((sum / (PRQ_ATTRS.length || 1)) * 10) / 10;
}

export function prqGrade(score: number | null | undefined): PrqGrade {
  const s = score ?? 0;
  if (s >= 80) return { key: 'ELITE', label: 'ELITE', color: '#A855F7', speedMult: 1.15, hangBonus: 0.3 };
  if (s >= 60) return { key: 'PRIMED', label: 'PRIMED', color: '#00E5FF', speedMult: 1.05, hangBonus: 0.15 };
  if (s >= 40) return { key: 'READY', label: 'READY', color: '#00FF9D', speedMult: 1.0, hangBonus: 0 };
  return { key: 'RECOVERING', label: 'RECOVERING', color: '#FFD700', speedMult: 0.9, hangBonus: -0.1 };
}

export const MODE_WEIGHTS: Record<string, number> = {
  karateEndless: 1.0,
  dunkContest: 1.0,
  tennis: 0.9,
  brainBrawl: 0.8,
  skateboarding: 1.0,
  soccer: 1.1,
  baseball: 1.0,
  snowboarding: 1.0,
  surfing: 1.0,
  golf: 0.9,
  freerun: 1.1,
  training: 1.0,
  hoops1v1: 1.0,
  hoops3v3: 1.0,
  threePoint: 0.9,
  karateVersus: 1.1,
  whoSceneIt: 0.8,
  bigAir: 1.0,
  tiebreak: 0.9,
  sprint: 1.0,
  storyMode: 1.2,
};

// Attributes each mode primarily trains
export const MODE_ATTRS: Record<string, PrqAttr[]> = {
  karateEndless: ['strength', 'agility', 'endurance', 'mental'],
  dunkContest: ['power', 'speed', 'flexibility'],
  tennis: ['agility', 'speed', 'endurance'],
  brainBrawl: ['mental', 'recovery'],
  skateboarding: ['agility', 'flexibility', 'mental'],
  soccer: ['power', 'agility', 'mental'],
  baseball: ['strength', 'power', 'speed'],
  snowboarding: ['agility', 'speed', 'mental'],
  surfing: ['flexibility', 'endurance', 'mental'],
  golf: ['mental', 'flexibility', 'power'],
  freerun: ['agility', 'power', 'flexibility'],
  training: ['strength', 'endurance', 'recovery'],
  hoops1v1: ['agility', 'power', 'mental'],
  hoops3v3: ['mental', 'agility', 'endurance'],
  threePoint: ['mental', 'flexibility', 'speed'],
  karateVersus: ['strength', 'agility', 'mental'],
  whoSceneIt: ['mental', 'recovery'],
  bigAir: ['power', 'agility', 'flexibility'],
  tiebreak: ['speed', 'agility', 'mental'],
  sprint: ['speed', 'power', 'endurance'],
  storyMode: ['strength', 'speed', 'agility', 'power', 'mental'],
  // MUSIC-SUITE P2 (2026-09-25): neither room had a row, so both fell back to ['mental'] (app/api/sessions/route.ts:81) —
  // a dance run never touched the body it moves. The plan's default (PLAN.md "Defaults taken without asking"): the Cypher
  // trains agility + mental, the Groove Academy mental.
  dance: ['agility', 'mental'],
  music: ['mental'],
};

/**
 * MUSIC-SUITE P2 (2026-09-25): the rooms whose PRQ gain is scaled by the run's ACCURACY (0..1), not by its score.
 *
 * computePrqDelta reads `min(score / 10, 10)`, which saturates at a score of 100. A dance step pays 300 + combo × 5 and a
 * music hit 100 × (1 + floor(combo / 5)), so ONE clean dance step or one music hit already earned the full PRQ gain — a
 * D-grade set trained exactly as much as an S. For these two, the gain is accuracy × the same 0-10 band (a flawless set =
 * the saturated score's 10), read by the server from the room's own counts (lib/session-payout.ts sessionAccuracy). No
 * counts, no accuracy, no gain: the saturating score is exactly what this replaces.
 *
 * MUSIC-SUITE P2 FIX PASS (2026-09-25): except while the shell cannot send counts at all. game-shell.tsx does not forward
 * the room's stats yet (a held file), so "no counts, no gain" took every dance run's PRQ from ~0.96 to 0 and every music
 * run's with it. `whenNoAccuracy: 'score'` (the route passes it while session-payout ROOM_STATS_FORWARDED is false)
 * keeps the old score path for a session that arrived without counts; the default stays 'none'.
 */
export const ACCURACY_PRQ_MODES: readonly string[] = ['dance', 'music'];

export function computePrqDelta(opts: {
  mode: string;
  score: number;
  won: boolean;
  duration: number;
  /** 0..1, for ACCURACY_PRQ_MODES only (null/absent there = no gain, unless whenNoAccuracy says 'score'); ignored by every other mode. */
  accuracy?: number | null;
  /** ACCURACY_PRQ_MODES with no accuracy: 'none' (no gain, the default) or 'score' (the pre-P2 score path: a legacy client). */
  whenNoAccuracy?: 'none' | 'score';
}): number {
  const weight = MODE_WEIGHTS?.[opts?.mode] ?? 0.8;
  const completionBonus = opts?.won ? 1.2 : 1.0;
  const timeFactor = Math.min(Math.max((opts?.duration ?? 0) / 120, 0.25), 1);
  // normalize score to a 0-10 band so deltas stay sane across modes (the rooms: accuracy onto the same band)
  const acc = opts?.accuracy;
  const byScore = Math.min((opts?.score ?? 0) / 10, 10);
  const hasAcc = typeof acc === 'number' && Number.isFinite(acc);
  const normScore = ACCURACY_PRQ_MODES.includes(opts?.mode)
    ? (hasAcc ? Math.max(0, Math.min(1, acc as number)) * 10 : acc == null && opts?.whenNoAccuracy === 'score' ? byScore : 0)
    : byScore;
  const delta = normScore * 0.1 * weight * completionBonus * timeFactor;
  return Math.round(Math.min(delta, 2.5) * 100) / 100;
}
