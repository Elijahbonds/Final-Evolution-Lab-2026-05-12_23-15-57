/**
 * lib/camera/rigs.ts
 * ==================
 * M7a — per-mode camera rigs.
 *
 * Every mode gets a purpose-built rig:
 *   • over_shoulder  — third-person trail cam (karate endless, football run)
 *   • broadcast      — contest cut cam with framed hero shots (dunk contest)
 *   • follow         — loose chase cam for ball sports (hoops, soccer)
 *   • storm          — dynamic encircling battle cam (STORM) for battle mode
 *   • sideline       — fixed tracking dolly (legacy beat-em-up feel)
 *
 * computeCamera() is DETERMINISTIC and ALWAYS returns finite position+target
 * vectors — there are no dead cuts and no NaN frames. Scene transitions call
 * beginCut()/updateCut() which blend between two rig framings over a fixed
 * duration; the blend is guaranteed to resolve (progress clamps to 1).
 *
 * Pure math, no THREE / DOM. All framing constants are // TUNE(elijah).
 */

export type RigKind = 'over_shoulder' | 'broadcast' | 'follow' | 'storm' | 'sideline';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraFrame {
  position: Vec3;
  target: Vec3;
  fov: number;
}

export interface Subject {
  pos: Vec3;
  /** Facing yaw (radians). */
  facing: number;
  /** Normalized speed 0..1 (rigs may pull back / widen fov when fast). */
  speed01?: number;
}

export interface RigConfig {
  kind: RigKind;
  /** Camera distance behind/around the subject. // TUNE(elijah) */
  distance: number;
  /** Camera height above subject feet. // TUNE(elijah) */
  height: number;
  /** Look-at height above subject feet. // TUNE(elijah) */
  lookHeight: number;
  /** Lateral shoulder offset (over-shoulder rigs). // TUNE(elijah) */
  shoulder: number;
  /** Field of view (deg). // TUNE(elijah) */
  fov: number;
  /** Smoothing factor per frame (0..1); higher = snappier. // TUNE(elijah) */
  stiffness: number;
}

export const RIGS: Record<RigKind, RigConfig> = {
  over_shoulder: { kind: 'over_shoulder', distance: 3.6, height: 2.1, lookHeight: 1.5, shoulder: 0.7, fov: 55, stiffness: 0.12 },
  broadcast: { kind: 'broadcast', distance: 7.5, height: 3.2, lookHeight: 1.4, shoulder: 0, fov: 42, stiffness: 0.06 },
  follow: { kind: 'follow', distance: 6.0, height: 3.0, lookHeight: 1.2, shoulder: 0, fov: 50, stiffness: 0.08 },
  storm: { kind: 'storm', distance: 5.4, height: 2.6, lookHeight: 1.3, shoulder: 0, fov: 58, stiffness: 0.10 },
  sideline: { kind: 'sideline', distance: 6.8, height: 2.85, lookHeight: 1.2, shoulder: 0, fov: 54, stiffness: 0.08 },
};

const isFinite3 = (v: Vec3): boolean =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/**
 * Compute the ideal camera frame for a rig looking at a subject at time `t`.
 * `t` is only used by the STORM rig (encircling orbit). Always finite.
 */
