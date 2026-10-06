/**
 * Mind powers (plan A2: "telekinesis grab and throw, slow-time through time:scale [TUNE] world 0.32, self 0.92, as
 * MatrixFocus"; barrier and foresight).
 *
 *   TELEKINESIS  grab a LIGHT hostile (a heavy one refuses, and nothing is spent), lift it to a point in front of you
 *                and hold it there while the button is held (energy per second; it drops when the energy runs out),
 *                release to THROW it along your aim. The thrown body hits whatever it passes (HordeDynamics' body
 *                throw: its path test, its throw speed) and takes the impact itself when the flight ends.
 *   SLOW-TIME    MatrixFocus held on purpose: the world at 0.32, you at 0.92, on energy instead of a meter. The host
 *                owns the clock, so the power only ASKS (a `time:scale` event when it starts, and one with sec 0 and
 *                scales of 1 when it stops).
 *   BARRIER      absorbs the next hits up to its strength (damage.ts reads it), for a few seconds.
 *   FORESIGHT    widens the parry window for a few seconds (combat/defense.ts reads it).
 *
 * A2 owns the held body's stunSec and impulse; A1 still moves it (it adds the impulse). Pure.
 */

import { FOCUS } from '@/lib/babylon/core/MatrixFocus';
import { THROW, pathHits, type Body2 } from '@/lib/babylon/core/HordeDynamics';
import type { AdventureActor, AdventureBus, AdventureWorld } from '../contracts';
import { applyHit, makeHitSpec, requestPlanarVel, requestVy, resetHitSpec } from '../combat/damage';
import { fightStateOf } from '../combat/fightState';
import { isHostile } from '../combat/lock';

/** Slow-time's clocks (MatrixFocus). */
export const SLOW_TIME = { world: FOCUS.worldScale, self: FOCUS.heroScale, minToStart: FOCUS.minToStart } as const;

/** Telekinesis feel. [TUNE] (the throw speed is HordeDynamics': 7 m in 0.5 s). */
export const TELEKINESIS = {
  /** Where the body is held: this far in front of the caster and this high. */
  holdForwardM: 2.2,
  holdUpM: 1.6,
  /** How hard it is pulled to the hold point (1/s) and its fastest pull, m/s. */
  pullGain: 8,
  pullMaxSpeed: 12,
  throwSpeed: THROW.throwDist / THROW.throwSec,   // 14 m/s
  throwSec: THROW.throwSec * 1.4,                 // a little longer in the air than a hand throw: it flies from a lift
  throwUpVy: 2.5,
  /** Who the flying body hits: within this of its path. */
  hitM: THROW.throwHitM,
  /** Bodies it passes take this share of the spell's power; the thrown body takes all of it on landing. */
  passShare: 0.6,
  /** Seconds the held body stays stunned after each held tick (it cannot act while held). */
  holdStunSec: 0.25,
} as const;

/** Hold `held` in front of `caster` this step. */
export function stepHold(caster: AdventureActor, held: AdventureActor): void {
  const fx = Math.sin(caster.facingYaw), fz = Math.cos(caster.facingYaw);
  const tx = caster.pos.x + fx * TELEKINESIS.holdForwardM, tz = caster.pos.z + fz * TELEKINESIS.holdForwardM;
  const ty = caster.pos.y + TELEKINESIS.holdUpM;
  const clamp = (v: number) => Math.max(-TELEKINESIS.pullMaxSpeed, Math.min(TELEKINESIS.pullMaxSpeed, v));
  requestPlanarVel(held, clamp((tx - held.pos.x) * TELEKINESIS.pullGain), clamp((tz - held.pos.z) * TELEKINESIS.pullGain));
  requestVy(held, clamp((ty - held.pos.y) * TELEKINESIS.pullGain));
  held.stunSec = Math.max(held.stunSec, TELEKINESIS.holdStunSec);
}

/** Let go: the body falls where it is. */
export function drop(held: AdventureActor): void {
  const fs = fightStateOf(held);
  fs.heldBy = null;
}

/** Throw `held` along `yaw`; its flight is stepped by `stepThrown`. */
export function throwHeld(caster: AdventureActor, held: AdventureActor, yaw: number, power: number): void {
  const fs = fightStateOf(held);
  fs.heldBy = null;
  fs.thrownBy = caster.id;
  fs.thrownSec = TELEKINESIS.throwSec;
  fs.thrownPower = power;
  fs.thrownHit.clear();
  fs.thrownPrev.x = held.pos.x; fs.thrownPrev.y = held.pos.y; fs.thrownPrev.z = held.pos.z;
  requestPlanarVel(held, Math.sin(yaw) * TELEKINESIS.throwSpeed, Math.cos(yaw) * TELEKINESIS.throwSpeed);
  requestVy(held, TELEKINESIS.throwUpVy);
  held.stunSec = Math.max(held.stunSec, TELEKINESIS.throwSec + 0.3);
}

const spec = makeHitSpec();
const bodies: Body2[] = [];
const bodyActors: AdventureActor[] = [];

/**
 * One step of a thrown body's flight: everything hostile to the thrower that its path passes takes a hit (once), and
 * when the flight ends (time, or the ground) the body takes the impact. Returns true on the step it landed.
 */
export function stepThrown(body: AdventureActor, world: AdventureWorld, bus: AdventureBus, tSec: number, dt: number): boolean {
  const fs = fightStateOf(body);
  if (fs.thrownSec <= 0) return false;
  const thrower = fs.thrownBy ? world.actors.get(fs.thrownBy) ?? null : null;
  bodies.length = 0; bodyActors.length = 0;
  for (const o of world.near(body.pos, 4)) {
    if (o === body || fs.thrownHit.has(o.id)) continue;
    if (thrower ? !isHostile(thrower, o) : o.team === body.team) continue;
    bodies.push({ x: o.pos.x, z: o.pos.z });
    bodyActors.push(o);
  }
  for (const i of pathHits(fs.thrownPrev, body.pos, bodies, TELEKINESIS.hitM)) {
    const o = bodyActors[i];
    fs.thrownHit.add(o.id);
    resetHitSpec(spec);
    spec.base = fs.thrownPower * TELEKINESIS.passShare; spec.source = 'spell'; spec.via = 'telekinesis.throw';
    spec.staggerSec = 0.6; spec.knockbackM = 1.4; spec.parryable = false; spec.blockable = true;
    spec.fromX = fs.thrownPrev.x; spec.fromZ = fs.thrownPrev.z;
    applyHit(bus, tSec, thrower, o, spec);
  }
  fs.thrownPrev.x = body.pos.x; fs.thrownPrev.y = body.pos.y; fs.thrownPrev.z = body.pos.z;
  fs.thrownSec = Math.max(0, fs.thrownSec - dt);
  const grounded = body.pos.y <= 0.05 && body.vel.y <= 0 && fs.thrownSec < TELEKINESIS.throwSec - 0.1;
  if (fs.thrownSec > 0 && !grounded) return false;
  fs.thrownSec = 0;
  resetHitSpec(spec);
  spec.base = fs.thrownPower; spec.source = 'spell'; spec.via = 'telekinesis.impact'; spec.staggerSec = 0.8;
  spec.parryable = false; spec.blockable = false; spec.fromX = body.pos.x; spec.fromZ = body.pos.z;
  applyHit(bus, tSec, thrower, body, spec);
  fs.thrownBy = null;
  return true;
}
