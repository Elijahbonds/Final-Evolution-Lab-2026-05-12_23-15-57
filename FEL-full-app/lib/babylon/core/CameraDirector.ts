// CameraDirector v2.5 — REPLACES the M50 file. Fixes E26, found in the M63
// live sweep: in 1v1/3v3 the camera can bury itself in the baseline wall
// (frame full of flat wall paint) or dip under the court right after a
// rim-area shot.
//
// ROOT CAUSE (confirmed by reading VenueKit): the occlusion probe filters on
// `m.isPickable && m.checkCollisions`, but VenueKit builds the court ground
// with `checkCollisions = false` and the venue walls as plain planes with no
// collision flag at all. The probe has therefore NEVER been able to see a
// venue wall — which is also why the console showed zero `[FEL-FRAME]`
// warnings while the camera sat inside one. Two fixes, both cheap:
//   1. VENUE-SHELL AWARENESS — the probe now also accepts meshes whose names
//      match the venue shell (`venue_ground`, `wall_*`, ride-world floors),
//      regardless of their collision flag. Characters/props are still
//      excluded, so this cannot cause the camera to yank in on a player.
//   2. WORLD BOUNDS CLAMP — the camera's final position is clamped inside
//      the venue's own bounding box (with margin) and above its floor.
//      Bounds are derived automatically from the shell meshes on preset
//      change; `setBounds()` overrides, `invalidateBounds()` forces a
//      recompute after a venue swap (Court Carnival).
// Also caps the fitTwo separation pull-back, which could push the 'team'
// preset past the back wall on a full-court possession.
//
// CameraDirector v2.4 — REPLACES the M48 file. Adds 'overShoulder' for the
// Agent Waves rebuild (M50, KarateEndlessMode.ts): a true third-person
// over-the-shoulder framing — close, low pitch, offset laterally to one
// side of the player rather than centered, and it follows FACING rather
// than velocity or the nearest-enemy midpoint (fitTwo is off) so the camera
// stays locked behind you as you turn to face whichever enemy you're
// squared up on, the way third-person action games frame combat. Callers
// get this by passing a small facing-direction vector as the `velocity`
// argument to `update()` — see KarateEndlessMode.ts for the one-line
// convention; no signature change needed since `update()` already falls
// back to a velocity-derived back-vector when `fitTwo` is off.
//
// CameraDirector v2.3 — REPLACES the M42 file. Adds two presets for the
// basketball simulator rebuild (M48): 'hoops' (tight isolation framing for
// 1v1 — closer and lower than 'court', reads like a broadcast iso-cam) and
// 'team' (wide full-flow framing for 3v3 — pulls back and raises so all six
// bodies stay legible, with fitTwo watching the ball-handler vs the hoop the
// same way 'court'/'fight' already do). Everything else is byte-identical
// to M42's v2.2 occlusion/pitch-clamp/snapTo logic.
// CameraDirector v2.2 — REPLACES the M37 file. Fixes a regression the M37
// occlusion probe introduced: in tight venues (Shimogamo Dojo's walled room
// is the confirmed case — live audit shows the camera pressed flat against a
// wall panel, filling the entire frame with a blank texture) a single
// pull-in step can still land the camera closer to a wall than is readable,
// or on the wrong side of it. v2.2 adds a minimum safe distance, tries two
// alternate viewing angles before giving up, and falls back to a guaranteed-
// clear overhead framing rather than ever showing a wall at point-blank
// range. Everything else (chest targeting, pitch clamp, fitTwo, snapTo) is
// unchanged from v2 — this is a targeted occlusion-handling patch.

import { Ray, TargetCamera, Vector3 } from '@babylonjs/core';
import type { Scene, AbstractMesh } from '@babylonjs/core';
import { enforceStandoff } from './CameraStandoff';   // M69: last-guard standoff

export type CamMode = 'follow' | 'fixed';

export interface FollowConfig {
  distance: number;
  height: number;
  minHeight: number;
  pitchFloorDeg: number;
  pitchCapDeg: number;
  targetHeight: number;
  lag: number;
  lookAhead: number;
  fitTwo?: boolean;
  /** lateral camera offset, world units — positive = camera sits to the
   *  player's right, framing them on the left third (classic third-person
   *  over-the-shoulder). 0/undefined = centered (every existing preset). */
  shoulderOffset?: number;
}

