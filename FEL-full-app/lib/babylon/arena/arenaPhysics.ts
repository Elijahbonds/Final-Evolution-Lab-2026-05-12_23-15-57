// PHYSICS ARENA — the shared physics core on Havok (docs/PHYSICS-ARENA-PLAN.md §2).
//
// One world per arena scene, on the app's single Havok bootstrap (core/Physics.ts initPhysics: the same WASM, the same plugin):
//   - a FIXED step (ARENA_STEP_HZ, 120 by default) run by the mode from its own update(), so a pause, a replay hold or a
//     hit-stop holds the simulation too (the scene's own per-render physics step is switched off), and the same inputs in the
//     same order give the same world (what the host-authoritative online mirror needs: the host simulates, the others draw);
//   - the ball: a Havok sphere with a basketball's mass and a hollow sphere's inertia, so spin is real (backspin softens a
//     bounce off the iron, a rolling ball keeps rolling);
//   - the hoop: the ring as capsules laid round the circle, the glass, the bracket and the pole, all static; the net as a drag
//     the ball feels while it is inside the cone;
//   - the players: upright capsules driven by velocity with an acceleration cap (contact costs momentum: core/ContactSystem's
//     drive, which this does not import because its bodies cannot take a collision filter);
//   - collision filters, so a handler's own body never fights the ball he is dribbling, while the other body always can.
// Every bounce is the materials' (restitution combined by MINIMUM: the ball is 1, each surface says how much it keeps).

import {
  PhysicsBody, PhysicsMotionType, PhysicsShapeBox, PhysicsShapeCapsule, PhysicsShapeContainer, PhysicsShapeSphere,
  PhysicsMaterialCombineMode, Quaternion, TransformNode, Vector3,
} from '@babylonjs/core';
import type { IPhysicsCollisionEvent, PhysicsMaterial, PhysicsShape, Scene, HavokPlugin, PhysicsEngine } from '@babylonjs/core';
import { initPhysics } from '../core/Physics';
import { ARENA_MAX_STEPS, BODY_BOUNCE, boardBounce, floorBounce, rimBounce, stepHz } from './arenaConfig';
import { ARENA_RIM, BALL_MASS, BALL_R, NET, RIM_TUBE_R, armBox, boardBox, bracketBox, inNet, netRadiusAt, poleBox, rimSegments, type P3 } from './hoopGeometry';

/** Collision layers. Player i is bit (PLAYER0 << i). */
export const LAYER = { STATIC: 1, BALL: 2, PLAYER0: 4 } as const;
export const playerBit = (i: number): number => LAYER.PLAYER0 << i;
const ALL_PLAYERS = 0xfffffffc;

export type Surface = 'floor' | 'rim' | 'board' | 'frame' | 'body';
export interface BallContact { surface: Surface; impulse: number; playerId?: string; /** Which ball (its index in `balls`). */ ball: number }

const mat = (restitution: number, friction: number): PhysicsMaterial => ({
  restitution, friction, staticFriction: friction,
  restitutionCombine: PhysicsMaterialCombineMode.MINIMUM, frictionCombine: PhysicsMaterialCombineMode.MINIMUM,
});

const v3 = (p: P3): Vector3 => new Vector3(p.x, p.y, p.z);

function filter(shape: PhysicsShape, member: number, collide: number): void {
  shape.filterMembershipMask = member;
  shape.filterCollideMask = collide;
}

