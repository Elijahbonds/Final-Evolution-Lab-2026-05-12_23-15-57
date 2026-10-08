/**
 * Player + partner fusion (ADVENTURE PLAN A3, pillar 5, 2026-10-06). Owner: "have the flight be a thing once you fuse
 * with your partner". This is NOT FusionColosseum.fuse (that one breeds two companions); it is the party merging into
 * one body for a while.
 *
 *   THE METER (0..1, on the player's `fusion.meter`) fills from fighting TOGETHER: damage the player or the partner
 *   lands while the two are within FUSION_TOGETHER_RADIUS_M of each other.
 *   TO FUSE: the meter full, a bond tier of at least 1 (contracts fusionTierFor: bond 10+), FUSION_ENERGY_COST energy
 *   (spent whole or not at all), both standing (neither knocked out), and the player not riding.
 *   WHILE FUSED: `grantsFlight` (A1 reads it through flightSourceOf), the partner's element at the tier's power (A2's
 *   partner magic reads `fusion.tier`), merged stats (stats/derive mergeFusionAttrs, applied by the stats system),
 *   and the partner's body hidden (its own `fusion.active` is true: the view hides a partner whose fusion is active).
 *   IT ENDS on the fuse button, at the timer (30 s + 10 s per tier), or when the player is knocked out. Unfusing
 *   restores both: the player's maxes re-derive unfused, the partner reappears beside them.
 *   BOND grows by BOND_PER_FUSION each fusion and BOND_PER_SHARED_KO each enemy the party fells together.
 *
 * Pure. Mutates the two actors' `fusion` objects in place (A3's field); allocation-free.
 */
import {
  fusionTierFor, spendPool, type AdventureActor, type Element, type FusionState,
} from '../contracts';

// ── Tuning [TUNE] ────────────────────────────────────────────────────────────────────────────────────────────────

export const FUSION_BASE_SEC = 30;
export const FUSION_PER_TIER_SEC = 10;
export const FUSION_ENERGY_COST = 25;
/** Meter per point of damage the party lands together (300 damage fills it). */
export const FUSION_METER_PER_DAMAGE = 1 / 300;
export const FUSION_TOGETHER_RADIUS_M = 15;
export const BOND_PER_FUSION = 3;
export const BOND_PER_SHARED_KO = 1;
export const BOND_MAX = 100;

export const fusionDurationSec = (tier: FusionState['tier']): number => FUSION_BASE_SEC + FUSION_PER_TIER_SEC * tier;

/** `locked` (Phase B): the story has not reached the first fusion yet (story/flags.ts FLAG_FUSION_UNLOCKED). */
export type FuseRefusal = 'already' | 'tier' | 'meter' | 'energy' | 'riding' | 'down' | 'partnerDown' | 'locked';

const isDown = (a: AdventureActor): boolean => a.state === 'ko' || a.stats.hp.cur <= 0;

/**
 * Why the party cannot fuse now, or null when it can. `unlocked` (Phase B, default true): false while the story has not
 * reached its first fusion (Chapter 1's finale); the test yard and the BR never pass it.
 */
export function fuseRefusal(player: AdventureActor, partner: AdventureActor, bond: number, unlocked = true): FuseRefusal | null {
  if (player.fusion.active) return 'already';
  if (!unlocked) return 'locked';
  if (isDown(player)) return 'down';
  if (isDown(partner)) return 'partnerDown';
  if (player.ridingId) return 'riding';
  if (fusionTierFor(bond) < 1) return 'tier';
  if (player.fusion.meter < 1 - 1e-9) return 'meter';
  if (player.stats.energy.cur + 1e-9 < FUSION_ENERGY_COST) return 'energy';
  return null;
}

function setFusion(f: FusionState, active: boolean, tier: FusionState['tier'], remainingSec: number, partnerId: string | null, element: Element | null, flight = true): void {
  f.active = active;
  f.tier = tier;
  f.remainingSec = remainingSec;
  f.partnerId = partnerId;
  f.element = element;
  f.grantsFlight = active && flight;
}

/**
 * Fuse. Spends the energy and the meter, sets both actors' fusion, and returns the tier, or null (nothing changed)
 * when refused. `bond` is the partner def's; the caller adds BOND_PER_FUSION to it.
 * `grantsFlight` (Phase B, default true): the fusion grants flight only when the story has unlocked it (owner: "flight
 * first unlocks after Chapter 1's boss"; story/flags.ts FLAG_FLIGHT_UNLOCKED). The yard and the BR never pass it.
 */
export function beginFusion(player: AdventureActor, partner: AdventureActor, bond: number, element: Element, grantsFlight = true): FusionState['tier'] | null {
  if (fuseRefusal(player, partner, bond) !== null) return null;
  if (!spendPool(player.stats.energy, FUSION_ENERGY_COST)) return null;
  const tier = fusionTierFor(bond);
  const sec = fusionDurationSec(tier);
  setFusion(player.fusion, true, tier, sec, partner.id, element, grantsFlight);
  setFusion(partner.fusion, true, tier, sec, player.id, element, grantsFlight);
  player.fusion.meter = 0;
  partner.fusion.meter = 0;
  return tier;
}

/** Unfuse both. The tier stays (the HUD shows the next fusion's tier); the element stays the partner's. */
export function endFusion(player: AdventureActor, partner: AdventureActor | null): void {
  setFusion(player.fusion, false, player.fusion.tier, 0, player.partnerId, player.fusion.element);
  if (partner) setFusion(partner.fusion, false, partner.fusion.tier, 0, player.id, partner.fusion.element);
}

/** Count a fused party's clock down. True when it ran out on this step (the caller ends it). */
export function tickFusion(player: AdventureActor, partner: AdventureActor | null, dt: number): boolean {
  if (!player.fusion.active) return false;
  player.fusion.remainingSec = Math.max(0, player.fusion.remainingSec - dt);
  if (partner) partner.fusion.remainingSec = player.fusion.remainingSec;
  return player.fusion.remainingSec <= 0;
}

/** Fill the player's meter from damage the party landed together (no fill while fused). */
export function fillFusionMeter(player: AdventureActor, partner: AdventureActor | null, damage: number): void {
  if (player.fusion.active || !(damage > 0) || !partner) return;
  const dx = partner.pos.x - player.pos.x, dy = partner.pos.y - player.pos.y, dz = partner.pos.z - player.pos.z;
  if (dx * dx + dy * dy + dz * dz > FUSION_TOGETHER_RADIUS_M * FUSION_TOGETHER_RADIUS_M) return;
  player.fusion.meter = Math.min(1, player.fusion.meter + damage * FUSION_METER_PER_DAMAGE);
  partner.fusion.meter = player.fusion.meter;
}

/** Keep the idle tier on both actors in step with the bond (shown on the HUD before a fusion). */
export function syncIdleTier(player: AdventureActor, partner: AdventureActor | null, bond: number, element: Element): void {
  if (player.fusion.active) return;
  const tier = fusionTierFor(bond);
  player.fusion.tier = tier;
  player.fusion.element = element;
  player.fusion.partnerId = partner?.id ?? player.fusion.partnerId;
  if (partner) {
    partner.fusion.tier = tier;
    partner.fusion.element = element;
    partner.fusion.partnerId = player.id;
  }
}