export const FOLLOW_PRESETS: Record<string, FollowConfig> = {
  court:  { distance: 8.0, height: 2.6, minHeight: 1.5, pitchFloorDeg: 6,  pitchCapDeg: 16, targetHeight: 1.35, lag: 0.10, lookAhead: 1.0, fitTwo: true },
  runner: { distance: 7.5, height: 3.2, minHeight: 2.0, pitchFloorDeg: 10, pitchCapDeg: 22, targetHeight: 1.2,  lag: 0.08, lookAhead: 3.0 },
  board:  { distance: 6.5, height: 2.4, minHeight: 1.6, pitchFloorDeg: 10, pitchCapDeg: 24, targetHeight: 1.1,  lag: 0.12, lookAhead: 4.0 },
  // fight distance pulled in (5.2 → 4.2): the dojo's walled room is narrower
  // than a 5.2-unit pullback can safely clear from every player position.
  // VS fighter — a THREE-QUARTER view, not an over-the-back one.
  //
  // fitTwo puts the camera on the line BETWEEN the two fighters, which for a
  // chase cam is right and for a fighting game is exactly wrong: the near
  // fighter stands directly in front of the far one and hides them. The
  // baseline capture of Karate VS shows the red opponent almost entirely
  // occluded by the blue player.
  //
  // Soul Calibur and Naruto Storm — both named benchmarks — hold an off-axis
  // three-quarter view so both fighters AND the space between them stay
  // readable, because that space is the whole game. shoulderOffset swings the
  // camera off the axis while aim() keeps it pointed at the midpoint.
  fight:  { distance: 4.2, height: 1.9, minHeight: 1.4, pitchFloorDeg: 4,  pitchCapDeg: 12, targetHeight: 1.15, lag: 0.15, lookAhead: 0.3, fitTwo: true, shoulderOffset: 3.0 },
  // 1v1 isolation — tight and low, broadcast iso-cam framing on the
  // ball-handler vs the defender/hoop
  hoops:  { distance: 6.2, height: 2.4, minHeight: 1.6, pitchFloorDeg: 6,  pitchCapDeg: 18, targetHeight: 1.3,  lag: 0.11, lookAhead: 1.2, fitTwo: true },
  // 3v3 — wide enough that all six bodies stay legible, but NOT the old
  // full-court height. This was distance 11 / height 5.2, written for "full-court
  // flow"; 3v3 is a HALF-COURT game (clampToHalfCourt, one basket), so fitTwo
  // frames the ball-handler against a rim only a few metres away and pulls the
  // camera in to ~2.8 behind — while still holding 5.2 of height. That is a ~62
  // degree pitch, double this preset's own 30 degree cap, and it put the hero
  // below the bottom of frame: two [FEL-FRAME] hero-off-screen lines, reproducibly,
  // at every spawn. Lower and slightly closer keeps six bodies readable at an
  // angle the cap can actually honour.
  team:   { distance: 9.5,  height: 3.4, minHeight: 2.2, pitchFloorDeg: 12, pitchCapDeg: 28, targetHeight: 1.3,  lag: 0.09, lookAhead: 2.5, fitTwo: true },
  // third-person over-the-shoulder — close, low, offset to the right
  // shoulder, follows facing (fitTwo off — see file header)
  // lag 0.16 -> 0.3: this is the one preset that follows FACING rather than
  // velocity, and facing can swing 180 degrees in a moment. At 0.16 the camera
  // needed roughly a quarter-second to come round, and at a 3.1m radius with a
  // 9-degree pitch cap that is long enough to leave the fighter outside a
  // narrow frame -- which is what Karate Endless's intermittent [FEL-FRAME]
  // lines were. Third-person action cameras are near-rigid in yaw for this
  // exact reason; the softness belongs in position, not heading.
  overShoulder: { distance: 3.1, height: 1.65, minHeight: 1.2, pitchFloorDeg: 1, pitchCapDeg: 9, targetHeight: 1.45, lag: 0.3, lookAhead: 2.2, shoulderOffset: 0.55 },
  // DUNK CONTEST cinematic — NOT the live-play camera: lower, closer,
  // slower lag so the flight glides like a highlight reel; tighter pitch
  // cap keeps the rim in frame at apex without a hard tilt.
  contest: { distance: 5.6, height: 1.7, minHeight: 1.1, pitchFloorDeg: 4, pitchCapDeg: 12, targetHeight: 1.5, lag: 0.06, lookAhead: 0.6, fitTwo: true },
  // DUEL — side-on weapon-duel framing: wider lateral read than 'fight',
  // slightly raised so the 8-way disc spacing reads at a glance.
  duel: { distance: 5.4, height: 2.2, minHeight: 1.5, pitchFloorDeg: 8, pitchCapDeg: 16, targetHeight: 1.2, lag: 0.13, lookAhead: 0.5, fitTwo: true },
  // SNOW DESCENT — wider and higher than 'board', opens up for big airs;
  // longer lookAhead reads the fall line.
  descent: { distance: 9.0, height: 3.6, minHeight: 2.2, pitchFloorDeg: 12, pitchCapDeg: 26, targetHeight: 1.2, lag: 0.08, lookAhead: 4.5 },
  // SURF — wave-following: low and close behind the rider so the face fills
  // frame; barrel treatment = tightest (set via pulse when in the tube).
  surf: { distance: 5.2, height: 1.5, minHeight: 1.0, pitchFloorDeg: 3, pitchCapDeg: 10, targetHeight: 1.1, lag: 0.12, lookAhead: 2.8 },
  // PRE-SNAP — high, wide, centered on the line of scrimmage: formations
  // and the coverage shell must be readable at a glance (the clarity beat).
  presnap: { distance: 10.5, height: 6.0, minHeight: 4.0, pitchFloorDeg: 22, pitchCapDeg: 34, targetHeight: 0.6, lag: 0.12, lookAhead: 0.4, fitTwo: true },
  // FOOTBALL LIVE — broadcast: behind the carrier, opens with field depth.
  gridiron: { distance: 8.4, height: 3.4, minHeight: 2.2, pitchFloorDeg: 10, pitchCapDeg: 22, targetHeight: 1.3, lag: 0.09, lookAhead: 3.2 },
  // ONSLAUGHT — horde readability: high and wide so surrounding enemies
  // stay in frame during crowd-control moments.
  onslaught: { distance: 9.5, height: 4.6, minHeight: 2.8, pitchFloorDeg: 18, pitchCapDeg: 30, targetHeight: 1.1, lag: 0.1, lookAhead: 1.6, fitTwo: true },
  // SOCCER BROADCAST — elevated sideline read; wide enough for off-ball
  // runs to register, tracks the ball with a long lookahead.
  soccer: { distance: 13.0, height: 6.4, minHeight: 4.0, pitchFloorDeg: 18, pitchCapDeg: 30, targetHeight: 0.8, lag: 0.08, lookAhead: 3.4, fitTwo: true },
  // BASEBALL DUEL — the pitcher/batter at-bat: behind the plate, reads the
  // pitch flight and the PCI.
  baseballDuel: { distance: 6.8, height: 2.0, minHeight: 1.4, pitchFloorDeg: 4, pitchCapDeg: 14, targetHeight: 1.0, lag: 0.1, lookAhead: 0.8, fitTwo: true },
  // BASEBALL FIELD — high + wide for a batted ball in play.
  baseballField: { distance: 14.0, height: 8.0, minHeight: 5.0, pitchFloorDeg: 24, pitchCapDeg: 38, targetHeight: 0.4, lag: 0.1, lookAhead: 2.0, fitTwo: true },
  // GOLF TEE — behind the golfer down the line: the hole must read.
  golfTee: { distance: 6.5, height: 2.4, minHeight: 1.6, pitchFloorDeg: 8, pitchCapDeg: 18, targetHeight: 1.2, lag: 0.1, lookAhead: 5.0, fitTwo: true },
  // GOLF GREEN — tight overhead-ish read for the putt.
  golfGreen: { distance: 4.2, height: 2.8, minHeight: 1.8, pitchFloorDeg: 20, pitchCapDeg: 32, targetHeight: 0.2, lag: 0.14, lookAhead: 0.4, fitTwo: true },
};