export class ArenaBall {
  readonly body: PhysicsBody;
  readonly shape: PhysicsShapeSphere;
  /** Being carried to a point (a hold, a set point): gravity off, the velocity steered there each step. */
  private holdAt: Vector3 | null = null;
  private ignoreMask = 0;
  private ignoreUntil = 0;
  private readonly tmp = new Vector3();
  constructor(readonly node: TransformNode, private world: ArenaPhysics) {
    this.body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, node.getScene());
    this.shape = new PhysicsShapeSphere(Vector3.Zero(), BALL_R, node.getScene());
    this.shape.material = mat(1, 0.75);
    filter(this.shape, LAYER.BALL, LAYER.STATIC | ALL_PLAYERS);
    this.body.shape = this.shape;
    // a hollow sphere: I = 2/3 m r^2 (Havok's default would be a solid ball of water's density, 12 times the mass)
    const I = (2 / 3) * BALL_MASS * BALL_R * BALL_R;
    this.body.setMassProperties({ mass: BALL_MASS, inertia: new Vector3(I, I, I) });
    // no air drag: a real ball loses about a tenth of a metre a second squared at shooting speed, and a shooter's hand allows for it
    // without thinking; the aim solve here does not, so drag would only make every shot short
    this.body.setLinearDamping(0);
    this.body.setAngularDamping(0.05);
    this.body.setCollisionCallbackEnabled(true);
  }
  get pos(): Vector3 { return this.node.position; }
  vel(out = new Vector3()): Vector3 { this.body.getLinearVelocityToRef(out); return out; }
  spin(out = new Vector3()): Vector3 { this.body.getAngularVelocityToRef(out); return out; }
  get held(): boolean { return this.holdAt !== null; }
  /** Carry the ball to `p` (world): it is steered there each step, still solid to everything it is not told to ignore. */
  hold(p: Readonly<P3>): void {
    if (!this.holdAt) { this.holdAt = new Vector3(); this.body.setGravityFactor(0); }
    this.holdAt.set(p.x, p.y, p.z);
  }
  /** Let go with this velocity and spin (a shot, a pass, a push). */
  launch(vel: Readonly<P3>, spin: Readonly<P3> = { x: 0, y: 0, z: 0 }): void {
    this.holdAt = null;
    this.body.setGravityFactor(1);
    this.body.setLinearVelocity(this.tmp.set(vel.x, vel.y, vel.z));
    this.body.setAngularVelocity(new Vector3(spin.x, spin.y, spin.z));
  }
  /** Drop a hold without a throw (the ball falls from where it is). */
  free(): void { this.launch(this.vel()); }
  /** This player's body passes through the ball (his own dribble, his own release) for `sec` seconds; 0 = until changed. */
  ignore(playerMask: number, sec = 0): void {
    this.ignoreMask = playerMask;
    this.ignoreUntil = sec > 0 ? this.world.time + sec : Infinity;
    filter(this.shape, LAYER.BALL, (LAYER.STATIC | ALL_PLAYERS) & ~playerMask);
  }
  /** Solid to every body again. */
  collideAll(): void { if (this.ignoreMask) { this.ignoreMask = 0; filter(this.shape, LAYER.BALL, LAYER.STATIC | ALL_PLAYERS); } }
  get ignoring(): number { return this.ignoreMask; }
  /** Put the ball somewhere, still (a reset). */
  teleport(p: Readonly<P3>): void {
    this.holdAt = null;
    this.body.setGravityFactor(1);
    this.node.position.set(p.x, p.y, p.z);
    this.body.setLinearVelocity(Vector3.Zero());
    this.body.setAngularVelocity(Vector3.Zero());
    this.world.pushTransform(this.body);
  }
  /** @internal one fixed step's hand on the ball (hold steering, the net's drag, the ignore timer). */
  preStep(h: number): void {
    if (this.ignoreMask && this.world.time >= this.ignoreUntil) this.collideAll();
    if (this.holdAt) {
      const p = this.node.position;
      const k = 1 / h;
      const vx = (this.holdAt.x - p.x) * k, vy = (this.holdAt.y - p.y) * k, vz = (this.holdAt.z - p.z) * k;
      const s = Math.hypot(vx, vy, vz), cap = 14;   // a hand moves a ball fast, not instantly across the court
      const f = s > cap ? cap / s : 1;
      this.body.setLinearVelocity(this.tmp.set(vx * f, vy * f, vz * f));
      this.body.setAngularVelocity(Vector3.Zero());
      return;
    }
    const p = this.node.position;
    const below = ARENA_RIM.y - p.y;
    if (below > 0 && below < NET.h && !inNet(p)) {
      // the net from outside: a ball against the cords cannot pass into the cone under the ring (a short ball that slides off
      // the front of the iron drops in front of the net, it does not slip in under the ring)
      const rx = p.x - ARENA_RIM.x, rz = p.z - ARENA_RIM.z, rr = Math.hypot(rx, rz);
      if (rr > 1e-4 && rr < netRadiusAt(p.y) + BALL_R) {
        const v = this.vel(this.tmp);
        const inward = -(v.x * rx + v.z * rz) / rr;
        if (inward > 0) this.body.setLinearVelocity(v.set(v.x + (inward * rx) / rr * 1.3, v.y, v.z + (inward * rz) / rr * 1.3));
      }
    }
    if (inNet(p)) {
      // the net: the cords take the ball's sideways speed and some of its fall (a swish slows and drops, it does not stop), and
      // the cone's wall turns an outward ball back in (a ball does not leave a net through its side)
      const v = this.vel(this.tmp);
      const kh = Math.exp(-NET.dragPerSec * h), kv = Math.exp(-NET.dragPerSec * 0.2 * h);
      let vx = v.x * kh, vz = v.z * kh;
      const rx = p.x - ARENA_RIM.x, rz = p.z - ARENA_RIM.z, rr = Math.hypot(rx, rz);
      if (rr > 1e-4) {
        const out = (vx * rx + vz * rz) / rr;
        if (out > 0 && rr > netRadiusAt(p.y) - BALL_R) { vx -= (out * rx) / rr; vz -= (out * rz) / rr; }
      }
      this.body.setLinearVelocity(v.set(vx, v.y * kv, vz));
    }
  }
}

