/**
 * lib/workout/movement-screen.ts
 * ==============================
 * PURE movement-screen analysis. Input = numeric metrics derived on the client
 * from a MediaPipe keypoint timeline (raw video never leaves the device). Output
 * = normalized 0..100 pillar scores + the single weakest pillar that the plan
 * generator targets. No THREE, no window/document — unit-testable.
 */

export interface MovementMetrics {
  jumpHeightCm: number;   // countermovement jump height
  depthDeg: number;       // squat/landing knee flexion depth (deg)
  asymmetryPct: number;   // L/R loading asymmetry (0 = symmetric)
  valgusL: number;        // knee valgus collapse left (0 clean .. 1 severe)
  valgusR: number;        // knee valgus collapse right
  cadenceSpm: number;     // running cadence (steps/min) if captured
  trunkLeanDeg: number;   // forward trunk lean at landing
}

export type Pillar = 'power' | 'mobility' | 'symmetry' | 'stability' | 'cadence' | 'posture';

export interface ScreenResult {
  pillars: Record<Pillar, number>; // 0..100, higher = better
  weakest: Pillar;
  overall: number;
  flags: string[]; // human-readable coaching flags
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function defaultMetrics(): MovementMetrics {
  return { jumpHeightCm: 40, depthDeg: 90, asymmetryPct: 6, valgusL: 0.15, valgusR: 0.15, cadenceSpm: 168, trunkLeanDeg: 18 };
}

export function analyzeMovement(m: MovementMetrics): ScreenResult {
  // TUNE(elijah) — mapping of raw metrics to 0..100 pillar scores.
  const power = clamp((m.jumpHeightCm / 75) * 100);                 // 75cm ~ elite
  const mobility = clamp(((m.depthDeg - 60) / (120 - 60)) * 100);   // deeper = better range
  const symmetry = clamp(100 - m.asymmetryPct * 6);                 // 0% => 100
  const stability = clamp(100 - ((m.valgusL + m.valgusR) / 2) * 130);
  const cadence = clamp(100 - Math.abs(m.cadenceSpm - 180) * 1.4);  // 180spm ideal
  const posture = clamp(100 - Math.abs(m.trunkLeanDeg - 10) * 3);   // ~10deg ideal

  const pillars: Record<Pillar, number> = { power, mobility, symmetry, stability, cadence, posture };

  let weakest: Pillar = 'power';
  let lo = Infinity;
  (Object.keys(pillars) as Pillar[]).forEach((p) => { if (pillars[p] < lo) { lo = pillars[p]; weakest = p; } });

  const overall = Math.round((power + mobility + symmetry + stability + cadence + posture) / 6);

  const flags: string[] = [];
  if (stability < 55) flags.push('Knee valgus under load — prioritize eccentric control + hip abduction.');
  if (symmetry < 60) flags.push('Left/right asymmetry detected — unilateral corrective work indicated.');
  if (mobility < 55) flags.push('Limited squat depth — ankle/hip mobility drills before loading.');
  if (power < 50) flags.push('Power output below target — plyometric progression from the ground up.');
  if (flags.length === 0) flags.push('Clean movement signature — progress load and complexity.');

  return { pillars, weakest, overall, flags };
}

export const PILLAR_LABELS: Record<Pillar, string> = {
  power: 'Explosive Power', mobility: 'Mobility & Range', symmetry: 'L/R Symmetry',
  stability: 'Joint Stability', cadence: 'Running Cadence', posture: 'Postural Control',
};

/**
 * The WorkoutScan kinds POST /api/v1/workout/scan may write (MIRROR-COACH P3 review, 2026-09-26). The route stored
 * `kind = body.kind` — any string — with the client's metrics, so a signed-in user could write a `mirror_screen` row
 * carrying `gradedBy: 'server'`, `provisional: false` and seven clean camera results: the coach's panel then read a clean,
 * "server-checked" screen (lib/coach/mirrorToProgram.ts coachDraft), triage cleared the stale-scan flag
 * (lib/coach/attention.ts isScanEquivalentScreen), and the future load gate would have unlocked on it — the server
 * regrade (app/api/mirror/screen) skipped entirely. Every other kind has its own writer (the Mirror's screen route, the
 * dunk log, lib/move/formWrite.ts), and no client posts any kind here but the default.
 */
export const SCAN_ROUTE_KINDS: readonly string[] = ['movement_screen'];

/** The kind the scan route writes for a posted body, or null when the posted kind is not one it may write. */
export function scanRouteKind(posted: unknown): string | null {
  if (posted === undefined || posted === null) return SCAN_ROUTE_KINDS[0];
  return typeof posted === 'string' && SCAN_ROUTE_KINDS.includes(posted) ? posted : null;
}