export const FIXED_PRESETS: Record<string, { offset: Vector3; targetHeight: number }> = {
  swing: { offset: new Vector3(0.9, 2.1, -4.2), targetHeight: 1.2 },
  flight: { offset: new Vector3(0, 1.6, -3.0), targetHeight: 0.6 },
};

/** Camera may never end up closer to the subject than this, in ANY venue —
 *  below this range a wall/prop fills the frame illegibly. */
/** Share of lookAhead a vertical velocity component may claim (see aim()). */
const VERTICAL_LEAD_SHARE = 0.25;
/** How much of the frustum half-height an objective may pull the target by. */
const OBJECTIVE_BIAS_SHARE = 0.6;

const MIN_SAFE_DISTANCE = 1.8;
/**
 * Distance below which a shot is not worth taking, even though it is "safe".
 *
 * MIN_SAFE_DISTANCE is the absolute floor -- the camera is never nearer than
 * this. But safe and legible are different numbers: at 1.9m from a subject the
 * near plane and the subject's own body between them leave nothing framed, and
 * a narrow (portrait) FOV loses them entirely. Karate Endless produced this
 * every time the player backed into an arena CORNER: the probe hit the wall
 * behind them, pulled in to ~1.94m, cleared the safety floor, and framed a
 * hero the guard reported as behind the camera. The elevated fallback below is
 * the better shot in that situation and was only being reached when the
 * absolute floor failed.
 */
