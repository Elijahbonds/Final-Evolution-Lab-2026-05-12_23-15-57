// GroundRide — board-sport rider: ground snap (never float, never sink), carve
// physics, air detection, grind-line attachment (rails AND the overhead lift
// cable). Kinematic and cheap.

import { Ray, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene, TransformNode } from '@babylonjs/core';

export interface GrindLine {
  a: Vector3; b: Vector3;
  /** big-air only lines (the ski-lift cable) need this much height to catch */
  minApproachHeight?: number;
  bonus: number;
  /** Goal credit this rail pays when a grind locks onto it (VENICE-SKATE-THPS). The lock handler reads it off the line
   *  the Rider actually caught — identifying the rail by its INDEX in the world's list cannot work for a rail that
   *  moves, because a moving rail hands out a fresh line object every frame. */
  gapId?: string;
}

/** Per-world overrides for the Rider (pitched pistes need a longer ground ray and a floor below the run). */
export interface RiderCfgOverrides {
  /** Absolute safety floor — the rider is never allowed below this. A pitched piste sets it under its lowest point. */
  hardFloorY?: number;
  /** Ground raycast length from 1.5 m above the root (m). A piste that drops 45 m needs more than the flat 6. */
  rayLength?: number;
  /** While grounded, a surface this far below the root still counts as ridden (glued): descending a pitched slope the
   *  ground falls away faster than gravity catches up within a frame, and without this the rider flickers airborne. */
  stickDown?: number;
  /** Forward accel the Rider adds on its own every frame (m/s², × 0.55–1 with pump). Skate's momentum model owns the
   *  velocity outright and passes 0 — the default 9 was a frame-rate-dependent creep under it (SKATE-MOVE). */
  carveAccel?: number;
  /** Horizontal speed ceiling (m/s, default 16). Surf lifts it with the shared board pace (WALLS + SPEED, 2026-09-15). */
  maxSpeed?: number;
  /** Top speed ALONG a rail (m/s). A grind scrubs — riding a 4 m rail at 8 m/s is over in 0.5 s and reads as a bump,
   *  not a trick (VENICE-SKATE-THPS). Omit for the historic behaviour (the run's own speed, floored at 6). */
  grindSpeed?: number;
  /**
   * SKATE-MAJOR (2026-09-21): the tallest step a GROUNDED board rolls up in one frame (m). This rider has no horizontal
   * collision — one downward ray from 1.5 m above the wheels — so riding into any solid under 1.5 m tall snapped the
   * root onto its top in ONE frame: measured on the plaza, 121 of 168 approaches to its solids were a single-frame lift
   * of 0.45–1.49 m (the picnic table 0.78, a ledge 0.90, a bin 1.05). An elevator, not a ledge — and the rail magnet then
   * handed the lifted rider a free grind on top of it. Above this step the top face is a WALL: the wheels stay where they
   * were and `solidHit` reports the face so the mode can turn the board off it (BoardMovement.wall) and, at speed, bail.
   * Ramps are untouched — the steepest bank in the plaza rises 0.22 m in a boosted frame. 0 (the default) keeps the old
   * behaviour for the snow and surf riders, whose worlds have no interior solids.
   */
  stepUp?: number;
}

/** A solid the wheels could not roll up this frame: the face's normal (planar, pointing back at the rider), the mesh and
 *  the height of the top the rider was refused. */
export interface SolidHit { nx: number; nz: number; mesh: AbstractMesh; top: number }
/** SKATE-MAJOR: a rise under this (m) is a kerb the wheels take whatever its face; above it the slope test applies. 0.25:
 *  over the lip every tilted-slab bank starts with (the outer ramps' slabs are 0.6 m thick and their foot sits 0.20 m up,
 *  the bowl's 0.16 — measured, 0.12 refused a real bank), under the manual pads (0.32) and the stair set (0.34). */
export const KERB_M = 0.25;
/** The steepest rise-over-run a grounded board rides up. 1.2 (≈50°) clears every bank in the game (spine 0.56, bowl 0.55,
 *  outer banks 0.46, pyramid 0.36) and refuses every face a board would actually bonk. */
export const MAX_RIDE_SLOPE = 1.2;
/** How far a refused move is pushed back out of the face (m) — enough that a body inside a footprint walks out of it. */
export const WALL_PUSH_M = 0.03;

export class Rider {
  public vel = Vector3.Zero();
  public grounded = true;
  public grinding: GrindLine | null = null;
  private grindT = 0;
  private down = new Vector3(0, -1, 0);
  /** M42: frames since the raycast last found ground — drives the hard clamp */
  private missedRaycasts = 0;
  /** SKATE-MAJOR: the solid the wheels met this frame (see RiderCfgOverrides.stepUp), cleared every update. */
  public solidHit: SolidHit | null = null;

