// BROADCAST SHOTS (vis-foundation-2 A9.12, 2026-10-13) — the framing half of the presentation kit, as pure maths.
//
// The audit (docs/VISUAL-PASS-PLAN.md A6): "no establishing or intro fly-ins, broadcast cameras, letterboxing or DOF
// anywhere"; the only replay in the game is the dunk's. A televised game opens on a crane over the venue, cuts to the
// player, then hands over to the game camera; a highlight is replayed from two or three angles that are not the play
// camera. This file says WHERE those cameras stand — the CameraDirector (the intro) and the ReplayDirector (the replays)
// move a real camera along it. Pure, so the shots are unit-tested without a GPU, and so the two directors cannot disagree
// on what a "low angle" is.
//
// Nothing here touches the PLAY camera: its presets, lag and distances are tuned and signed off (FOLLOW_PRESETS). These
// shots are cinematic framing only, and every one of them ends by handing the frame back to the play camera unchanged.

export interface V3 { x: number; y: number; z: number }
export interface ShotPose { pos: V3; target: V3; /** vertical FOV, radians; undefined = leave the lens alone */ fov?: number;
  /** near clip plane, metres; undefined = leave it alone. The play cameras clip at 1 m: a lens an ankle's height off the floor loses the floor under it (a band of the dome shows through). */ minZ?: number }

const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const smoothstep = (k: number): number => { const t = Math.max(0, Math.min(1, k)); return t * t * (3 - 2 * t); };
/** Ground-plane unit direction rotated about +Y by `rad` (the CameraDirector's rotateY convention). */
export function yawDir(dir: V3, rad: number): V3 {
  const c = Math.cos(rad), s = Math.sin(rad);
  const x = dir.x * c - dir.z * s, z = dir.x * s + dir.z * c;
  const l = Math.hypot(x, z) || 1;
  return v(x / l, 0, z / l);
}
/** A flat unit vector, or +z when the input has no ground component. */
export function flatUnit(d: V3): V3 { const l = Math.hypot(d.x, d.z); return l > 1e-4 ? v(d.x / l, 0, d.z / l) : v(0, 0, 1); }

// ── THE INTRO (the establishing crane, then the player shot) ────────────────────────────────────────────────────────

/**
 * Timing of the intro, seconds. CRANE: a high, wide arc over the venue that comes down toward the player. HERO: a cut to a
 * low front three-quarter on the player (the "walk-in" — the shot every sports broadcast puts on an athlete as they take
 * the field), pushing in slowly. Then a cut to the play camera. The whole thing is skippable (any press) and never holds
 * the game: the mode is already playing underneath, the camera simply hands over at the end.
 */
export const INTRO = { craneSec: 2.2, heroSec: 1.5, /** the letterbox opens over this much of the hero shot's tail */ outSec: 0.45, /** a skip eases into the play camera over this */ skipSec: 0.35 } as const;
export type IntroKind = 'establish' | 'walkIn';
export function introSec(kind: IntroKind): number { return kind === 'walkIn' ? INTRO.craneSec + INTRO.heroSec : INTRO.craneSec + 0.8; }

/** The crane's path: radius, height and the yaw away from the play camera's side, start → end. Metres / radians. */
export const CRANE = { r0: 22, r1: 11, h0: 13, h1: 4.5, yaw0: 1.95, yaw1: 0.6, /** the look target starts this far past the player, into the venue */ lookPast: 7 } as const;
/** The player shot: in FRONT of the player, off-axis, low (the lens looks slightly up at them), pushing in. */
export const HERO_SHOT = { yaw: 0.62, r0: 3.6, r1: 2.9, h: 0.85, targetH: 1.35, fovRad: 0.62 } as const;

/**
 * Where the intro camera is `t` seconds in. `subject` is the player's feet; `back` the ground direction from the player to
 * where the play camera sits (so the crane starts round the far side and comes home toward it, and the player shot stands
 * in front). Returns 'play' once the intro has run (the caller hands the frame back).
 */
export function introPose(kind: IntroKind, t: number, subject: V3, back: V3): ShotPose | 'play' {
  const b = flatUnit(back);
  if (t < INTRO.craneSec) {
    const k = smoothstep(t / INTRO.craneSec);
    const d = yawDir(b, lerp(CRANE.yaw0, CRANE.yaw1, k));
    const r = lerp(CRANE.r0, CRANE.r1, k), h = lerp(CRANE.h0, CRANE.h1, k);
    const past = CRANE.lookPast * (1 - k);
    return {
      pos: v(subject.x + d.x * r, subject.y + h, subject.z + d.z * r),
      // the look starts out over the venue beyond the player and settles on them
      target: v(subject.x - d.x * past, subject.y + 1.1, subject.z - d.z * past),
    };
  }
  if (kind === 'walkIn' && t < INTRO.craneSec + INTRO.heroSec) {
    const k = smoothstep((t - INTRO.craneSec) / INTRO.heroSec);
    const front = yawDir(v(-b.x, 0, -b.z), HERO_SHOT.yaw);
    const r = lerp(HERO_SHOT.r0, HERO_SHOT.r1, k);
    return {
      pos: v(subject.x + front.x * r, subject.y + HERO_SHOT.h, subject.z + front.z * r),
      target: v(subject.x, subject.y + HERO_SHOT.targetH, subject.z),
      fov: HERO_SHOT.fovRad,
    };
  }
  return 'play';
}