const FRAMING_MIN_DISTANCE = 2.6;
/**
 * Speed below which the follow direction is HELD rather than re-derived from
 * velocity (m/s).
 *
 * This was `lengthSquared() > 0.01` -- a speed of 0.1 m/s, which is standing
 * still. A settled character still jitters above that, so the direction flipped
 * frame to frame, and each flip teleports the desired camera position to the
 * opposite side of the subject (two full follow distances, ~13m on the board
 * preset). The camera then lerps across the gap and passes straight THROUGH the
 * character, who lands inside the near plane on the way past. That is what the
 * mobile skate playtest kept catching: rider parked at his spawn, camera 0.7-1.3m
 * away, sometimes in front and sometimes behind, projected depth outside [0,1].
 * Below this threshold the else-branch keeps the camera where it already is,
 * which is the stable answer for a subject that is not going anywhere.
 *
 * CONTRACT FOR FACING-FOLLOWERS: the 'overShoulder' preset follows FACING, and
 * its callers pass a facing direction through this same `velocity` argument
 * (KarateEndlessMode passes facingVec(), a sin/cos UNIT vector). Length 1.0
 * clears this floor by design. A caller that scales its facing vector below
 * this would silently stop being followed -- pass it normalised.
 */
const FOLLOW_VEL_MIN = 0.8;
/** Clearance kept between the camera and whatever occludes it. */
const OCCLUSION_MARGIN = 0.6;
/** Meshes that form the venue shell. These block the camera even when they
 *  carry no collision flag (VenueKit builds them without one — the E26 bug).
 *  Deliberately excludes characters, balls, props and the M61 backdrop. */
const VENUE_SHELL = /^(venue_ground|venue_box|wall_|park_floor|piste|water|shore|mc_ring|mc_pit)/i;
/** How far inside the venue bounds the camera must stay. */
const BOUNDS_MARGIN = 1.2;

export interface CamBounds {
  minX: number; maxX: number; minZ: number; maxZ: number; minY: number;
}

export class CameraDirector {
  public mode: CamMode = 'follow';
  private cfg: FollowConfig;
  private fixedPos: Vector3 | null = null;
  private fixedTargetHeight = 1.2;
  public suspended = false;
  private bounds: CamBounds | null = null;
  private boundsExplicit = false;
  private boundsTried = false;
  // ── Phase 8: reaction beats ──
  private beatT = 0; private beatDur = 0; private beatStrength = 0;

  /** Reaction beat: a quick ease-out push-in on the subject (dunk flush,
   *  posterize, big judge total). strength 0..1, duration seconds. */
  pulse(strength: number, durationSec = 0.45): void {
    this.beatT = durationSec;
    this.beatDur = durationSec;
    this.beatStrength = Math.max(0, Math.min(1, strength));
  }

  /** Current beat scale on the follow distance (1 = no beat). */
  get beatScale(): number {
    if (this.beatT <= 0 || this.beatDur <= 0) return 1;
    const k = this.beatT / this.beatDur;                 // 1→0 over the beat
    return 1 - 0.32 * this.beatStrength * k * k;         // ease-out push-in
  }

