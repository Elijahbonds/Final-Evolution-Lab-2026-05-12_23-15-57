// ContactSystem — Mode 1 Phase 4: real contact physics for 1v1/3v3.
//
// Players become DYNAMIC Havok capsules driven by velocity (CourtMovement
// supplies the wish velocity; Havok supplies the collision truth). This is
// what makes a drive into a set defender COST something: momentum exchange
// is computed by the solver, not by a pushback circle — bodies never clip,
// and a braced (boxing-out) defender barely moves.
//
//   - drive(): per-frame velocity write (rotation is locked — capsules stay
//     upright; facing stays on the visual root).
//   - brace(): box-out/post-up — mass x4 + damping spike; the pusher feels
//     a wall, the braced player can still be moved by a real sprint drive
//     (mass advantage, not immovability).
//   - collisions: observed per frame; classifyContact() turns closing speed
//     + context into bump / hard contact / FOUL, which modes route to the
//     score/momentum layer.
//   - teleport(): possession resets (dynamic bodies need velocity zeroing,
//     not just a position write).

import { Vector3, PhysicsAggregate, PhysicsMotionType, PhysicsShapeType, TransformNode } from '@babylonjs/core';
import type { Scene, IPhysicsCollisionEvent } from '@babylonjs/core';
import { initPhysics } from './Physics';

export interface ContactBodyOpts {
  mass?: number;          // kg — a guard ~85, a big ~110
  radius?: number;
  height?: number;
}

export type ContactSeverity = 'bump' | 'hard' | 'foul';

export interface ContactEvent {
  a: string; b: string;
  closingSpeed: number;   // m/s along the contact normal at impact
  severity: ContactSeverity;
}

/** Foul thresholds: light bumps are basketball; a high-speed hit on an
 *  airborne shooter or a blindside collision is a foul. */
export const FOUL_CLOSING_SPEED = 4.2;      // m/s
export const HARD_CONTACT_SPEED = 2.4;

export function classifyContact(closingSpeed: number, ctx: { shooterAirborne?: boolean } = {}): ContactSeverity {
  if (closingSpeed >= FOUL_CLOSING_SPEED && ctx.shooterAirborne) return 'foul';
  if (closingSpeed >= FOUL_CLOSING_SPEED * 1.25) return 'foul';   // wreckless even on the floor
  if (closingSpeed >= HARD_CONTACT_SPEED) return 'hard';
  return 'bump';
}

interface Entry {
  id: string;
  root: TransformNode;
  agg: PhysicsAggregate;
  baseMass: number;
  braced: boolean;
  lastVel: Vector3;
}

export class ContactSystem {
  private entries: Entry[] = [];
  private byId = new Map<string, Entry>();
  private contactQueue: ContactEvent[] = [];
  private pairCooldown = new Map<string, number>();
  private ready = false;

  async init(scene: Scene): Promise<void> {
    const handle = await initPhysics(scene);
    this.ready = true;
    // v2 physics: collision events live on the plugin, not the engine.
    handle.plugin.onCollisionObservable.add((e: IPhysicsCollisionEvent) => {
      this.onCollision(e);
    });
  }

  get isReady(): boolean { return this.ready; }

  addBody(id: string, root: TransformNode, opts: ContactBodyOpts = {}): void {
    const mass = opts.mass ?? 90;
    const radius = opts.radius ?? 0.38;
    const height = opts.height ?? 1.86;
    const agg = new PhysicsAggregate(root as never, PhysicsShapeType.CAPSULE, {
      mass, radius,
      pointA: new Vector3(0, radius, 0),
      pointB: new Vector3(0, height - radius, 0),
      restitution: 0.05, friction: 0.85,
    } as never, root.getScene());
    agg.body.setMotionType(PhysicsMotionType.DYNAMIC);
    // stay upright: no tipping from contact
    agg.body.setAngularDamping(99);
    agg.body.setMassProperties({ inertia: new Vector3(0, 0, 0) });
    agg.body.setLinearDamping(0.4);
    agg.body.setCollisionCallbackEnabled(true);
    const entry: Entry = { id, root, agg, baseMass: mass, braced: false, lastVel: Vector3.Zero() };
    this.entries.push(entry);
    this.byId.set(id, entry);
  }

