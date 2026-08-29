// OnslaughtCore — Mode 2 Phase 8: crowd-control combat + wave structure for
// Endless Onslaught. Pure logic (headless-testable); the mode renders it.
//
//   CrowdControl — AOE strikes hit every enemy in a radius/arc; light hits
//     LAUNCH (juggle — airborne enemies take +50% and can't act); when
//     surrounded (N+ live attackers inside range) the CROWD-CLEAR finisher
//     unlocks: one button, big AOE, brief invulnerability. The Matrix-lobby
//     fantasy: unstoppable in bursts, not a grind.
//   WaveDirector — count/hp/speed ramp per round, wave-start and
//     wave-clear beats, deterministic for a given seed (server parity).
//   PerkShop — between-round purchasable upgrades. The catalog and prices
//     are DATA the client can display, but the PURCHASE goes through the
//     server-authoritative wallet API — buyPerk() takes a spend function
//     injected by the mode; the local fallback is single-player practice
//     (clearly labeled, never touching the ledger).
//   DownRevive — co-op KO state: downed player bleeds out over 30s unless
//     the ally holds a revive channel for 3s inside range. Both down =
//     run over. Fully solo-safe (the mechanic simply never engages).

import { Vector3 } from '@babylonjs/core';

// ── Crowd control ──────────────────────────────────────────────────────────
export interface EnemyLike { id: string; pos: Vector3; hp: number; airborneSec: number }

export const JUGGLE_LAUNCH_SEC = 0.9;
export const JUGGLE_DAMAGE_MULT = 1.5;
export const CROWDCLEAR_MIN_SURROUNDED = 3;
export const CROWDCLEAR_RADIUS = 2.6;
export const CROWDCLEAR_DMG = 30;

/** Enemies hit by an AOE strike: inside radius AND (for arcs) within the
 *  forward 120° arc. */
export function aoeTargets(self: Vector3, facingRad: number, enemies: EnemyLike[], radius: number, arc: boolean): EnemyLike[] {
  return enemies.filter((e) => {
    const to = e.pos.subtract(self); to.y = 0;
    const d = to.length();
    if (d > radius) return false;
    if (!arc) return true;
    const ang = Math.atan2(to.x, to.z);
    let diff = ang - facingRad;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return Math.abs(diff) <= Math.PI / 3;
  });
}

/** Apply a hit to one enemy: launch on light hits (juggle state), bonus
 *  damage while airborne. Returns dealt damage. */
export function applyCCHit(e: EnemyLike, dmg: number, launches: boolean): number {
  let dealt = dmg;
  if (e.airborneSec > 0) dealt = Math.round(dmg * JUGGLE_DAMAGE_MULT);
  if (launches && e.airborneSec <= 0) e.airborneSec = JUGGLE_LAUNCH_SEC;
  e.hp = Math.max(0, e.hp - dealt);
  return dealt;
}

export function surroundedCount(self: Vector3, enemies: EnemyLike[], radius = CROWDCLEAR_RADIUS): number {
  return enemies.filter((e) => e.hp > 0 && Vector3.Distance(e.pos, self) <= radius).length;
}

export function canCrowdClear(self: Vector3, enemies: EnemyLike[]): boolean {
  return surroundedCount(self, enemies) >= CROWDCLEAR_MIN_SURROUNDED;
}

/** The crowd-clear finisher: hits every live enemy in the radius. */
export function crowdClear(self: Vector3, enemies: EnemyLike[]): { hit: number; kos: number } {
  const targets = aoeTargets(self, 0, enemies.filter((e) => e.hp > 0), CROWDCLEAR_RADIUS, false);
  let kos = 0;
  for (const e of targets) {
    e.hp = Math.max(0, e.hp - CROWDCLEAR_DMG);
    if (e.hp === 0) kos++;
  }
  return { hit: targets.length, kos };
}

// ── Wave director ──────────────────────────────────────────────────────────
export interface WaveSpec { wave: number; count: number; hp: number; speedMult: number }

export function waveSpec(wave: number): WaveSpec {
  return {
    wave,
    count: Math.min(4 + Math.floor(wave * 0.9), 14),
    hp: 22 + wave * 4,
    speedMult: Math.min(1.6, 1 + wave * 0.04),
  };
}

/** Deterministic spawn ring positions for a wave (server-parity seed). */
export function spawnRing(wave: number, count: number, radius = 8): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + wave * 0.7;
    out.push(new Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius));
  }
  return out;
}

// ── Perk shop ──────────────────────────────────────────────────────────────
export interface Perk { id: string; label: string; costCoins: number; apply: string }
export const PERKS: Perk[] = [
  { id: 'vital1', label: '+25 MAX HP', costCoins: 150, apply: 'maxHp' },
  { id: 'power1', label: '+15% DAMAGE', costCoins: 200, apply: 'damage' },
  { id: 'swift1', label: '+10% SPEED', costCoins: 175, apply: 'speed' },
  { id: 'guard1', label: 'GUARD REGEN x2', costCoins: 175, apply: 'guardRegen' },
  { id: 'juggle1', label: 'LONGER JUGGLES', costCoins: 225, apply: 'juggle' },
];

export interface PerkPurchaseResult { ok: boolean; reason?: string }

/**
 * Buy a perk. The spend function is INJECTED — in a real session it is the
 * server-authoritative wallet call (client sends the perk id only; the
 * server owns price and balance). The client NEVER computes a new balance.
 */
export async function buyPerk(
  perkId: string,
  owned: ReadonlySet<string>,
  spend: (perkId: string, costCoins: number) => Promise<PerkPurchaseResult>,
): Promise<PerkPurchaseResult> {
  const perk = PERKS.find((p) => p.id === perkId);
  if (!perk) return { ok: false, reason: 'unknown perk' };
  if (owned.has(perkId)) return { ok: false, reason: 'already owned' };
  return spend(perkId, perk.costCoins);
}

// ── Down & revive (co-op) ──────────────────────────────────────────────────
export const BLEED_OUT_SEC = 30;
export const REVIVE_RANGE = 1.8;
export const REVIVE_CHANNEL_SEC = 3;
export const REVIVED_HP_RATIO = 0.4;

export class DownRevive {
  downedAt: number | null = null;      // seconds clock (mode-owned)
  channelSec = 0;

  get downed(): boolean { return this.downedAt !== null; }

  down(nowSec: number): void { this.downedAt = nowSec; this.channelSec = 0; }

  /** Ally holds the revive button in range; call per frame. */
  channel(dt: number, allyInRange: boolean): boolean {
    if (!this.downed) return false;
    this.channelSec = allyInRange ? this.channelSec + dt : 0;
    return this.channelSec >= REVIVE_CHANNEL_SEC;
  }

  revive(): number {                     // returns the HP ratio to restore
    this.downedAt = null; this.channelSec = 0;
    return REVIVED_HP_RATIO;
  }

  /** True when the bleed-out timer expired (run over if both down). */
  bledOut(nowSec: number): boolean {
    return this.downedAt !== null && nowSec - this.downedAt >= BLEED_OUT_SEC;
  }
}