  constructor(
    private scene: Scene,
    private camera: TargetCamera,
    preset: keyof typeof FOLLOW_PRESETS = 'court',
  ) {
    this.cfg = FOLLOW_PRESETS[preset] ?? FOLLOW_PRESETS.court;
  }

  setPreset(preset: keyof typeof FOLLOW_PRESETS): void {
    this.cfg = FOLLOW_PRESETS[preset] ?? this.cfg;
    this.mode = 'follow';
    this.invalidateBounds();          // a preset change usually means a new venue
  }

  /** Explicit venue bounds — overrides auto-derivation. */
  setBounds(b: CamBounds | null): void {
    this.bounds = b;
    this.boundsExplicit = b !== null;
    this.boundsTried = true;
  }

  /** Force a re-derive on the next frame (call after swapping venues). */
  invalidateBounds(): void {
    if (this.boundsExplicit) return;
    this.bounds = null;
    this.boundsTried = false;
  }

  /** Derive bounds from the venue shell meshes present in the scene. */
  private deriveBounds(): void {
    this.boundsTried = true;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity;
    let found = 0;
    for (const m of this.scene.meshes) {
      if (!m.name || !VENUE_SHELL.test(m.name)) continue;
      const info = m.getBoundingInfo?.();
      if (!info) continue;
      const bb = info.boundingBox;
      minX = Math.min(minX, bb.minimumWorld.x); maxX = Math.max(maxX, bb.maximumWorld.x);
      minZ = Math.min(minZ, bb.minimumWorld.z); maxZ = Math.max(maxZ, bb.maximumWorld.z);
      minY = Math.min(minY, bb.minimumWorld.y);
      found++;
    }
    if (found === 0 || !isFinite(minX)) { this.bounds = null; return; }
    this.bounds = { minX, maxX, minZ, maxZ, minY };
  }

  /** Keep the camera inside the venue and above its floor. */
  private clampToBounds(pos: Vector3): Vector3 {
    if (!this.boundsTried) this.deriveBounds();
    const b = this.bounds;
    if (!b) return pos;
    const m = BOUNDS_MARGIN;
    // only clamp when the venue is actually bigger than the margins (a tiny
    // or mis-derived box must never crush the camera onto the subject)
    if (b.maxX - b.minX > m * 3) pos.x = Math.max(b.minX + m, Math.min(b.maxX - m, pos.x));
    if (b.maxZ - b.minZ > m * 3) pos.z = Math.max(b.minZ + m, Math.min(b.maxZ - m, pos.z));
    pos.y = Math.max(b.minY + 0.8, pos.y);
    return pos;
  }

  /** snap: place the camera AT the fixed spot now. The default eases
   *  (Lerp 0.1/frame), which is right for a framing change mid-play but wrong
   *  for a broadcast CUT — derby's return from the ball-flight follow cam
   *  spent ~2s easing home with the batter off-frame (its last FEL-FRAME
   *  warnings). snapTo() can't reproduce a fixed preset's offset — it
   *  computes its own behind-vector — so the cut has to happen here. */
  setFixed(position: Vector3, targetHeight = 1.2, snap = false): void {
    this.mode = 'fixed';
    this.fixedPos = position.clone();
    this.fixedTargetHeight = targetHeight;
    if (snap) this.camera.position.copyFrom(position);
  }

  /** SELECT-button debug toggle between follow and fixed framing (ModeHarness). */
  toggle(): void { this.mode = this.mode === 'follow' ? 'fixed' : 'follow'; }

  setFixedBehind(subject: Vector3, facingYaw: number, preset: keyof typeof FIXED_PRESETS = 'swing', snap = false): void {
    const p = FIXED_PRESETS[preset];
    const sin = Math.sin(facingYaw), cos = Math.cos(facingYaw);
    const off = new Vector3(
      p.offset.x * cos + p.offset.z * sin,
      p.offset.y,
      -p.offset.x * sin + p.offset.z * cos,
    );
    this.setFixed(subject.add(off), p.targetHeight, snap);
  }