/**
 * Blend two camera positions AROUND the subject (bearing and ground radius interpolated apart, height lerped), never along
 * the chord: a straight lerp from the player shot (in front) to the play camera (behind) would pass through the player.
 */
export function orbitBlend(a: V3, b: V3, subject: V3, k: number): V3 {
  const t = Math.max(0, Math.min(1, k));
  const ax = a.x - subject.x, az = a.z - subject.z, bx = b.x - subject.x, bz = b.z - subject.z;
  const ra = Math.hypot(ax, az), rb = Math.hypot(bx, bz);
  const aa = Math.atan2(az, ax), ab = Math.atan2(bz, bx);
  const d = Math.atan2(Math.sin(ab - aa), Math.cos(ab - aa));   // shortest arc
  const ang = aa + d * t, r = lerp(ra, rb, t);
  return v(subject.x + Math.cos(ang) * r, lerp(a.y, b.y, t), subject.z + Math.sin(ang) * r);
}

/** How far the letterbox is closed (0 open .. 1 full bars) `t` seconds into an intro of `kind`. Closed from the first
 *  frame (the intro opens on bars), opened over the last `outSec`. */
export function introLetterbox(kind: IntroKind, t: number): number {
  const end = introSec(kind);
  if (t >= end) return 0;
  return Math.max(0, Math.min(1, (end - t) / INTRO.outSec));
}

