/**
 * THE PARTNER IN THE ZONE, phase B (lane/coast-b; owner 2026-11-17: "one partner"). The Adventure already has the partner:
 * its brain (lib/babylon/adventure/partner/brain.ts: a follow slot behind and to the right of the player, a sprint when it
 * falls behind) and the host spawns it from the save. This file adds only what the zone needs on top:
 *
 *   WHO        the save's own partner (picked in the Adventure); a player without one walks with a LOANED default creature
 *              (the Adventure's own default, strideraptor), which is never written into the save — the yard's rule.
 *   CATCH-UP   the partner is brought to the player when it is left more than `catchupM` behind (and the player is on the
 *              ground), when it ends a frame over deep water, after the player was turned back from it, or when it has been
 *              STUCK (blocked while more than STUCK_GAP_M behind for `stuckSec`) — the story runtime's rule (world/story/
 *              runtime.ts CATCHUP_M), with the zone's water and its decks added. The brain walks straight at its follow slot
 *              (it has no path-finding), so on the bridge it walks into the deck's side from the sand; the zone does not retune
 *              the brain, it brings the partner back onto YOUR path: a point a few metres behind you that you walked over.
 *
 * Pure: plain actors, no Babylon. The spot beside the player is on ground a person can stand on, or the player's own spot.
 */

import type { AdventureActor, AdventureSave, PartnerDef, Vec3 } from '@/lib/babylon/adventure/contracts';
import { createCreaturePartner } from '@/lib/babylon/adventure/partner/defs';
import { surfaceY, walkable } from './zoneLayout';

/** coast.partnerOn: 1 = one partner walks with you (new); 0 = you walk alone, as in phase A. */
export const COAST_PARTNER_ON = 1;
/** coast.partnerCatchupM: left this far behind, the partner reappears beside you (m). The story's 32 m is for long worlds;
 *  the zone's 64 m pieces want the partner in the 3 × 3 you see in full. */
export const COAST_PARTNER_CATCHUP_M = 24;
/** The Adventure's default creature (AdventureMode: "a direct mount without one gets the default creature"). */
export const DEFAULT_PARTNER_SPECIES = 'strideraptor';
export const ZONE_PARTNER_ID = 'partner';
/** After a turn-back, the partner is brought over only if it is further than this (m): the brain's sprint distance and a bit. */
export const TURNBACK_GAP_M = 6;

/** The partner for the zone: the save's, or a loaned default. `loaned` says it must never be written back. */
export function zonePartner(save: AdventureSave): { partner: PartnerDef | null; loaned: boolean } {
  if (save.partner) return { partner: save.partner, loaned: false };
  return { partner: createCreaturePartner({ id: ZONE_PARTNER_ID, speciesId: DEFAULT_PARTNER_SPECIES }), loaned: true };
}

/** Where beside the player the partner reappears: to the right and a step back, on standable ground; else the player's spot. */
export function besidePlayer(p: Vec3, yaw: number, out: Vec3): Vec3 {
  for (const [side, back] of [[1.6, 1.2], [-1.6, 1.2], [0, 2], [1.6, -1.2]] as const) {
    const x = p.x + Math.cos(yaw) * side - Math.sin(yaw) * back, z = p.z - Math.sin(yaw) * side - Math.cos(yaw) * back;
    if (walkable(x, z)) { out.x = x; out.z = z; out.y = surfaceY(x, z); return out; }
  }
  out.x = p.x; out.y = p.y; out.z = p.z;
  return out;
}

export type CatchupWhy = 'far' | 'water' | 'turnback' | 'stuck';

/** coast.partnerStuckSec: blocked this long (s) while more than STUCK_GAP_M behind, the partner comes back onto your path. */
export const COAST_PARTNER_STUCK_SEC = 1;
/** Stuck means: slower than this (m/s) ... */
export const STUCK_SPEED = 0.5;
/** ... while further than this (m): beyond the brain's own sprint distance (FOLLOW_SPRINT_M 4) and a step. */
export const STUCK_GAP_M = 6;
/** How far back along your path the partner reappears (m). */
export const TRAIL_BACK_M = 3;

/**
 * Your recent path: a point every 0.5 m you walked on standable ground (the last 24). The partner reappears on it.
 */
