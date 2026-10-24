// The rider ↔ DR_Seat link (Phase4 notes, "Mount parenting"). At Mount f12 the rider root parents to DR_Seat and stays parented
// through the rest of Mount and every clip after (Glide, Surf, Dive, Swoop, LaunchOff) — no one-time snap to a world position:
// the parent keeps the rider's world pose at the lock, so the seat-local offset is captured once and never changes. The link
// lets go only on a dismount, the LaunchOff release, or the jump-off tap, and is never re-made before the rider lands.
export type SeatLinkState = 'free' | 'mounting' | 'parented' | 'released';
export type ReleaseCause = 'dismount' | 'launchOff' | 'jumpTap';

import { MOUNT_LOCK_F } from './dragonRideConsts';

export interface V3 { x: number; y: number; z: number }

/** The Babylon side of the link (DragonRig binds it to `rider.setParent(seat)`, which keeps the world transform). */
export interface SeatParenting { parent(): void; unparent(): void }

export class RiderSeatLink {
  private st: SeatLinkState = 'free';
  private offset: V3 | null = null;
  private landedSinceRelease = true;
  constructor(private readonly io?: SeatParenting) {}

  get state(): SeatLinkState { return this.st; }
  get parented(): boolean { return this.st === 'parented'; }
  /** The rider's seat-local offset, captured at the lock (null before). */
  get seatOffset(): V3 | null { return this.offset; }

  /** The Mount clip starts. Ignored while parented or mid-air after a release. */
  beginMount(): boolean {
    if (this.st === 'parented' || this.st === 'mounting' || !this.landedSinceRelease) return false;
    this.st = 'mounting';
    return true;
  }

  /** Every Mount frame. At f12 the rider parents, keeping `riderWorld` relative to `seatWorld` (no snap). */
  mountFrame(frame: number, riderWorld: V3, seatWorld: V3): boolean {
    if (this.st !== 'mounting' || frame < MOUNT_LOCK_F) return false;
    this.offset = { x: riderWorld.x - seatWorld.x, y: riderWorld.y - seatWorld.y, z: riderWorld.z - seatWorld.z };
    this.st = 'parented';
    this.io?.parent();
    return true;
  }

  /** The rider's world position this frame while parented: the seat plus the locked offset (translation-only seat frames). */
  riderWorld(seatWorld: V3): V3 | null {
    if (this.st !== 'parented' || !this.offset) return null;
    return { x: seatWorld.x + this.offset.x, y: seatWorld.y + this.offset.y, z: seatWorld.z + this.offset.z };
  }

  release(cause: ReleaseCause): boolean {
    if (this.st !== 'parented') return false;
    this.st = 'released';
    this.landedSinceRelease = cause === 'dismount';
    this.io?.unparent();
    return true;
  }

  /** The released rider touched the floor: a new Mount may start. */
  landed(): void { this.landedSinceRelease = true; if (this.st === 'released') this.st = 'free'; }
}