  snapTo(subject: Vector3, objective: Vector3 | null): void {
    const cfg = this.cfg;
    const back = objective
      ? subject.subtract(objective).normalize()
      : new Vector3(0, 0, 1);
    back.y = 0;
    if (back.lengthSquared() < 0.01) back.set(0, 0, 1); else back.normalize();
    let desired = subject.add(back.scale(cfg.distance)).add(new Vector3(0, cfg.height, 0));
    if (cfg.shoulderOffset) desired = desired.add(this.rightOf(back).scale(cfg.shoulderOffset));
    // M69: standoff runs AFTER the clamp so a tight venue's bounds cannot undo
    // the minimum safe distance (gains height instead of distance when boxed in).
    this.camera.position = enforceStandoff(subject, this.clampToBounds(this.resolveOcclusion(subject, desired))).pos;
    this.aim(subject, objective);
  }

  /** perpendicular-right of a flattened direction vector */
  private rightOf(dir: Vector3): Vector3 {
    return new Vector3(-dir.z, 0, dir.x);
  }

  update(subject: Vector3, velocity: Vector3, objective: Vector3 | null): void {
    if (this.suspended) return;
    this.beatT = Math.max(0, this.beatT - this.scene.getEngine().getDeltaTime() / 1000);

    if (this.mode === 'fixed' && this.fixedPos) {
      this.camera.position = Vector3.Lerp(this.camera.position, this.fixedPos, 0.1);
      const t = objective
        ? Vector3.Lerp(subject.add(new Vector3(0, this.fixedTargetHeight, 0)), objective, 0.4)
        : subject.add(new Vector3(0, this.fixedTargetHeight, 0));
      this.camera.setTarget(t);
      return;
    }

    const cfg = this.cfg;
    let back: Vector3;
    if (cfg.fitTwo && objective) {
      back = subject.subtract(objective);
      back.y = 0;
      if (back.lengthSquared() < 0.01) back.set(0, 0, 1); else back.normalize();
    } else if (velocity.lengthSquared() > FOLLOW_VEL_MIN * FOLLOW_VEL_MIN) {
      back = velocity.normalizeToNew().scaleInPlace(-1);
      back.y = 0; back.normalize();
    } else {
      back = this.camera.position.subtract(subject);
      back.y = 0;
      if (back.lengthSquared() < 0.01) back.set(0, 0, 1); else back.normalize();
    }

    const separation = cfg.fitTwo && objective ? Vector3.Distance(subject, objective) : 0;
    // E26: cap the separation pull-back — uncapped, a full-court 3v3
    // possession pushed the 'team' preset clean through the back wall.
    const dist = (cfg.distance + Math.min(4.5, Math.max(0, separation - 3) * 0.55)) * this.beatScale;

    let desired = subject.add(back.scale(dist)).add(new Vector3(0, cfg.height, 0));
    desired.y = Math.max(desired.y, subject.y + cfg.minHeight);
    if (cfg.shoulderOffset) desired = desired.add(this.rightOf(back).scale(cfg.shoulderOffset));

    // M69: enforceStandoff is the FINAL link in the chain — nothing can undo the
    // safe distance after it (fixes the karate dojo camera collapsing onto the hero).
    const finalPos = enforceStandoff(subject, this.clampToBounds(this.resolveOcclusion(subject, desired, back))).pos;
    // The standoff was enforced on the TARGET and then thrown away by the lerp.
    // At lag 0.08-0.12 the camera only ever travels a fraction of the way there,
    // so a subject accelerating hard away from a standing start leaves the
    // ACTUAL camera far closer than MIN_SAFE_DISTANCE even though the target it
    // is chasing is not. Measured on a phone viewport during a skate launch:
    // camera 0.74m behind the rider and 1.67m up, against a 1.8m minimum. A
    // wide desktop FOV still holds the rider at that range and a portrait one
    // does not, which is why this only ever showed up in the mobile playtest.
    // Re-enforce on the RESULT, so the guarantee is about where the camera IS.
    // ORBIT toward the target, do not lerp at it.
    //
    // A follow camera moving to a new side of its subject describes an ARC.
    // Lerping the position walks the CHORD instead, and a chord passes closer
    // to the subject than either endpoint -- at the 'overShoulder' preset's
    // 2.5m radius it passes through the player. Karate Endless produced this
    // whenever the fighter turned on the spot in an arena corner: the camera is
    // facing-derived, so a turn swings the target right around them, and the
    // straight-line catch-up cut the corner across the fighter's own body.
    // Measured there: desired 2.57m, occlusion 2.57m, bounds 2.57m, final
    // 2.57m -- nothing in the pipeline was pulling the camera in, the
    // interpolation was steering it through the subject.
    //
    // Interpolating the DIRECTION and the RADIUS separately holds the camera
    // out at its follow distance for the whole swing.
    // HORIZONTALLY. The arc problem is a yaw problem: preserving the full 3D
    // radius fights vertical convergence, because a subject who is rising (a
    // ramp, an ollie) needs the camera to climb to its preset height while the
    // radius wants to hold it where it was. Skate caught that immediately --
    // the camera sat at y 2.23 against a minHeight floor of 2.86 and the rider
    // went off the TOP of the frame. Orbit the ground plane, lerp the height.
    const curX = this.camera.position.x - subject.x, curZ = this.camera.position.z - subject.z;
    const tgtX = finalPos.x - subject.x, tgtZ = finalPos.z - subject.z;
    const curR = Math.hypot(curX, curZ), tgtR = Math.hypot(tgtX, tgtZ);
    let next: Vector3;
    if (curR > 0.01 && tgtR > 0.01) {
      let dx = (curX / curR) + ((tgtX / tgtR) - (curX / curR)) * cfg.lag;
      let dz = (curZ / curR) + ((tgtZ / tgtR) - (curZ / curR)) * cfg.lag;
      const dLen = Math.hypot(dx, dz);
      if (dLen > 1e-3) {
        dx /= dLen; dz /= dLen;
        const r = curR + (tgtR - curR) * cfg.lag;
        next = new Vector3(
          subject.x + dx * r,
          this.camera.position.y + (finalPos.y - this.camera.position.y) * cfg.lag,
          subject.z + dz * r,
        );
      } else {
        next = Vector3.Lerp(this.camera.position, finalPos, cfg.lag);
      }
    } else {
      next = Vector3.Lerp(this.camera.position, finalPos, cfg.lag);
    }
    this.camera.position = enforceStandoff(subject, next).pos;
    this.aim(subject, objective, velocity);
  }