export function computeCamera(subject: Subject, rig: RigConfig, t = 0): CameraFrame {
  const s = subject.pos;
  const speed = subject.speed01 ?? 0;
  let pos: Vec3;
  const target: Vec3 = { x: s.x, y: s.y + rig.lookHeight, z: s.z };

  switch (rig.kind) {
    case 'over_shoulder': {
      // Behind the subject along -facing, offset to the shoulder.
      const behindX = -Math.sin(subject.facing);
      const behindZ = Math.cos(subject.facing);
      const rightX = Math.cos(subject.facing);
      const rightZ = Math.sin(subject.facing);
      // Pull back slightly at speed for a sense of pace. // TUNE(elijah)
      const dist = rig.distance + speed * 0.8;
      pos = {
        x: s.x + behindX * dist + rightX * rig.shoulder,
        y: s.y + rig.height,
        z: s.z + behindZ * dist + rightZ * rig.shoulder,
      };
      // Aim slightly ahead of the subject.
      target.x = s.x + Math.sin(subject.facing) * 1.5;
      target.z = s.z - Math.cos(subject.facing) * 1.5;
      break;
    }
    case 'broadcast': {
      // High, framed 3/4 hero shot from a fixed broadcast angle. // TUNE(elijah)
      const angle = Math.PI * 0.18;
      pos = {
        x: s.x + Math.sin(angle) * rig.distance,
        y: s.y + rig.height,
        z: s.z + Math.cos(angle) * rig.distance,
      };
      break;
    }
    case 'follow': {
      // Loose chase directly behind facing, no shoulder offset.
      const behindX = -Math.sin(subject.facing);
      const behindZ = Math.cos(subject.facing);
      pos = {
        x: s.x + behindX * rig.distance,
        y: s.y + rig.height,
        z: s.z + behindZ * rig.distance,
      };
      break;
    }
    case 'storm': {
      // Dynamic encircling battle cam — orbits the subject over time. // TUNE(elijah)
      const orbitSpeed = 0.35; // rad/sec
      const a = t * orbitSpeed;
      const dist = rig.distance + Math.sin(t * 0.7) * 0.6;
      pos = {
        x: s.x + Math.sin(a) * dist,
        y: s.y + rig.height + Math.sin(t * 0.5) * 0.3,
        z: s.z + Math.cos(a) * dist,
      };
      break;
    }
    case 'sideline':
    default: {
      // Fixed dolly to the +Z side that tracks the subject laterally.
      pos = {
        x: s.x + rig.shoulder,
        y: s.y + rig.height,
        z: s.z + rig.distance,
      };
      break;
    }
  }

  // Widen fov slightly with speed for a sense of velocity. // TUNE(elijah)
  const fov = rig.fov + speed * 4;

  const frame: CameraFrame = { position: pos, target, fov };
  // Safety net: never emit a non-finite frame (no black/dead frames).
  if (!isFinite3(frame.position) || !isFinite3(frame.target)) {
    return {
      position: { x: s.x, y: s.y + rig.height, z: s.z + rig.distance },
      target: { x: s.x, y: s.y + rig.lookHeight, z: s.z },
      fov: rig.fov,
    };
  }
  return frame;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
function lerp3(a: Vec3, b: Vec3, k: number): Vec3 {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) };
}