export interface PlayerOpts { mass?: number; radius?: number; height?: number }

export class ArenaPlayer {
  readonly body: PhysicsBody;
  readonly bit: number;
  readonly radius: number;
  readonly height: number;
  private readonly tmp = new Vector3();
  constructor(readonly id: string, readonly node: TransformNode, index: number, private world: ArenaPhysics, opts: PlayerOpts = {}) {
    const scene = node.getScene();
    this.radius = opts.radius ?? 0.3;
    this.height = opts.height ?? 1.92;
    this.bit = playerBit(index);
    this.body = new PhysicsBody(node, PhysicsMotionType.DYNAMIC, false, scene);
    const shape = new PhysicsShapeCapsule(new Vector3(0, this.radius, 0), new Vector3(0, this.height - this.radius, 0), this.radius, scene);
    // the body's surface: the ball keeps BODY_BOUNCE off it (the ball's own material is 1, combined by MINIMUM); against the floor
    // the floor's bounce would win, so a landing body is kept from hopping by its own drive (feet on the floor: drive() zeroes a
    // small upward speed below)
    shape.material = mat(BODY_BOUNCE, 0.15);
    filter(shape, this.bit, LAYER.STATIC | LAYER.BALL | (ALL_PLAYERS & ~this.bit));
    this.body.shape = shape;
    this.body.setMassProperties({ mass: opts.mass ?? 90, inertia: new Vector3(0, 0, 0) });   // upright: contact never tips a body
    this.body.setAngularDamping(99);
    this.body.setLinearDamping(0);   // drive() owns the planar speed; a jump is plain ballistics, so its top is where the maths says
    this.body.setCollisionCallbackEnabled(true);
  }
  get pos(): Vector3 { return this.node.position; }
  vel(out = new Vector3()): Vector3 { this.body.getLinearVelocityToRef(out); return out; }
  /** On the floor (feet within 3 cm and not rising). */
  get grounded(): boolean {
    if (this.jumping && this.world.time - this.jumpAt > 0.1) this.jumping = false;
    return this.node.position.y < 0.03 && this.vel(this.tmp).y < 0.6;
  }
  /** Steer the planar velocity toward `wish` with an acceleration cap (m/s²): a blocked drive bleeds into the solver. */
  drive(wishX: number, wishZ: number, h: number, accelCap = 30): void {
    const cur = this.vel(this.tmp);
    if (this.node.position.y < 0.03 && cur.y > 0 && cur.y < 1.2 && !this.jumping) cur.y = 0;   // a landing does not bounce a body
    const dx = wishX - cur.x, dz = wishZ - cur.z;
    const d = Math.hypot(dx, dz), maxDV = accelCap * h;
    const k = d > maxDV ? maxDV / d : 1;
    this.body.setLinearVelocity(cur.set(cur.x + dx * k, cur.y, cur.z + dz * k));
  }
  /** Set on a jump until the body is clearly up (so the landing clamp in drive() never eats the take-off). */
  private jumping = false;
  private jumpAt = 0;
  jump(vy: number): void {
    this.jumping = true; this.jumpAt = this.world.time;
    const cur = this.vel(this.tmp);
    this.body.setLinearVelocity(cur.set(cur.x, vy, cur.z));
  }
  teleport(p: Readonly<P3>): void {
    this.node.position.set(p.x, p.y, p.z);
    this.body.setLinearVelocity(Vector3.Zero());
    this.world.pushTransform(this.body);
  }
}

