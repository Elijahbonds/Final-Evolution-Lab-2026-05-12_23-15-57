/**
 * lib/feel/feel-config.ts
 * =======================
 * M9 — shared, mode-agnostic feel tunables.
 *
 * Direct TypeScript port of the proven Babylon.js engineering-line
 * `feelConfig` (FEEL_REFERENCE_SPEC §feelConfig). Every number here is
 * gameplay FEEL; all values // TUNE(elijah). Modes READ from this object;
 * they never redefine these locally. Per-mode overrides live in each mode's
 * own constants file and are merged on top via `mergeFeel()`.
 *
 * Pure data + pure math. No THREE / DOM.
 */

export interface GravityConfig {
  base: number;
  ascentScale: number;
  peakScale: number;
  descentScale: number;
  peakVelocityWindow: number;
}

export interface FeelConfig {
  timestepHz: number;
  maxAccumulatedMs: number;
  input: { bufferMs: number };
  movement: { runSpeed: number; accel: number; decel: number };
  jump: {
    impulse: number;
    prepMs: number;
    landingMs: number;
    approachSpeed: number;
  };
  gravity: GravityConfig;
  camera: {
    followWeight: number;
    followLerp: number;
    baseTargetY: number;
    airborneLift: number;
    fovStretchMax: number;
    fovLerp: number;
  };
  sensory: {
    bigLandingVy: number;
    landShake: number;
    slamShake: number;
    slamHitStopMs: number;
    bigLandHitStopMs: number;
    rumbleMs: number;
    crowdVolume: number;
  };
  dunkArc: {
    lockOnRadius: number;
    rimApproachY: number;
    apexBoostM: number;
    durationMs: number;
    rimStandoff: number;
  };
  court: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Proven reference values — ported verbatim from the engineering line. */
export const feelConfig: FeelConfig = {
  timestepHz: 60, // TUNE(elijah)
  maxAccumulatedMs: 250, // TUNE(elijah)

  input: {
    bufferMs: 150, // TUNE(elijah) — buffered-press window (landing jumps feel best ≥150)
  },

  movement: {
    runSpeed: 6.0, // TUNE(elijah) — m/s at full stick deflection
    accel: 30.0, // TUNE(elijah) — m/s² toward target velocity
    decel: 24.0, // TUNE(elijah) — m/s² when stick released
  },

  jump: {
    impulse: 4.6, // TUNE(elijah) — m/s vertical at takeoff (~1.2m apex)
    prepMs: 90, // TUNE(elijah) — JumpPrep crouch before takeoff
    landingMs: 140, // TUNE(elijah) — Landing recovery before next action
    approachSpeed: 1.5, // TUNE(elijah) — grounded speed that reads as "approach"
  },

  gravity: {
    base: 9.81,
    ascentScale: 0.8, // TUNE(elijah) — light rise
    peakScale: 0.35, // TUNE(elijah) — ≈0 = hang-time; EXACTLY 0 never falls
    descentScale: 2.0, // TUNE(elijah) — snaps down
    peakVelocityWindow: 0.9, // TUNE(elijah) — |vy| below this = "peak"
  },

  camera: {
    followWeight: 0.45, // TUNE(elijah)
    followLerp: 0.06, // TUNE(elijah)
    baseTargetY: 1.2, // TUNE(elijah)
    airborneLift: 0.55, // TUNE(elijah) — extra target lift per meter of jump height
    fovStretchMax: 0.12, // TUNE(elijah) — +12% FOV at full sprint
    fovLerp: 0.05, // TUNE(elijah)
  },

  sensory: {
    bigLandingVy: 3.5, // TUNE(elijah)
    landShake: 0.12, // TUNE(elijah)
    slamShake: 0.35, // TUNE(elijah)
    slamHitStopMs: 100, // TUNE(elijah)
    bigLandHitStopMs: 70, // TUNE(elijah)
    rumbleMs: 120, // TUNE(elijah)
    crowdVolume: 0.7, // TUNE(elijah)
  },

  dunkArc: {
    lockOnRadius: 4.5, // TUNE(elijah)
    rimApproachY: 1.35, // TUNE(elijah)
    apexBoostM: 0.4, // TUNE(elijah)
    durationMs: 620, // TUNE(elijah)
    rimStandoff: 0.55, // TUNE(elijah)
  },

  court: {
    minX: -7,
    maxX: 7,
    minZ: -13.5,
    maxZ: 13,
  },
};

/** Deep-merge a per-mode partial override on top of the shared feel config. */
export function mergeFeel(override?: DeepPartial<FeelConfig>): FeelConfig {
  if (!override) return feelConfig;
  return {
    ...feelConfig,
    ...override,
    input: { ...feelConfig.input, ...override.input },
    movement: { ...feelConfig.movement, ...override.movement },
    jump: { ...feelConfig.jump, ...override.jump },
    gravity: { ...feelConfig.gravity, ...override.gravity },
    camera: { ...feelConfig.camera, ...override.camera },
    sensory: { ...feelConfig.sensory, ...override.sensory },
    dunkArc: { ...feelConfig.dunkArc, ...override.dunkArc },
    court: { ...feelConfig.court, ...override.court },
  } as FeelConfig;
}

/**
 * Variable-gravity curve — the anti-floaty fix (FEEL_REFERENCE_SPEC §4).
 * Returns the gravity MULTIPLIER (× base) for the current vertical velocity:
 *   ascent   (vy > +window)  → ascentScale   (light rise)
 *   peak     (|vy| ≤ window)  → peakScale     (hang; keep near-zero, not zero)
 *   descent  (vy < -window)  → descentScale  (snaps down)
 * Centralized so every archetype core's vertical integrator shares the curve.
 */
export function gravityScaleForVy(vy: number, g: GravityConfig = feelConfig.gravity): number {
  if (vy > g.peakVelocityWindow) return g.ascentScale;
  if (vy < -g.peakVelocityWindow) return g.descentScale;
  return g.peakScale;
}

/** Effective downward acceleration (m/s², positive number) at velocity vy. */
export function gravityAccelForVy(vy: number, g: GravityConfig = feelConfig.gravity): number {
  return g.base * gravityScaleForVy(vy, g);
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export default feelConfig;
