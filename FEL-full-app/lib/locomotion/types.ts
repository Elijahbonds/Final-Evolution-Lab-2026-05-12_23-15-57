// LOCOMOTION CORE — types (Phase 1, 2026-09-12).
//
// Phase 0 found eight independent movement systems with their own accel, decel and turn
// numbers (docs/audits/LOCOMOTION_AUDIT.md §1). This module is the single core they all
// consume. A mode contributes a PROFILE — data only. Adding a mode must never mean editing
// the core, so nothing in here branches on mode identity.

/** Movement direction and facing direction are SEPARATE values. Conflating them is the
 *  clunk Phase 0 catalogued at carnivalEvents.ts:294 and friends, where facing was written
 *  straight from velocity with no rate limit. */
export type FacingMode =
  | 'VELOCITY'      // board family, karts: you face where you travel
  | 'TARGET_LOCK'   // basketball, fights: you face the ball / basket / opponent
  | 'HYBRID';       // face travel while sprinting, target otherwise

/** Speed rings. A ring is a named band, not a clip: the blend space picks clips inside it. */
export type SpeedRing = 'idle' | 'shuffle' | 'jog' | 'sprint';

export type LocoState =
  | 'idle' | 'shuffle' | 'jog' | 'sprint'
  | 'turn' | 'plant' | 'slide' | 'backpedal';

/** Eight compass points per ring. Phase 0: the live clip set has three of these (forward
 *  run, strafe_left, strafe_right) and no diagonals at all, so most entries resolve to a
 *  neighbour until the clips are authored. That gap is content, not architecture. */
export type Dir8 = 'F' | 'FL' | 'FR' | 'L' | 'R' | 'BL' | 'BR' | 'B';

export interface RingClips {
  /** Clip id per compass point. A missing point falls back to its nearest authored neighbour. */
  readonly dirs: Partial<Record<Dir8, string>>;
  /** Speed at the centre of this ring (m/s). Blending between rings uses these. */
  readonly speed: number;
}

export interface LocomotionProfile {
  readonly id: string;
  readonly facingMode: FacingMode;
  /** m/s^2 toward the desired velocity. */
  readonly accel: number;
  /** m/s^2 when input releases. */
  readonly decel: number;
  /** Hard stop (plant) decel, m/s^2. */
  readonly plantDecel: number;
  readonly maxSpeed: number;
  /** Max heading change per second at TOP speed. Scales up as speed falls — a standing
   *  body may pivot freely, a sprinting one may not. */
  readonly maxTurnRateDegPerSec: number;
  /** Below this speed, a heading change beyond turnInPlaceThresholdDeg is a turn clip. */
  readonly turnInPlaceSpeed: number;
  readonly turnInPlaceThresholdDeg: number;
  /** A 180 at or above this speed must route through `plant` rather than snapping. */
  readonly plantCutSpeed: number;
  /** Lateral movement uses the slide ring rather than a forward run clip. */
  readonly slideRing?: RingClips;
  readonly rings: Readonly<Record<SpeedRing, RingClips>>;
  /** Minimum blend time between any two states (seconds). Never 0: no clip enters at full weight. */
  readonly minBlendSec: number;
  /** A state may not be entered and exited inside this window (seconds). */
  readonly minStateSec: number;
}

export interface Intent {
  /** Stick vector in world-ish space, already deadzoned and curved. Magnitude 0..1. */
  readonly moveX: number;
  readonly moveZ: number;
  readonly magnitude: number;
  readonly sprint: boolean;
  /** Where the body WANTS to look, radians, or null to keep facing travel. */
  readonly lookYaw: number | null;
}

export interface MotionOut {
  /** Desired velocity, m/s, world space. */
  readonly velX: number;
  readonly velZ: number;
  /** Desired heading, radians. Separate from velocity by construction. */
  readonly headingYaw: number;
  readonly speed: number;
}

export interface BlendWeights {
  /** clip id -> weight, summing to ~1. */
  readonly weights: Readonly<Record<string, number>>;
  readonly ring: SpeedRing | 'slide';
  readonly dir: Dir8;
}
