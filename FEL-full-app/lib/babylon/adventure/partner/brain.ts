/**
 * The partner's brain (ADVENTURE PLAN A3, 2026-10-06): the AI party member. It ONLY emits a `MoveInput`, the same
 * intent a human's pad produces, so it drives A1's movement and A2's combat without importing either (the seam
 * PlayerSlot's ControlSource set up, and KarateEndless's PartnerAISource proved: a downed ally comes first).
 *
 * PRIORITY, highest first:
 *   down        the partner itself is knocked out or stunned: neutral
 *   fused       its body is inside the player's: neutral
 *   mounted     the player rides it: neutral (A1 drives a mount from the rider's input)
 *   revive      the player is down: run to them and stand inside the revive range (the partner system counts the
 *               channel, OnslaughtCore.DownRevive)
 *   guard       command "guard me": stand between the player and the nearest threat; block, and strike what comes close
 *   engage      a target (the player's lock first; in "engage" also the nearest enemy near the player; in "follow"
 *               only an enemy pressing the player): close in, face it, strike on a cadence (every third a heavy),
 *               guard instead when stamina is low
 *   follow      a slot behind and to the right of the player; sprint when far; jump when the player is on a ledge above
 *
 * Its stick is in WORLD space: it sets camYaw 0, so `move` (x, y) is world (x, z) through contracts.wishDir.
 * Deterministic: the only variation (the strike cadence's jitter) comes from a seeded generator. Allocation-free per
 * think (the output object is reused; the world's actors are iterated, not copied).
 */
import { REVIVE_RANGE } from '@/lib/babylon/core/OnslaughtCore';
import type { ActorId, AdventureActor, AdventureWorld, MoveInput } from '../contracts';
import { neutralInput } from '../contracts';

export const PARTNER_COMMANDS = ['follow', 'engage', 'guard'] as const;
export type PartnerCommand = (typeof PARTNER_COMMANDS)[number];
export type BrainMode = 'idle' | 'follow' | 'engage' | 'guard' | 'revive' | 'mounted' | 'fused' | 'down';

// ── Tuning [TUNE] ────────────────────────────────────────────────────────────────────────────────────────────────

/** Start following when the slot is farther than this; stop inside FOLLOW_ARRIVE_M. */
export const FOLLOW_DIST_M = 2.5;
export const FOLLOW_ARRIVE_M = 1.2;
/** Sprint to the slot past this (the partner's sprint is what lets it close on a running player). */
export const FOLLOW_SPRINT_M = 4;
/** The follow slot: behind and to the right of the player. */
export const FOLLOW_BACK_M = 1.8;
export const FOLLOW_SIDE_M = 1.0;
/** "engage" looks this far around the player for an enemy; "follow" only defends inside PRESS_RADIUS_M. */
export const ENGAGE_RADIUS_M = 14;
export const PRESS_RADIUS_M = 3;
/** Never chase further than this from the player. */
export const LEASH_M = 22;
/** Strike when the gap (centre distance minus both radii) is under this. */
export const ATTACK_RANGE_M = 1.6;
export const ATTACK_INTERVAL_SEC = 0.55;
export const ATTACK_JITTER_SEC = 0.15;
export const HEAVY_EVERY = 3;
/** Stick magnitude used to keep facing a target in range without walking through it. */
export const FACE_MAG = 0.12;
/** Below this share of stamina it guards instead of striking. */
export const LOW_STAMINA_FRAC = 0.2;
export const GUARD_RADIUS_M = 4;
export const GUARD_OFFSET_M = 1.4;
export const GUARD_BLOCK_M = 3;
export const JUMP_RISE_M = 1.2;
export const JUMP_COOLDOWN_SEC = 0.9;
export const JUMP_HOLD_SEC = 0.25;
export const LOCK_COOLDOWN_SEC = 0.5;
/** Stand this close to a downed player (inside DownRevive's range). */
export const REVIVE_STAND_M = REVIVE_RANGE * 0.7;

export interface BrainInput {
  self: AdventureActor;
  player: AdventureActor;
  world: AdventureWorld;
  command: PartnerCommand;
  /** The player is down (the partner system's DownRevive). */
  playerDowned: boolean;
}

/** mulberry32: a tiny seeded generator, so a run is the same run every time. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const alive = (a: AdventureActor): boolean => a.state !== 'ko' && a.stats.hp.cur > 0;

/** An actor this partner fights: another team, not an NPC, still standing. */
export function isEnemyOf(self: AdventureActor, other: AdventureActor): boolean {
  return other.id !== self.id && other.team !== self.team && other.kind !== 'npc' && alive(other);
}

const dist2 = (a: { x: number; z: number }, b: { x: number; z: number }): number => {
  const dx = b.x - a.x, dz = b.z - a.z;
  return dx * dx + dz * dz;
};