export class Trail {
  private readonly xs = new Float64Array(24);
  private readonly zs = new Float64Array(24);
  private n = 0;
  private at = 0;
  push(x: number, z: number): void {
    const last = this.n ? (this.at + 23) % 24 : -1;
    if (last >= 0 && Math.hypot(x - this.xs[last], z - this.zs[last]) < 0.5) return;
    if (!walkable(x, z)) return;
    this.xs[this.at] = x; this.zs[this.at] = z; this.at = (this.at + 1) % 24; this.n = Math.min(24, this.n + 1);
  }
  /** The newest trail point at least `back` metres from (x, z), walking back; null when the trail is shorter. */
  behind(x: number, z: number, back: number, out: Vec3): Vec3 | null {
    for (let k = 1; k <= this.n; k++) {
      const i = (this.at - k + 24) % 24;
      if (Math.hypot(this.xs[i] - x, this.zs[i] - z) >= back) { out.x = this.xs[i]; out.z = this.zs[i]; out.y = surfaceY(out.x, out.z); return out; }
    }
    return null;
  }
}

/** The partner's keeper for one zone visit: the trail, the stuck timer, the catch-up. */
export class PartnerKeeper {
  readonly trail = new Trail();
  private stuck = 0;
  readonly counts: Record<CatchupWhy, number> = { far: 0, water: 0, turnback: 0, stuck: 0 };

  /** One frame, after the host stepped and the water's edge held the player. Returns why it moved the partner, or null. */
  step(p: AdventureActor, q: AdventureActor, dt: number, o: { catchupM: number; stuckSec: number; playerTurnedBack: boolean; reset: (id: string) => void }): CatchupWhy | null {
    if (p.grounded || p.state === 'ground') this.trail.push(p.pos.x, p.pos.z);
    if (q.ridingId || p.ridingId === q.id || q.fusion.active) { this.stuck = 0; return null; }
    const gap = Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
    const blocked = gap > STUCK_GAP_M && Math.hypot(q.vel.x, q.vel.z) < STUCK_SPEED;
    this.stuck = blocked ? this.stuck + dt : 0;
    const why = catchupWhy(p, q, gap, o.catchupM, o.playerTurnedBack) ?? (this.stuck >= o.stuckSec ? 'stuck' : null);
    if (!why) return null;
    this.stuck = 0;
    if (!this.trail.behind(p.pos.x, p.pos.z, TRAIL_BACK_M, q.pos)) besidePlayer(p.pos, p.facingYaw, q.pos);
    settle(p, q, o.reset);
    this.counts[why]++;
    return why;
  }
}

function catchupWhy(p: AdventureActor, q: AdventureActor, gap: number, catchupM: number, turnedBack: boolean): CatchupWhy | null {
  const far = gap > catchupM && (p.grounded || p.state === 'ground');
  // a turn-back only matters when it left the partner behind (the partner was beside the player: it simply keeps following)
  return !walkable(q.pos.x, q.pos.z) ? 'water' : turnedBack && gap > TURNBACK_GAP_M ? 'turnback' : far ? 'far' : null;
}

/** A teleport's writes (the story runtime's `place`): still, facing the player's way, on the ground, its movement forgotten. */
function settle(p: AdventureActor, q: AdventureActor, reset: (id: string) => void): void {
  q.vel.x = 0; q.vel.y = 0; q.vel.z = 0;
  q.facingYaw = p.facingYaw;
  q.rail = null; q.state = 'ground'; q.stateSec = 0; q.grounded = true; q.wantsFlight = false;
  reset(q.id);
}

/**
 * The catch-up alone (no trail, no stuck timer), for one frame: beside the player. Returns why it moved the partner, or null.
 */
export function partnerCatchup(
  p: AdventureActor, q: AdventureActor, o: { catchupM: number; playerTurnedBack: boolean; reset: (id: string) => void },
): CatchupWhy | null {
  if (q.ridingId || p.ridingId === q.id || q.fusion.active) return null;
  const why = catchupWhy(p, q, Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z), o.catchupM, o.playerTurnedBack);
  if (!why) return null;
  besidePlayer(p.pos, p.facingYaw, q.pos);
  settle(p, q, o.reset);
  return why;
}