  /**
   * Cast subject→desired; if blocked closer than MIN_SAFE_DISTANCE, retry at
   * ±50° around the subject before falling back to a guaranteed-clear
   * overhead shot. The camera NEVER returns a position that presents a wall
   * at point-blank range — worst case is an elevated but legible framing.
   */
  private resolveOcclusion(subject: Vector3, desired: Vector3, back?: Vector3): Vector3 {
    const eye = subject.add(new Vector3(0, 1.2, 0));
    const probe = (candidate: Vector3): { pos: Vector3; clearance: number } => {
      const toCam = candidate.subtract(subject);
      const dist = toCam.length();
      if (dist < 0.001) return { pos: candidate, clearance: 0 };
      const dir = toCam.scale(1 / dist);
      const ray = new Ray(eye, dir, dist);
      // E26 FIX: venue walls/floors carry no collision flag in VenueKit, so
      // the old `checkCollisions`-only filter made them invisible to this
      // probe. Accept the venue shell by name as well.
      const hit = this.scene.pickWithRay(ray, (m: AbstractMesh) =>
        m.isPickable && (m.checkCollisions || VENUE_SHELL.test(m.name)));
      if (!hit?.hit || !hit.pickedPoint) return { pos: candidate, clearance: dist };
      const hitDist = Vector3.Distance(eye, hit.pickedPoint);
      const clearDist = Math.max(MIN_SAFE_DISTANCE, hitDist - OCCLUSION_MARGIN);
      return { pos: subject.add(dir.scale(clearDist)).add(new Vector3(0, candidate.y - subject.y, 0)), clearance: clearDist };
    };

    let best = probe(desired);
    if (best.clearance >= MIN_SAFE_DISTANCE + 0.4) return best.pos;

    // occluded close — try two alternate azimuths around the subject
    const dir0 = back ?? desired.subtract(subject).normalizeToNew();
    for (const deg of [50, -50]) {
      const rad = (deg * Math.PI) / 180;
      const rotated = new Vector3(
        dir0.x * Math.cos(rad) - dir0.z * Math.sin(rad), 0,
        dir0.x * Math.sin(rad) + dir0.z * Math.cos(rad),
      );
      const alt = subject.add(rotated.scale(desired.subtract(subject).length())).add(new Vector3(0, desired.y - subject.y, 0));
      const candidate = probe(alt);
      if (candidate.clearance > best.clearance) best = candidate;
      if (best.clearance >= MIN_SAFE_DISTANCE + 0.4) return best.pos;
    }

    // Still boxed in — guaranteed-clear overhead fallback (never a wall). Tested
    // against the FRAMING minimum, not the safety floor: a shot that clears the
    // floor but frames nothing is the failure this is here to avoid.
    if (best.clearance < FRAMING_MIN_DISTANCE) {
      console.warn('[FEL-FRAME] camera boxed in on all probed angles — using overhead fallback');
      return subject.add(new Vector3(0.001, MIN_SAFE_DISTANCE + 1.6, 0.001));
    }
    return best.pos;
  }

