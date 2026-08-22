// lib/feel/camera-kick.ts
// FEL Phase 5 — Shared CAMERA KICK (impact swing).
//
// A punch that lands should be FELT in the lens: the camera jolts a few cm in
// the hit direction and rolls a touch, then springs back. Modelled as a
// critically-ish damped spring so it always settles to rest — no drift, no
// runaway. Render-agnostic: returns offsets the camera rig adds after lookAt.
//
// PURE + deterministic. Imported by the live component AND the headless test.
// All feel magnitudes // TUNE(elijah).

export interface CameraKick {
  offX: number; offY: number; roll: number;   // current applied offset (m, m, rad)
  vX: number; vY: number; vR: number;         // spring velocities
}

export const KICK = {
  STIFFNESS: 180,     // TUNE(elijah) — spring constant (higher = snappier return)
  DAMPING: 22,       // TUNE(elijah) — velocity damping (higher = less overshoot)
  POS_IMPULSE: 0.22,  // TUNE(elijah) — metres of shove per unit magnitude
  ROLL_IMPULSE: 0.05, // TUNE(elijah) — radians of roll per unit magnitude
  REST_EPS: 1e-4,    // below this the kick is considered at rest
} as const;

export function createCameraKick(): CameraKick {
  return { offX: 0, offY: 0, roll: 0, vX: 0, vY: 0, vR: 0 };
}

// Apply an impulse. `dirX` in -1..1 (hit direction along screen-X), `mag` 0..1
// scales the whole jolt (a KO kicks harder than a jab).
export function triggerKick(s: CameraKick, dirX: number, mag = 1): void {
  const m = Math.max(0, mag);
  const d = Math.max(-1, Math.min(1, dirX));
  s.vX += d * KICK.POS_IMPULSE * m * KICK.STIFFNESS * 0.1;
  s.vY += KICK.POS_IMPULSE * m * KICK.STIFFNESS * 0.06;   // slight upward pop
  s.vR += -d * KICK.ROLL_IMPULSE * m * KICK.STIFFNESS * 0.1; // roll away from hit
}

// Advance the spring by real dt. Sub-steps for stability at large dt.
export function updateCameraKick(s: CameraKick, dt: number): void {
  if (s.offX === 0 && s.offY === 0 && s.roll === 0 && s.vX === 0 && s.vY === 0 && s.vR === 0) return;
  const steps = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    // a = -k*x - c*v  (damped harmonic oscillator)
    const aX = -KICK.STIFFNESS * s.offX - KICK.DAMPING * s.vX;
    const aY = -KICK.STIFFNESS * s.offY - KICK.DAMPING * s.vY;
    const aR = -KICK.STIFFNESS * s.roll - KICK.DAMPING * s.vR;
    s.vX += aX * h; s.vY += aY * h; s.vR += aR * h;
    s.offX += s.vX * h; s.offY += s.vY * h; s.roll += s.vR * h;
  }
  // Snap to rest once energy is negligible (prevents perpetual micro-jitter).
  if (Math.abs(s.offX) < KICK.REST_EPS && Math.abs(s.vX) < KICK.REST_EPS &&
      Math.abs(s.offY) < KICK.REST_EPS && Math.abs(s.vY) < KICK.REST_EPS &&
      Math.abs(s.roll) < KICK.REST_EPS && Math.abs(s.vR) < KICK.REST_EPS) {
    s.offX = 0; s.offY = 0; s.roll = 0; s.vX = 0; s.vY = 0; s.vR = 0;
  }
}

// Total mechanical energy proxy (potential k*x^2 + kinetic v^2) — used by tests
// to prove the damped spring dissipates. Potential is stiffness-weighted so the
// proxy tracks true energy and decays monotonically as velocity converts to
// displacement and back.
export function kickEnergy(s: CameraKick): number {
  const k = KICK.STIFFNESS;
  return k * (s.offX * s.offX + s.offY * s.offY + s.roll * s.roll) +
         (s.vX * s.vX + s.vY * s.vY + s.vR * s.vR);
}