  /** The last ground height the ray found (null until the first hit): the ray's second origin and the clamp's target. */
  private lastGroundY: number | null = null;
  /** A frame longer than this integrates gravity over this much only — a load stall is not a fall (BOARDS PASS). */
  static readonly MAX_GRAVITY_STEP_SEC = 0.05;
  private cfg: { gravity: number; carveAccel: number; maxSpeed: number; drag: number; snapHeight: number; hardFloorY: number; missThreshold: number; rayLength: number; stickDown: number; grindSpeed: number; stepUp: number };

  constructor(
    private scene: Scene,
    public root: TransformNode,
    private groundMeshes: AbstractMesh[],
    overrides: RiderCfgOverrides = {},
  ) {
    this.cfg = {
      gravity: -14, carveAccel: 9, maxSpeed: 16, drag: 0.35, snapHeight: 0.05,
      // M42: absolute floor — the rider is NEVER allowed below this, raycast or
      // not; and how many consecutive missed raycasts trigger the hard clamp.
      hardFloorY: 0,        //TUNE(elijah): safety floor plane
      missThreshold: 6,     //TUNE(elijah): missed frames before clamp
      grindSpeed: 0,        // 0 = the historic rule below (max(6, run speed))
      rayLength: 6,         // flat parks; the snow piste passes ~80 (it drops ~56 m over the run)
      stickDown: 0,         // flat parks: no glue; the snow piste passes 0.6 (see RiderCfgOverrides.stickDown)
      stepUp: 0,            // 0 = the historic elevator; skate passes 0.45 (see RiderCfgOverrides.stepUp)
      ...overrides,
    };
    if (!groundMeshes.length) {
      console.error('[FEL-SPAWN] Rider: constructed with zero ground meshes — hard floor clamp is the only thing that will hold the rider up');
    }
  }

  /** Top speed this rider is capped at, m/s. Read-only: the SPEED FOV kick normalises against the mode's own
   *  ceiling (a skater flat out and a kart flat out must get the same lens), and `cfg` is private. */
  get topSpeed(): number { return this.cfg.maxSpeed; }

  /** steer: -1..1 · pump: 0..1 (R2) · dt seconds */
  update(dt: number, steer: number, pump: number): void {
    this.solidHit = null;
    if (this.grinding) { this.updateGrind(dt); return; }
    const wasGrounded = this.grounded;
    const prevX = this.root.position.x, prevY = this.root.position.y, prevZ = this.root.position.z;

    // forward accel with pump, lateral carve with steer
    const yaw = this.root.rotation.y;
    const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.vel.addInPlace(fwd.scale((this.cfg.carveAccel * (0.55 + 0.45 * pump)) * dt));
    this.root.rotation.y += steer * 1.9 * dt * (this.grounded ? 1 : 0.5);
    // carve lean reads the turn — eased (~0.1 s), not set: written straight from the stick it rolled the whole rider 16° in
    // one frame on every stick edge (measured 0.3–0.45 m hand jumps at each press / release; ANIM-READABILITY 2026-09-07)
    this.root.rotation.z += (-steer * 0.28 - this.root.rotation.z) * Math.min(1, 12 * dt);

    // drag + clamp
    this.vel.scaleInPlace(1 - this.cfg.drag * dt);
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > this.cfg.maxSpeed) {
      const s = this.cfg.maxSpeed / hSpeed;
      this.vel.x *= s; this.vel.z *= s;
    }