/** Ease in-out so cuts start/stop smoothly (no popping). */
export function easeInOut(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

/**
 * Deterministic camera cut controller: blends from a source frame to a live
 * rig over `duration` seconds. Guarantees the cut resolves (progress clamps to
 * 1) and every intermediate frame is finite — there are no dead cuts.
 */
export class CameraCut {
  private from: CameraFrame | null = null;
  private duration = 0.5;
  private elapsed = 0;
  active = false;

  /** Begin a cut FROM the current frame TO whatever the rig produces. */
  begin(from: CameraFrame, duration = 0.6): void {
    this.from = from;
    this.duration = Math.max(0.0001, duration);
    this.elapsed = 0;
    this.active = true;
  }

  /**
   * Advance the cut and return the blended frame. Once complete, returns the
   * live rig frame directly and clears `active`.
   */
  update(dt: number, liveFrame: CameraFrame): CameraFrame {
    if (!this.active || !this.from) return liveFrame;
    this.elapsed += Math.max(0, dt);
    const k = easeInOut(this.elapsed / this.duration);
    if (this.elapsed >= this.duration) {
      this.active = false;
      this.from = null;
      return liveFrame;
    }
    return {
      position: lerp3(this.from.position, liveFrame.position, k),
      target: lerp3(this.from.target, liveFrame.target, k),
      fov: lerp(this.from.fov, liveFrame.fov, k),
    };
  }

  get progress(): number {
    return this.active ? Math.min(1, this.elapsed / this.duration) : 1;
  }
}

/** Default rig assignment per mode. // TUNE(elijah) */
export const MODE_RIG: Record<string, RigKind> = {
  karate_endless: 'over_shoulder',
  karate_kata: 'over_shoulder',
  karate_h2h: 'sideline',
  basketball_dunk: 'broadcast',
  basketball_h2h: 'follow',
  basketball_3v3: 'follow',
  threePoint: 'broadcast',
  venice_pickup: 'follow',
  soccer: 'follow',
  football: 'over_shoulder',
  golf: 'broadcast',
  baseball: 'broadcast',
  skateboarding: 'follow',
  snowboarding: 'follow',
  surfing: 'follow',
  story_battle: 'storm',
};

export function rigForMode(modeId: string): RigConfig {
  return RIGS[MODE_RIG[modeId] ?? 'follow'];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * M14-P4 — CAMERA DIRECTOR LAYER (single director, per-mode profiles + look)
 * ───────────────────────────────────────────────────────────────────────────
 * Enriches (does NOT fork) the rig core above. Adds:
 *   1. The four canonical camera PROFILES the design asks for
 *      (follow / orbit / broadcast / cinematic), mapped onto the existing
 *      RigKinds so every scene keeps its tuned framing.
 *   2. A pure ORBIT-LOOK model that consumes the P3 right-stick "look" input
 *      (dispatched as look-left/right/up/down key events). Orbit auto-recenters
 *      to zero when there is no look input, so a scene that opts in behaves
 *      EXACTLY as before whenever the player is not actively looking around —
 *      zero gameplay regression.
 *   3. directCamera(): computeCamera() + orbit applied about the look target.
 *
 * All feel constants are // TUNE(elijah). Pure math — no THREE / DOM.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** The four canonical camera profiles a mode can request. */
export type CameraProfile = 'follow' | 'orbit' | 'broadcast' | 'cinematic';

/** Which underlying rig framing each profile uses. */
export const PROFILE_RIG: Record<CameraProfile, RigKind> = {
  follow: 'follow',
  orbit: 'follow', // orbit = follow framing that the player can swing with the right stick
  broadcast: 'broadcast',
  cinematic: 'storm', // cinematic = the encircling director cam (used by CameraCut sequences)
};

/** Default camera profile per mode. // TUNE(elijah) */
export const MODE_PROFILE: Record<string, CameraProfile> = {
  karate_endless: 'follow',
  karate_kata: 'follow',
  karate_h2h: 'broadcast',
  basketball_dunk: 'broadcast',
  basketball_h2h: 'follow',
  basketball_3v3: 'follow',
  threePoint: 'broadcast',
  venice_pickup: 'follow',
  soccer: 'follow',
  football: 'follow',
  golf: 'broadcast',
  baseball: 'broadcast',
  skateboarding: 'orbit',
  snowboarding: 'orbit',
  surfing: 'orbit',
  story_battle: 'cinematic',
};

export function profileForMode(modeId: string): CameraProfile {
  return MODE_PROFILE[modeId] ?? 'follow';
}

/** Live orbit offset the player has swung the camera to (radians). */
export interface OrbitState {
  /** Horizontal swing about the subject (0 = directly behind). */
  yaw: number;
  /** Vertical tilt (0 = rig default; + looks up/over, - looks down). */
  pitch: number;
}

/** Boolean look intents decoded from the right stick / on-screen look pad. */
export interface LookDirs {
  left?: boolean;
  right?: boolean;
  up?: boolean;
  down?: boolean;
}

export const ORBIT_LIMIT_YAW = Math.PI * 0.6; // ±108° swing // TUNE(elijah)
export const ORBIT_LIMIT_PITCH_UP = 0.5; // rad // TUNE(elijah)
export const ORBIT_LIMIT_PITCH_DOWN = -0.35; // rad // TUNE(elijah)
export const ORBIT_RATE = 2.2; // rad/sec at full deflection // TUNE(elijah)
export const ORBIT_RECENTER = 3.0; // rad/sec return-to-center when idle // TUNE(elijah)

const clampNum = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/** Move a value toward 0 by at most `maxStep` (never overshoots). */
function recenterToward0(v: number, maxStep: number): number {
  if (v > 0) return Math.max(0, v - maxStep);
  if (v < 0) return Math.min(0, v + maxStep);
  return 0;
}

/**
 * Advance the orbit state one frame from the current look intents.
 * PURE — returns a NEW OrbitState. With no look input the orbit eases back to
 * {0,0}, so framing is identical to the un-orbited rig whenever the player is
 * not actively looking around.
 */
export function applyLookInput(orbit: OrbitState, dirs: LookDirs, dtRaw: number): OrbitState {
  const dt = Math.max(0, Math.min(dtRaw, 0.05));
  const hx = (dirs.right ? 1 : 0) - (dirs.left ? 1 : 0);
  const vy = (dirs.up ? 1 : 0) - (dirs.down ? 1 : 0);

  let yaw = orbit.yaw;
  let pitch = orbit.pitch;

  if (hx !== 0) yaw = clampNum(yaw + hx * ORBIT_RATE * dt, -ORBIT_LIMIT_YAW, ORBIT_LIMIT_YAW);
  else yaw = recenterToward0(yaw, ORBIT_RECENTER * dt);

  if (vy !== 0) pitch = clampNum(pitch + vy * ORBIT_RATE * dt, ORBIT_LIMIT_PITCH_DOWN, ORBIT_LIMIT_PITCH_UP);
  else pitch = recenterToward0(pitch, ORBIT_RECENTER * dt);

  if (!Number.isFinite(yaw)) yaw = 0;
  if (!Number.isFinite(pitch)) pitch = 0;
  return { yaw, pitch };
}

/**
 * Rotate a camera OFFSET vector (camera-relative-to-target) by the orbit.
 * Horizontal yaw swings the offset around the Y axis; pitch raises/lowers the
 * camera while pulling it in slightly so the look target stays framed.
 * PURE. When orbit == {0,0} the offset is returned unchanged (identity) —
 * guaranteeing zero regression for un-orbited frames.
 */
export function orbitOffset(offset: Vec3, orbit: OrbitState): Vec3 {
  if (orbit.yaw === 0 && orbit.pitch === 0) return { x: offset.x, y: offset.y, z: offset.z };
  const cy = Math.cos(orbit.yaw);
  const sy = Math.sin(orbit.yaw);
  // Rotate horizontal plane about Y.
  const x = offset.x * cy - offset.z * sy;
  const z = offset.x * sy + offset.z * cy;
  // Pitch: raise camera by a height proportional to the planar radius, and
  // gently pull in so the subject stays framed. // TUNE(elijah)
  const planar = Math.hypot(x, z);
  const y = offset.y + Math.sin(orbit.pitch) * planar;
  const pull = Math.cos(orbit.pitch);
  const out: Vec3 = { x: x * pull, y, z: z * pull };
  if (!isFinite3(out)) return { x: offset.x, y: offset.y, z: offset.z };
  return out;
}

/**
 * Full director frame: the rig's computed framing with the player's orbit
 * applied about the look target. `t` drives time-based rigs (storm/cinematic).
 * PURE. Falls back to the un-orbited frame if anything is non-finite.
 */
export function directCamera(
  subject: Subject,
  rig: RigConfig,
  opts: { t?: number; orbit?: OrbitState } = {},
): CameraFrame {
  const base = computeCamera(subject, rig, opts.t ?? 0);
  const orbit = opts.orbit;
  if (!orbit || (orbit.yaw === 0 && orbit.pitch === 0)) return base;
  // Offset of camera relative to the look target, rotated by the orbit.
  const off: Vec3 = {
    x: base.position.x - base.target.x,
    y: base.position.y - base.target.y,
    z: base.position.z - base.target.z,
  };
  const rot = orbitOffset(off, orbit);
  const pos: Vec3 = {
    x: base.target.x + rot.x,
    y: base.target.y + rot.y,
    z: base.target.z + rot.z,
  };
  const frame: CameraFrame = { position: pos, target: base.target, fov: base.fov };
  if (!isFinite3(frame.position) || !isFinite3(frame.target)) return base;
  return frame;
}