export interface ArenaStepStats { steps: number; ms: number }

export class ArenaPhysics {
  /** The first ball (a game has one; the 3-point contest has several in the air at once: `balls`). */
  ball!: ArenaBall;
  readonly balls: ArenaBall[] = [];
  readonly players: ArenaPlayer[] = [];
  /** Simulated seconds. */
  time = 0;
  /** The last frame's steps and their cost (ms): the plan's phone budget reads it. */
  readonly stats: ArenaStepStats = { steps: 0, ms: 0 };
  /** Every ball contact since the last drain (for sound, the HUD's "off the glass", and the tests). */
  private contacts: BallContact[] = [];
  private acc = 0;
  private teleports: PhysicsBody[] = [];
  private surfaceOf = new Map<PhysicsBody, Surface>();
  private playerOf = new Map<PhysicsBody, ArenaPlayer>();
  private ballOf = new Map<PhysicsBody, number>();
  private disposers: Array<() => void> = [];
  private engine!: PhysicsEngine;

  private constructor(readonly scene: Scene, readonly plugin: HavokPlugin) {}

  /** Build the world: Havok on this scene (the shared bootstrap), the floor, the hoop and the ball. */
  static async create(scene: Scene, opts: { hoop?: boolean; ballNode?: TransformNode } = {}): Promise<ArenaPhysics> {
    const handle = await initPhysics(scene);
    const w = new ArenaPhysics(scene, handle.plugin);
    w.engine = scene.getPhysicsEngine() as unknown as PhysicsEngine;
    // the mode steps the world (fixed step, held by a pause); the scene must not also step it once per render
    scene.physicsEnabled = false;
    // the bootstrap's own thin ground: the floor's material and layer, so the ball bounces the same on it
    handle.ground.shape.material = mat(floorBounce(), 0.6);
    filter(handle.ground.shape, LAYER.STATIC, LAYER.BALL | ALL_PLAYERS);
    w.surfaceOf.set(handle.ground.body, 'floor');
    // a thick floor under it: nothing tunnels through a metre of slab
    w.staticBox('arena_floor', { x: 0, y: -0.5, z: 4 }, { x: 30, y: 0.5, z: 30 }, mat(floorBounce(), 0.6), 'floor');
    if (opts.hoop !== false) w.buildHoop();
    const ballNode = opts.ballNode ?? new TransformNode('arena_ball_body', scene);   // the drawn ball can be the body's node
    ballNode.position.set(0, 1, 6);
    w.ball = w.addBall(ballNode);
    const obs = handle.plugin.onCollisionObservable.add((e: IPhysicsCollisionEvent) => w.onCollision(e));
    w.disposers.push(() => handle.plugin.onCollisionObservable.remove(obs));
    return w;
  }