    // gravity + ground snap via raycast (the anti-float fix)
    // BOARDS PASS (2026-09-22) — THE FALL THROUGH THE WORLD. A stalled frame at load (the first frames compile for a
    // second or more) integrated gravity over that whole dt, so the body dropped through the piste before the ray had ever
    // hit; from under the surface a ray cast 1.5 m above the wheels sees nothing, and after `missThreshold` misses the
    // clamp took him to `hardFloorY` — on the snow that is the mountain's BOTTOM (−148 m), where he rode the whole run
    // (measured: y −148.6 for 24 s, gates still counting on x/z). Three rules: the gravity step is capped (a stall is not
    // a fall); the ray starts from the higher of the body and the LAST GROUND it stood on, so a body under the surface
    // finds it again; and the clamp goes to that last ground when there is one, not the world's floor.
    const gdt = Math.min(dt, Rider.MAX_GRAVITY_STEP_SEC);
    this.vel.y += this.cfg.gravity * gdt;
    this.root.position.addInPlace(this.vel.scale(dt));
    const rayFromY = Math.max(this.root.position.y, this.lastGroundY ?? -Infinity) + 1.5;
    const ray = new Ray(new Vector3(this.root.position.x, rayFromY, this.root.position.z), this.down, this.cfg.rayLength + Math.max(0, rayFromY - this.root.position.y - 1.5));
    const hit = this.scene.pickWithRay(ray, (m) => this.groundMeshes.includes(m as AbstractMesh));
    if (hit?.hit && hit.pickedPoint) {
      this.missedRaycasts = 0;
      const groundY = hit.pickedPoint.y;
      this.lastGroundY = groundY;
      if (this.root.position.y < groundY - 0.05) { this.root.position.y = groundY; if (this.vel.y < 0) this.vel.y = 0; }   // under the surface: back up onto it (the tunnelling case)
      // SKATE-MAJOR: a top face the board cannot roll up is a WALL — further above the wheels than a step, or, past a
      // kerb's height, steeper than any bank (rise over this frame's run beyond MAX_RIDE_SLOPE: the plaza's steepest
      // bank is 0.56, the wallride's leaned face 6.2, a box face infinite). The slope test is what keeps a slow board off
      // a near-vertical face: at 3 m/s the leaned wallride rose 0.31 m a frame, under the step, and was climbed.
      // The move is not reverted — a reverted move pinned a rider already inside a footprint for the rest of the run
      // (measured: 80 s against the wallride). The component INTO the face is removed, the rest of the move stands (a
      // scrape slides along), and a hair of push-out clears a body that is already inside the face.
      const run = Math.hypot(this.root.position.x - prevX, this.root.position.z - prevZ);
      const rise = groundY - prevY;
      const wall = this.cfg.stepUp > 0 && wasGrounded && hit.pickedMesh
        && (rise > this.cfg.stepUp || (rise > KERB_M && run > 1e-4 && rise > run * MAX_RIDE_SLOPE));
      if (wall) {
        const n = faceNormalToward(hit.pickedMesh as AbstractMesh, prevX, prevY, prevZ);
        const dx = this.root.position.x - prevX, dz = this.root.position.z - prevZ;
        const into = -(dx * n.x + dz * n.z);                            // how far this frame's move went INTO the face
        const keepX = dx + (into > 0 ? into * n.x : 0), keepZ = dz + (into > 0 ? into * n.z : 0);
        this.root.position.set(prevX + keepX + n.x * WALL_PUSH_M, prevY, prevZ + keepZ + n.z * WALL_PUSH_M);
        this.vel.y = 0;
        this.grounded = true;
        this.solidHit = { nx: n.x, nz: n.z, mesh: hit.pickedMesh as AbstractMesh, top: groundY };
        return;
      }
      // glued: a grounded rider descending a pitched piste stays on it (the surface falls away faster than one frame of
      // gravity); a jump sets grounded=false first, so the pop is never eaten
      const glued = this.grounded && this.cfg.stickDown > 0 && this.root.position.y - groundY <= this.cfg.stickDown;
      if (this.root.position.y <= groundY + this.cfg.snapHeight || glued) {
        if (!this.grounded && this.vel.y < -3) {
          // landing compression is played by the mode: animator.play('jump_land')
        }
        this.root.position.y = groundY;
        this.vel.y = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    } else {
      this.missedRaycasts++;
      this.grounded = false;
    }

    // ── M42 HARD FLOOR CLAMP (fixes E18: skater falls through the floor
    // forever). Once the raycast has missed for several consecutive frames, or
    // the rider is ever below the absolute floor, stop trusting the raycast and
    // clamp directly. Falling through the world forever becomes impossible.
    const belowHardFloor = this.root.position.y < this.cfg.hardFloorY - 0.5;
    if (this.missedRaycasts >= this.cfg.missThreshold || belowHardFloor) {
      const floorY = this.lastGroundY ?? this.cfg.hardFloorY;   // the last snow he stood on, not the mountain's bottom
      console.warn(`[FEL-SPAWN] Rider: ${this.missedRaycasts} missed raycasts (y=${this.root.position.y.toFixed(2)}) — hard-clamping to ${this.lastGroundY !== null ? 'the last ground' : 'floor'} ${floorY.toFixed(2)}`);
      this.root.position.y = floorY;
      this.vel.y = 0;
      this.grounded = true;
      this.missedRaycasts = 0;
    }
  }

  /** `late` (SKATE-MAJOR): the mode's coyote window said the press still counts although the wheels have just left — the
   *  guard here used to swallow exactly the press the window had accepted, so a late ollie off a lip never popped. */
  jump(power: number, late = false): void {
    if (!this.grounded && !late) return;
    this.vel.y = 5 + power * 5.5;
    this.grounded = false;
  }