export class PartnerBrain {
  /** The partner's intent this tick, written in place every think. */
  readonly out: MoveInput = neutralInput();
  mode: BrainMode = 'idle';
  targetId: ActorId | null = null;
  private attackCd = 0;
  private strikes = 0;
  private jumpCd = 0;
  private jumpHold = 0;
  private lockCd = 0;
  private following = false;
  private readonly rng: () => number;

  constructor(seed = 1) {
    this.rng = seededRandom(seed);
  }

  think(b: BrainInput, dt: number): MoveInput {
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    this.jumpHold = Math.max(0, this.jumpHold - dt);
    this.lockCd = Math.max(0, this.lockCd - dt);
    this.clear();
    const { self, player } = b;

    if (!alive(self) || self.stunSec > 0) return this.idle('down');
    if (self.fusion.active) return this.idle('fused');
    if (player.ridingId === self.id) return this.idle('mounted');

    if (b.playerDowned) {
      this.mode = 'revive';
      this.targetId = null;
      const d = Math.sqrt(dist2(self.pos, player.pos));
      if (d > REVIVE_STAND_M) this.steer(player.pos.x - self.pos.x, player.pos.z - self.pos.z, 1, d > 4);
      return this.out;
    }

    const target = this.pickTarget(b);
    this.targetId = target?.id ?? null;
    const leashed = dist2(self.pos, player.pos) > LEASH_M * LEASH_M;

    if (b.command === 'guard') return this.guard(b, target);
    if (target && !leashed) return this.engage(b, target);
    return this.follow(b);
  }

  // ── behaviours ─────────────────────────────────────────────────────────────────────────────────────────────────

  private follow(b: BrainInput): MoveInput {
    const { self, player } = b;
    this.mode = 'follow';
    const fx = Math.sin(player.facingYaw), fz = Math.cos(player.facingYaw);
    // right = (cos, −sin) for yaw (contracts.wishDir)
    const sx = player.pos.x - fx * FOLLOW_BACK_M + fz * FOLLOW_SIDE_M;
    const sz = player.pos.z - fz * FOLLOW_BACK_M - fx * FOLLOW_SIDE_M;
    const d = Math.sqrt(dist2(self.pos, { x: sx, z: sz }));
    if (d > FOLLOW_DIST_M) this.following = true;
    else if (d < FOLLOW_ARRIVE_M) this.following = false;
    if (this.following) this.steer(sx - self.pos.x, sz - self.pos.z, Math.min(1, 0.4 + (d - FOLLOW_ARRIVE_M) / 2), d > FOLLOW_SPRINT_M);
    this.maybeJump(self, player);
    this.releaseLock(self);
    return this.out;
  }

  private engage(b: BrainInput, target: AdventureActor): MoveInput {
    const { self } = b;
    this.mode = 'engage';
    const dx = target.pos.x - self.pos.x, dz = target.pos.z - self.pos.z;
    const gap = Math.sqrt(dx * dx + dz * dz) - self.radius - target.radius;
    if (gap > ATTACK_RANGE_M) {
      this.steer(dx, dz, 1, gap > 6);
      this.maybeJump(self, target);
    } else {
      this.steer(dx, dz, FACE_MAG, false);
      this.strike(self);
    }
    if (!self.lock && this.lockCd === 0 && gap < 8) { this.out.lock = true; this.lockCd = LOCK_COOLDOWN_SEC; }
    return this.out;
  }

  private guard(b: BrainInput, threat: AdventureActor | null): MoveInput {
    const { self, player } = b;
    this.mode = 'guard';
    if (!threat) {
      const d = Math.sqrt(dist2(self.pos, player.pos));
      if (d > FOLLOW_DIST_M) this.steer(player.pos.x - self.pos.x, player.pos.z - self.pos.z, Math.min(1, 0.4 + d / 4), d > FOLLOW_SPRINT_M);
      this.releaseLock(self);
      return this.out;
    }
    // stand on the line from the player to the threat
    const tx = threat.pos.x - player.pos.x, tz = threat.pos.z - player.pos.z;
    const tl = Math.hypot(tx, tz) || 1;
    const px = player.pos.x + (tx / tl) * GUARD_OFFSET_M, pz = player.pos.z + (tz / tl) * GUARD_OFFSET_M;
    const d = Math.sqrt(dist2(self.pos, { x: px, z: pz }));
    const dx = threat.pos.x - self.pos.x, dz = threat.pos.z - self.pos.z;
    const gap = Math.hypot(dx, dz) - self.radius - threat.radius;
    if (d > 0.5) this.steer(px - self.pos.x, pz - self.pos.z, Math.min(1, 0.3 + d / 2), false);
    else this.steer(dx, dz, FACE_MAG, false);
    if (gap <= ATTACK_RANGE_M) this.strike(self);
    else if (gap <= GUARD_BLOCK_M) this.out.guardHeld = true;
    return this.out;
  }