  private staticBox(name: string, centre: P3, half: P3, m: PhysicsMaterial, surface: Surface): PhysicsBody {
    const node = new TransformNode(name, this.scene);
    node.position.set(centre.x, centre.y, centre.z);
    const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, this.scene);
    const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(half.x * 2, half.y * 2, half.z * 2), this.scene);
    shape.material = m;
    filter(shape, LAYER.STATIC, LAYER.BALL | ALL_PLAYERS);
    body.shape = shape;
    this.surfaceOf.set(body, surface);
    return body;
  }

  private buildHoop(): void {
    const rimNode = new TransformNode('arena_rim_body', this.scene);
    const body = new PhysicsBody(rimNode, PhysicsMotionType.STATIC, false, this.scene);
    const ring = new PhysicsShapeContainer(this.scene);
    const iron = mat(rimBounce(), 0.5);
    for (const [a, b] of rimSegments()) {
      const seg = new PhysicsShapeCapsule(v3(a), v3(b), RIM_TUBE_R, this.scene);
      seg.material = iron;
      filter(seg, LAYER.STATIC, LAYER.BALL | ALL_PLAYERS);
      ring.addChild(seg);
    }
    ring.material = iron;
    filter(ring, LAYER.STATIC, LAYER.BALL | ALL_PLAYERS);
    body.shape = ring;
    this.surfaceOf.set(body, 'rim');
    const b = boardBox(), br = bracketBox(), p = poleBox();
    this.staticBox('arena_board_body', b.centre, b.half, mat(boardBounce(), 0.35), 'board');
    this.staticBox('arena_bracket_body', br.centre, br.half, mat(rimBounce(), 0.5), 'rim');
    this.staticBox('arena_pole_body', p.centre, p.half, mat(0.4, 0.5), 'frame');
    const arm = armBox();
    this.staticBox('arena_arm_body', arm.centre, arm.half, mat(0.4, 0.5), 'frame');
  }

  /** Another ball in the same world (the 3-point contest's racks). Its node is the drawn ball. */
  addBall(node: TransformNode): ArenaBall {
    const b = new ArenaBall(node, this);
    this.ballOf.set(b.body, this.balls.length);
    this.balls.push(b);
    return b;
  }

  addPlayer(id: string, node: TransformNode, opts: PlayerOpts = {}): ArenaPlayer {
    const pl = new ArenaPlayer(id, node, this.players.length, this, opts);
    this.players.push(pl);
    this.playerOf.set(pl.body, pl);
    return pl;
  }

  /** @internal a node moved by hand reaches its body on the next step. */
  pushTransform(body: PhysicsBody): void { body.disablePreStep = false; this.teleports.push(body); }

  /**
   * Advance by the frame's dt in fixed steps. `beforeStep(h)` runs before each step (inputs → velocities), `afterStep(h)` after
   * (the hoop sensor sweeps the ball's step). Returns the steps taken; a frame that would need more than ARENA_MAX_STEPS drops the
   * rest (a slow phone frame slows the game a little instead of stalling it).
   */
  step(dt: number, beforeStep?: (h: number) => void, afterStep?: (h: number) => void): number {
    const hz = Math.max(30, Math.min(480, stepHz()));
    const h = 1 / hz;
    this.acc += Math.max(0, Math.min(0.25, dt));
    let n = 0;
    const t0 = performance.now();
    while (this.acc >= h - 1e-9 && n < ARENA_MAX_STEPS) {
      beforeStep?.(h);
      for (const b of this.balls) b.preStep(h);
      this.engine._step(h);
      if (this.teleports.length) { for (const b of this.teleports) b.disablePreStep = true; this.teleports.length = 0; }
      this.time += h;
      afterStep?.(h);
      this.acc -= h;
      n++;
    }
    if (n === ARENA_MAX_STEPS) this.acc = 0;
    this.stats.steps = n;
    this.stats.ms = performance.now() - t0;
    return n;
  }

  private onCollision(e: IPhysicsCollisionEvent): void {
    const bi = this.ballOf.get(e.collider) ?? this.ballOf.get(e.collidedAgainst);
    if (bi === undefined) return;
    const ballBody = this.balls[bi].body;
    const other = e.collider === ballBody ? e.collidedAgainst : e.collider;
    if (this.ballOf.has(other)) return;   // ball on ball: not a surface the rules read
    const pl = this.playerOf.get(other);
    const surface: Surface | undefined = pl ? 'body' : this.surfaceOf.get(other);
    if (!surface) return;
    if (this.contacts.length < 64) this.contacts.push({ surface, impulse: e.impulse ?? 0, playerId: pl?.id, ball: bi });
  }

  drainContacts(): BallContact[] { const out = this.contacts; this.contacts = []; return out; }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.scene.physicsEnabled = true;
  }
}