  /**
   * Try to catch a grind line (rail or lift cable). Call when airborne.
   *
   * `radius` (VENICE-SKATE-THPS, 2026-09-09) is the catch sphere in metres, default the historic 1.1. That default is
   * measured from `root.position`, which on a board rider sits at the FEET — so a rail whose bar is 0.5 m up already
   * spends half the budget on height, leaving well under a metre of horizontal window to thread at 8 m/s. Skate's own
   * eye never once locked a rail. The mode passes a real magnet radius and an alignment test of its own; nothing else
   * that calls this changes.
   */
  tryGrind(lines: GrindLine[], radius = 1.1): GrindLine | null {
    if (this.grounded || this.grinding) return null;
    let best: GrindLine | null = null, bestD = Infinity, bestT = 0;
    for (const line of lines) {
      if (line.minApproachHeight && this.root.position.y < line.minApproachHeight) continue;
      const t = closestT(line.a, line.b, this.root.position);
      const point = Vector3.Lerp(line.a, line.b, t);
      const d = Vector3.Distance(point, this.root.position);
      if (d < radius && d < bestD) { best = line; bestD = d; bestT = t; }
    }
    if (!best) return null;
    // the NEAREST rail wins, not the first one in the list: the plaza's five lines cross, and taking list order handed
    // the lock to a rail the rider was not on
    this.grinding = best;
    this.grindT = bestT;
    this.vel.y = 0;
    return best;
  }

  private updateGrind(dt: number): void {
    const line = this.grinding!;
    const len = Vector3.Distance(line.a, line.b);
    const dir = Math.hypot(this.vel.x, this.vel.z) >= 0.5 ? Math.sign(
      Vector3.Dot(line.b.subtract(line.a), this.vel)) || 1 : 1;
    const run = Math.hypot(this.vel.x, this.vel.z);
    const alongSpeed = this.cfg.grindSpeed > 0 ? Math.max(3.5, Math.min(this.cfg.grindSpeed, run)) : Math.max(6, run);
    this.grindT += (dir * alongSpeed * dt) / len;
    if (this.grindT <= 0 || this.grindT >= 1) { this.dismount(); return; }
    const p = Vector3.Lerp(line.a, line.b, this.grindT);
    this.root.position.copyFrom(p);
    const along = line.b.subtract(line.a).normalize();
    this.root.rotation.y = Math.atan2(along.x, along.z);
    this.root.rotation.z = Math.sin(performance.now() / 180) * 0.06;  // balance wobble
  }

  /**
   * Leave the rail. The END of a rail is a hop off it (the historic 2.5 m/s). A `slip` (SKATE-MAJOR) is a FALL: the
   * balance went, so the body drops off the side the needle tipped to (`side`, −1 / +1 across the rail) with no hop —
   * a slipped grind used to pop 2.5 m/s UP off the rail, exactly like a clean dismount, and then graded a clean landing.
   */
  dismount(slip: 'end' | 'slip' = 'end', side = 1): void {
    if (!this.grinding) return;
    const line = this.grinding;
    this.grinding = null;
    if (slip === 'slip') {
      const along = line.b.subtract(line.a); along.y = 0; along.normalize();
      const across = new Vector3(along.z, 0, -along.x).scale(side * 1.4);   // off the side, not down the rail
      this.vel.x = this.vel.x * 0.35 + across.x; this.vel.z = this.vel.z * 0.35 + across.z;
      this.vel.y = 0.4;
    } else this.vel.y = 2.5;
    this.grounded = false;
  }
}

/**
 * The face of `mesh` that a point just outside it is nearest to, as a planar unit normal pointing OUT of the mesh toward
 * that point — read off the mesh's own bounding box in its local frame, so a rotated ledge, a leaned wallride or a bank's
 * back face all answer with the face the rider actually met. A corner (outside on both axes) answers with the axis the
 * point is further outside on.
 */
export function faceNormalToward(mesh: AbstractMesh, x: number, y: number, z: number): Vector3 {
  const wm = mesh.getWorldMatrix();
  const inv = wm.clone().invert();
  const lp = Vector3.TransformCoordinates(new Vector3(x, y, z), inv);
  const bb = mesh.getBoundingInfo().boundingBox;
  const min = bb.minimum, max = bb.maximum;
  // signed distance OUTSIDE each face (positive = outside that face)
  const outXmin = min.x - lp.x, outXmax = lp.x - max.x, outZmin = min.z - lp.z, outZmax = lp.z - max.z;
  const cands: [number, Vector3][] = [
    [outXmin, new Vector3(-1, 0, 0)], [outXmax, new Vector3(1, 0, 0)], [outZmin, new Vector3(0, 0, -1)], [outZmax, new Vector3(0, 0, 1)],
  ];
  cands.sort((a, b) => b[0] - a[0]);
  const local = cands[0][1];
  const n = Vector3.TransformNormal(local, wm); n.y = 0;
  if (n.lengthSquared() < 1e-9) return new Vector3(0, 0, 1);
  return n.normalize();
}

function closestT(a: Vector3, b: Vector3, p: Vector3): number {
  const ab = b.subtract(a);
  const t = Vector3.Dot(p.subtract(a), ab) / Math.max(ab.lengthSquared(), 1e-9);
  return Math.min(1, Math.max(0, t));
}