// ── THE REPLAY ANGLES ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The replay camera library, generalised from DunkReplayCam (its 'low baseline looking up the flight' and 'rim-side
 * profile at rim height') and DunkCuts:
 *   low    — low behind-and-beside, looking up the action (the dunk's angle A)
 *   side   — a profile from the side, at chest height (the dunk's angle B)
 *   tight  — a close three-quarter in front of the subject, long lens (the reaction / the face)
 *   high   — a high wide crane, the tactical view
 *   follow — behind the subject at the play camera's height, a touch further back (the "as it happened" view)
 *   filmer — (vis-board, wave 2) the skate video's operator: ankle-high, an arm's length off the line, an extreme wide lens
 *            (the fisheye) pointing up the board — a mode asks for it by name; it is not in the default cut
 */
export type ReplayAngle = 'low' | 'side' | 'tight' | 'high' | 'follow' | 'filmer';
/** The five standard angles (every one a readable distance on a normal lens); 'filmer' is the deliberate exception, asked for by name. */
export const REPLAY_ANGLES: readonly ReplayAngle[] = ['low', 'side', 'tight', 'high', 'follow'];

/**
 * Where a replay camera stands for `angle`, framing `focus` (the subject's feet) moving along `heading` (its ground
 * direction of travel; any length). `objective` (a rim, a goal, the end zone) is folded into the look where the angle
 * wants it. `side` = +1 / −1 picks which side of the action the profile and low angles take.
 */
export function replayShot(angle: ReplayAngle, focus: V3, heading: V3, objective: V3 | null = null, side = 1): ShotPose {
  const f = flatUnit(heading);
  const right = v(-f.z * side, 0, f.x * side);
  const chest = v(focus.x, focus.y + 1.2, focus.z);
  const toward = (a: V3, b: V3 | null, k: number): V3 => (b ? v(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k)) : a);
  switch (angle) {
    case 'low':
      return { pos: v(focus.x - f.x * 3.2 + right.x * 3.6, focus.y + 0.55, focus.z - f.z * 3.2 + right.z * 3.6), target: toward(chest, objective, 0.1), fov: 0.85 };
    case 'side':
      return { pos: v(focus.x + right.x * 6.5, focus.y + 1.3, focus.z + right.z * 6.5), target: toward(chest, objective, 0.06), fov: 0.7 };   // a far objective pulled the runner to the frame's edge at 0.2
    case 'tight': {
      const d = yawDir(f, 0.5 * side);
      return { pos: v(focus.x + d.x * 3.4, focus.y + 1.45, focus.z + d.z * 3.4), target: v(focus.x, focus.y + 1.35, focus.z), fov: 0.42 };
    }
    case 'high':
      return { pos: v(focus.x - f.x * 9 + right.x * 7, focus.y + 11, focus.z - f.z * 9 + right.z * 7), target: toward(chest, objective, 0.35), fov: 0.8 };
    case 'filmer':
      return { pos: v(focus.x - f.x * 1.1 + right.x * 1.9, focus.y + 0.3, focus.z - f.z * 1.1 + right.z * 1.9), target: v(focus.x + f.x * 0.6, focus.y + 0.95, focus.z + f.z * 0.6), fov: 1.5, minZ: FILMER_MIN_Z };
    case 'follow':
    default:
      return { pos: v(focus.x - f.x * 7.5, focus.y + 3.2, focus.z - f.z * 7.5), target: v(focus.x + f.x * 2, focus.y + 1.1, focus.z + f.z * 2) };
  }
}

// ── WHERE A CAMERA MAY STAND (vis-board, wave 2) ─────────────────────────────────────────────────────────────────────
// The filmer stands an arm's length off the line, at ankle height: with the rider near the edge of the slab that spot is past the
// floor and the frame fills with the dome underneath. A mode that knows its floor passes `bounds`; the director asks `resolveAngle`
// for each cut segment ONCE (against where the subject is through the whole segment, so the camera never swaps sides mid-shot).
/** The filmer's near plane: close enough that the floor under an ankle-high lens is not clipped away. */
export const FILMER_MIN_Z = 0.12;
/** The floor a camera may stand over: world x/z extents. */
export interface ShotBounds { minX: number; maxX: number; minZ: number; maxZ: number }
/** How far inside the bounds the filmer's lens must be (it is a wide lens: the floor's edge is in frame well before the camera is on it). */
export const FILMER_MARGIN = 1.0;
const inside = (p: V3, b: ShotBounds, m: number): boolean => p.x >= b.minX + m && p.x <= b.maxX - m && p.z >= b.minZ + m && p.z <= b.maxZ - m;
/** Angles tried, in order, when the filmer has no valid spot: a profile, a low angle, then from behind. */
export const FILMER_FALLBACKS: readonly ReplayAngle[] = ['side', 'low', 'follow'];

/**
 * Pure: the angle (and side) to shoot a segment from. Only the filmer is checked: it takes its side, then the other side of the
 * line, then the first of `fallbacks` (default FILMER_FALLBACKS) whose camera stays over the floor for every sample of the
 * subject's position through the segment; failing all of those, 'follow' (behind the subject, over ground it just crossed).
 * Every other angle, and a call without bounds, is returned as asked.
 */
export function resolveAngle(angle: ReplayAngle, foci: readonly V3[], heading: V3, objective: V3 | null, side: number, bounds?: ShotBounds | null, fallbacks: readonly ReplayAngle[] = FILMER_FALLBACKS): { angle: ReplayAngle; side: number } {
  if (angle !== 'filmer' || !bounds || !foci.length) return { angle, side };
  const ok = (a: ReplayAngle, sd: number): boolean => foci.every((f) => inside(replayShot(a, f, heading, objective, sd).pos, bounds, FILMER_MARGIN));
  if (ok('filmer', side)) return { angle, side };
  if (ok('filmer', -side)) return { angle, side: -side };
  for (const a of fallbacks) if (a !== 'filmer' && ok(a, side)) return { angle: a, side };
  return { angle: 'follow', side };
}

/** The angles a replay of `sec` seconds is cut into: one angle per ~1.2 s of source, two at least, three at most. */
export function replayCut(sec: number, angles: readonly ReplayAngle[] = ['low', 'side', 'tight']): ReplayAngle[] {
  const n = Math.max(2, Math.min(3, Math.round(sec / 1.2), angles.length));
  return angles.slice(0, Math.max(1, Math.min(n, angles.length)));
}

// ── DEPTH OF FIELD for the replays ────────────────────────────────────────────────────────────────────────────────

/** The lens a replay shoots on: focus on the subject (mm, as Babylon's DOF takes it), a fast lens for a soft background.
 *  `k` 0..1 eases it in from the no-blur lens the pipeline mounts with (DOF_REST) — never a toggle (a toggle compiles). */
export const DOF_REST = { fStop: 32, focalLength: 1 } as const;
// A long, fast lens. Measured on Football Rush: Babylon's circle of confusion is aperture × focal ÷ (focus − focal) × the
// relative depth error, and it only reads as blur near 1 — 85 mm f/2 and 135 mm f/1.4 left the stands 30 m back barely soft.
// 180 mm f/1: at a 5 m focus the runner (±0.3 m) stays sharp (CoC ~0.1), a defender 3 m behind softens (~0.7), the stands go.
export const DOF_REPLAY = { fStop: 1.0, focalLength: 180 } as const;
export function replayLens(k: number, focusMetres: number): { fStop: number; focalLength: number; focusDistance: number } {
  const t = Math.max(0, Math.min(1, k));
  return {
    fStop: lerp(DOF_REST.fStop, DOF_REPLAY.fStop, t),
    focalLength: lerp(DOF_REST.focalLength, DOF_REPLAY.focalLength, t),
    focusDistance: Math.max(0.5, focusMetres) * 1000,
  };
}
