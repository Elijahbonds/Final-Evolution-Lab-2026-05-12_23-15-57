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
