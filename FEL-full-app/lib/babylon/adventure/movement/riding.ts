/**
 * Riding your partner (lane A1; docs/ADVENTURE-PLAN.md "movement/riding.ts").
 *
 * The owner (2026-10-06): "Or you can ride your partner if they can fly." A creature partner carries you from its
 * rideable stage and flies with you from its flyable stage (contracts.partnerCanCarry); a built character never carries
 * (it fuses instead). Riding is a mount with its own speed (plan pillar 1): the partner's body moves, driven by YOUR
 * stick, and you sit on it (EvolutionGarden.MOUNT_SOCKET_BONE: the rider sits at the hips; the view parents to it).
 *
 * THE VERB. The fuse button (D-pad down / 2) beside a rideable partner mounts; on the mount it dismounts. Fusion shares
 * that button (A3): a FULL fusion meter means the press is a fuse, so A1 mounts only when the meter is not full and you
 * are not fused. assumption: that is the split; the report flags it for A3 and A4.
 */

import type { AdventureActor, PartnerDef } from '../contracts';
import { partnerCanCarry } from '../contracts';
import type { BodyState, MountSpec, StepEnv } from './body';
import { yawOf } from './math';
import { enterState } from './state';

/** Rider seat height when nothing better is known: the mount's hips (a share of its height). [TUNE] */
export const SEAT_SHARE = 0.55;

/**
 * A partner as a mount. Its carry from partnerCanCarry; its pace from its own attributes, the way the Evolution
 * Garden's companion mirrors the player's PRQ ([TUNE]: 10 m/s at speed 0 up to 14 at 100; flight stamina is its
 * endurance, FlightController's rule, floored at 30 so a fresh partner can still lift off).
 */
export function mountSpecFromPartner(def: PartnerDef, mountHeight = 1.6): MountSpec {
  const carry = partnerCanCarry(def);
  const speed = Number.isFinite(def.attrs?.speed) ? def.attrs.speed : 30;
  const endurance = Number.isFinite(def.attrs?.endurance) ? def.attrs.endurance : 30;
  return {
    canRide: carry.ride,
    canFly: carry.fly,
    groundSpeed: 10 + (Math.max(0, Math.min(100, speed)) / 100) * 4,
    flySpeedMult: 0.9 + (Math.max(0, Math.min(100, speed)) / 100) * 0.2,
    staminaMax: Math.max(30, Math.min(100, endurance)),
    seatHeight: mountHeight * SEAT_SHARE,
  };
}

/** A mount spec from the plan's `mountCanFly` alone (no PartnerDef to hand): rideable, and flies when told. */
export function defaultMountSpec(canFly: boolean, mountHeight = 1.6): MountSpec {
  return { canRide: true, canFly, groundSpeed: 11, flySpeedMult: 1, staminaMax: 60, seatHeight: mountHeight * SEAT_SHARE };
}

export type MountWhy = 'ok' | 'none' | 'far' | 'cannot' | 'busy' | 'fusing' | 'down';

/** May `rider` mount `mount` now? (Pure; the reason is for tests and a HUD prompt.) */
export function mountReason(
  rider: AdventureActor, mount: AdventureActor | undefined, spec: MountSpec | null, reach: number, takenBy: string | null,
): MountWhy {
  if (!mount) return 'none';
  if (rider.fusion.active || rider.fusion.meter >= 1) return 'fusing';
  if (!spec || !spec.canRide) return 'cannot';
  if (!(mount.stats.hp.cur > 0) || mount.state === 'ko' || mount.stunSec > 0) return 'down';
  if (mount.ridingId || (takenBy && takenBy !== rider.id)) return 'busy';
  if (Math.hypot(mount.pos.x - rider.pos.x, mount.pos.y - rider.pos.y, mount.pos.z - rider.pos.z) > reach) return 'far';
  return 'ok';
}

export function mount(rider: AdventureActor, rb: BodyState, m: AdventureActor, env: StepEnv): void {
  rider.ridingId = m.id;
  rider.rail = null;
  rider.wantsFlight = false;
  rb.homingId = null; rb.wall = null; rb.spinning = false; rb.airDashT = 0;
  enterState(rider, 'riding', env.bus);
  env.bus.emit('mount', { riderId: rider.id, mountId: m.id, on: true });
}

/** Get off: a hop up and a step to the side, keeping the mount's speed. */
export function dismount(rider: AdventureActor, rb: BodyState, m: AdventureActor | undefined, env: StepEnv): void {
  const mountId = rider.ridingId!;
  rider.ridingId = null;
  rider.wantsFlight = false;
  const r = env.p.ride;
  const rx = Math.cos(rider.facingYaw), rz = -Math.sin(rider.facingYaw);
  rider.pos.x += rx * r.dismountSide; rider.pos.z += rz * r.dismountSide;
  rider.vel.x = m ? m.vel.x : 0; rider.vel.z = m ? m.vel.z : 0;
  rider.vel.y = (m ? Math.max(0, m.vel.y) : 0) + r.dismountHop;
  rider.grounded = false;
  rb.coyote = Infinity; rb.airDashes = 1; rb.rising = false;
  rb.speed = Math.hypot(rider.vel.x, rider.vel.z);
  if (m) { m.wantsFlight = false; }
  enterState(rider, 'air', env.bus);
  env.bus.emit('mount', { riderId: rider.id, mountId, on: false });
}

/** Sit the rider on the mount: same place (raised to the seat), same velocity, same facing. */
export function glueRider(rider: AdventureActor, m: AdventureActor, seatHeight: number): void {
  rider.pos.x = m.pos.x; rider.pos.y = m.pos.y + seatHeight; rider.pos.z = m.pos.z;
  rider.vel.x = m.vel.x; rider.vel.y = m.vel.y; rider.vel.z = m.vel.z;
  rider.facingYaw = Math.hypot(m.vel.x, m.vel.z) > 0.3 ? yawOf(m.vel.x, m.vel.z) : m.facingYaw;
  rider.grounded = m.grounded;
}