  private aim(subject: Vector3, objective: Vector3 | null, velocity?: Vector3): void {
    const cfg = this.cfg;
    const chest = subject.add(new Vector3(0, cfg.targetHeight, 0));

    // Lead the subject along the GROUND direction of travel. This used the raw
    // velocity, which puts the ENTIRE vertical component into the lead: on a
    // downhill the look-target is dragged below the rider and the camera
    // pitches clean past them. That is where every [FEL-FRAME] line in the
    // skate run came from -- the warnings tracked the drop precisely (hero Y
    // 1.89 -> 1.32 -> 0.13 as the camera aimed further and further under him).
    // A little vertical lead is still wanted, so you can see what you are
    // dropping into; it is just not worth a full metre-for-metre share.
    let ahead = chest;
    if (velocity && velocity.lengthSquared() > 0.01) {
      const dir = velocity.normalizeToNew();
      const flat = new Vector3(dir.x, 0, dir.z);
      if (flat.lengthSquared() > 1e-4) flat.normalize();
      // Boxed-in guard (measured 2026-09-02, 1v1 corner): when the venue
      // clamp leaves the camera almost on top of the hero, a full lead puts
      // the look-target a metre past him and the frame loses him off the
      // bottom. Fade the lead to zero as horizontal separation collapses
      // below the framing minimum — up close, look AT him.
      const sep = Math.hypot(this.camera.position.x - subject.x, this.camera.position.z - subject.z);
      const leadScale = Math.max(0, Math.min(1, (sep - 1.0) / (FRAMING_MIN_DISTANCE - 1.0)));
      const lead = cfg.lookAhead * leadScale;
      ahead = chest
        .add(flat.scale(lead))
        .add(new Vector3(0, dir.y * lead * VERTICAL_LEAD_SHARE, 0));
    }

    let target = ahead;
    if (objective) {
      target = Vector3.Lerp(ahead, objective.add(new Vector3(0, cfg.targetHeight * 0.5, 0)), cfg.fitTwo ? 0.5 : 0.35);
      // An objective BIASES the framing; it must never replace the subject.
      // Unleashed, this lerp is fine for a rim 5m away and ruinous for surf's
      // wave lip tens of metres down the line -- 35% of that distance walks the
      // look-target off the surfer, which is what the surf capture kept
      // reporting. Cap the displacement to what provably stays in frame: the
      // frustum half-height at the subject's own distance, times a margin.
      const reach = Vector3.Distance(this.camera.position, chest);
      const maxOff = Math.max(1.2, reach * Math.tan(this.camera.fov / 2) * OBJECTIVE_BIAS_SHARE);
      const off = target.subtract(ahead);
      if (off.length() > maxOff) target = ahead.add(off.normalize().scale(maxOff));
    }
    this.camera.setTarget(target);

    const flat = Vector3.Distance(
      new Vector3(this.camera.position.x, 0, this.camera.position.z),
      new Vector3(target.x, 0, target.z),
    );
    const pitch = Math.atan2(this.camera.position.y - target.y, Math.max(flat, 0.001));
    const floor = (cfg.pitchFloorDeg * Math.PI) / 180;
    const cap = (cfg.pitchCapDeg * Math.PI) / 180;
    if (pitch < floor) this.camera.position.y = target.y + Math.tan(floor) * flat;
    if (pitch > cap) this.camera.position.y = target.y + Math.tan(cap) * flat;
    if (pitch < floor || pitch > cap) this.camera.setTarget(target);
  }
}