  /** Per-frame: steer the body TOWARD the wish velocity with an acceleration
   *  cap (never hard-set). The cap is what lets contact win: a blocked drive
   *  bleeds real momentum in the solver instead of teleporting through the
   *  defender, and a braced defender's mass actually resists. */
  drive(id: string, wish: Vector3, dt: number, accelCap = 34): void {
    const e = this.byId.get(id);
    if (!e) return;
    const cur = e.agg.body.getLinearVelocity();
    const maxDV = accelCap * dt;
    const dx = wish.x - cur.x, dz = wish.z - cur.z;
    const d = Math.hypot(dx, dz);
    const k = d > maxDV ? maxDV / d : 1;
    e.agg.body.setLinearVelocity(new Vector3(cur.x + dx * k, cur.y, cur.z + dz * k));
    e.lastVel.set(cur.x, 0, cur.z);
  }

  /** Box-out / post-up brace: heavier and deader to pushes. */
  brace(id: string, on: boolean): void {
    const e = this.byId.get(id);
    if (!e || e.braced === on) return;
    e.braced = on;
    e.agg.body.setMassProperties({ mass: on ? e.baseMass * 4 : e.baseMass, inertia: new Vector3(0, 0, 0) });
    e.agg.body.setLinearDamping(on ? 3.2 : 0.4);
  }

  /** Physics owns root transforms while a ContactSystem is live — modes must
   *  NOT write root.position directly for bound characters (drive/teleport
   *  instead). No manual sync needed: Havok drives the transform nodes. */

  /** Possession reset: move a dynamic body cleanly (zero momentum). */
  teleport(id: string, pos: Vector3): void {
    const e = this.byId.get(id);
    if (!e) return;
    e.agg.body.setLinearVelocity(Vector3.Zero());
    e.agg.body.setAngularVelocity(Vector3.Zero());
    e.root.position.copyFrom(pos);
    e.agg.body.disablePreStep = false;             // push node → body this frame
  }

  private onCollision(e: IPhysicsCollisionEvent): void {
    const ea = this.entries.find((x) => x.agg.body === e.collider || x.agg.body === e.collidedAgainst);
    if (!ea) return;
    const otherBody = e.collider === ea.agg.body ? e.collidedAgainst : e.collider;
    const eb = this.entries.find((x) => x.agg.body === otherBody);
    if (!eb) return;                               // hit the ground/props — not a player contact
    // closing speed along the contact normal, from last driven velocities
    const n = e.normal ?? Vector3.Up();
    const rel = ea.lastVel.subtract(eb.lastVel);
    const closing = Math.abs(Vector3.Dot(rel, n));
    const sev = classifyContact(closing);
    if (sev !== 'bump' || closing > 1.2) {
      this.contactQueue.push({ a: ea.id, b: eb.id, closingSpeed: closing, severity: sev });
    }

    // ── Momentum exchange — the contact that costs something. A sustained
    // drive into a body can't slide it forever: each impact (cooldown-gated
    // so it's one impulse per collision, not per frame) bleeds the
    // attacker's momentum and shoves the target. A BRACED target absorbs
    // the hit: the attacker stalls hard, the brace barely gives ground.
    const key = ea.id < eb.id ? `${ea.id}|${eb.id}` : `${eb.id}|${ea.id}`;
    const now = performance.now();
    if (closing > 0.8 && (this.pairCooldown.get(key) ?? 0) < now) {
      this.pairCooldown.set(key, now + 300);
      // attacker = whichever body is moving faster along the normal
      const aAlong = Vector3.Dot(ea.lastVel, n);
      const bAlong = Vector3.Dot(eb.lastVel, n);
      const attacker = Math.abs(aAlong) >= Math.abs(bAlong) ? ea : eb;
      const target = attacker === ea ? eb : ea;
      const aV = attacker.agg.body.getLinearVelocity();
      const tV = target.agg.body.getLinearVelocity();
      if (target.braced) {
        attacker.agg.body.setLinearVelocity(aV.subtract(n.scale(aAlong >= 0 ? closing * 0.85 : -closing * 0.85)));
        target.agg.body.setLinearVelocity(tV.add(n.scale(aAlong >= 0 ? closing * 0.08 : -closing * 0.08)));
      } else {
        attacker.agg.body.setLinearVelocity(aV.subtract(n.scale(aAlong >= 0 ? closing * 0.55 : -closing * 0.55)));
        target.agg.body.setLinearVelocity(tV.add(n.scale(aAlong >= 0 ? closing * 0.25 : -closing * 0.25)));
      }
    }
  }

  /** Drain this frame's contact events (modes read fouls/bumps here). */
  drainContacts(): ContactEvent[] {
    const out = this.contactQueue;
    this.contactQueue = [];
    return out;
  }

  dispose(): void {
    this.entries.forEach((e) => e.agg.dispose());
    this.entries = [];
    this.byId.clear();
    this.ready = false;
  }
}