  // ── pieces ─────────────────────────────────────────────────────────────────────────────────────────────────────

  private pickTarget(b: BrainInput): AdventureActor | null {
    const { self, player, world, command } = b;
    // 1. the player's lock: the partner fights what the player fights
    if (player.lock) {
      const t = world.actors.get(player.lock.actorId);
      if (t && isEnemyOf(self, t)) return t;
    }
    const radius = command === 'engage' ? ENGAGE_RADIUS_M : command === 'guard' ? GUARD_RADIUS_M : PRESS_RADIUS_M;
    const r2 = radius * radius;
    // 2. keep the current target while it is valid (no flicking between two equal enemies)
    if (this.targetId) {
      const t = world.actors.get(this.targetId);
      if (t && isEnemyOf(self, t) && dist2(t.pos, player.pos) <= r2) return t;
    }
    // 3. the enemy nearest the partner, among those near the player
    let best: AdventureActor | null = null, bestD = Infinity;
    for (const a of world.actors.values()) {
      if (!isEnemyOf(self, a) || dist2(a.pos, player.pos) > r2) continue;
      const d = dist2(a.pos, self.pos);
      if (d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  private strike(self: AdventureActor): void {
    const st = self.stats.stamina;
    if (st.max > 0 && st.cur / st.max < LOW_STAMINA_FRAC) { this.out.guardHeld = true; return; }
    if (this.attackCd > 0) return;
    this.strikes++;
    if (this.strikes % HEAVY_EVERY === 0) this.out.attackHeavy = true;
    else this.out.attackLight = true;
    this.attackCd = ATTACK_INTERVAL_SEC + ATTACK_JITTER_SEC * this.rng();
  }

  private maybeJump(self: AdventureActor, toward: AdventureActor): void {
    if (this.jumpHold > 0 && !self.grounded) { this.out.jumpHeld = true; return; }
    if (!self.grounded || this.jumpCd > 0) return;
    if (toward.pos.y - self.pos.y > JUMP_RISE_M && dist2(self.pos, toward.pos) < 25) {
      this.out.jump = true;
      this.out.jumpHeld = true;
      this.jumpCd = JUMP_COOLDOWN_SEC;
      this.jumpHold = JUMP_HOLD_SEC;
    }
  }

  private releaseLock(self: AdventureActor): void {
    if (self.lock?.hard && this.lockCd === 0) { this.out.lock = true; this.lockCd = LOCK_COOLDOWN_SEC; }
  }

  private steer(dx: number, dz: number, mag: number, sprint: boolean): void {
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return;
    const m = Math.max(0, Math.min(1, mag));
    this.out.move.x = (dx / len) * m;
    this.out.move.y = (dz / len) * m;
    this.out.dashHeld = sprint;
  }

  private idle(mode: BrainMode): MoveInput {
    this.mode = mode;
    this.targetId = null;
    this.following = false;
    return this.out;
  }

  /** Every field back to neutral, in place. */
  private clear(): void {
    const o = this.out;
    o.move.x = 0; o.move.y = 0; o.camYaw = 0; o.look.x = 0; o.look.y = 0;
    o.jump = false; o.jumpHeld = false; o.dash = false; o.dashHeld = false;
    o.attackLight = false; o.attackHeavy = false; o.lock = false; o.guardHeld = false;
    o.magic = false; o.magicHeld = false; o.magicSlot = null; o.focusHeld = false;
    o.partner = false; o.fuse = false; o.lean = 0; o.ascendHeld = false; o.descendHeld = false;
  }
}

/** Copy one MoveInput's fields into another in place (the host's map entry for the partner). */
export function copyMoveInput(from: MoveInput, to: MoveInput): void {
  if (from === to) return;
  to.move.x = from.move.x; to.move.y = from.move.y; to.camYaw = from.camYaw; to.look.x = from.look.x; to.look.y = from.look.y;
  to.jump = from.jump; to.jumpHeld = from.jumpHeld; to.dash = from.dash; to.dashHeld = from.dashHeld;
  to.attackLight = from.attackLight; to.attackHeavy = from.attackHeavy; to.lock = from.lock; to.guardHeld = from.guardHeld;
  to.magic = from.magic; to.magicHeld = from.magicHeld; to.magicSlot = from.magicSlot; to.focusHeld = from.focusHeld;
  to.partner = from.partner; to.fuse = from.fuse; to.lean = from.lean; to.ascendHeld = from.ascendHeld; to.descendHeld = from.descendHeld;
}
