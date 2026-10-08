/**
 * Derived stats (ADVENTURE PLAN A3, 2026-10-06): what an actor's numbers are, from PRQ, level, school, gear and
 * fusion. The one place a max HP, a stamina max, an energy max, a poise max and an energy regen are decided.
 *
 *   HP       prqMaxHp(100 + 8 × (level − 1), band) × fusion, + gear            (the plan's formula; PrqVitals' band table)
 *   energy   100 + 4 × (level − 1) + 10 × fusion tier                          (magic and specials)
 *   stamina  100 + endurance / 5                                                (A2 spends and regenerates it; A3 sets the max)
 *   poise    (40 + strength / 5) × the school's guard trait + gear
 *   regen    (3 + recovery / 50) × the school's chi trait + gear, energy per second
 *
 * THE RULES FROM PrqVitals HOLD HERE. A guest (no band, no attributes) is READY with a baseline body (every attribute
 * 50): never a penalty. RECOVERING is gentle (0.92× HP). A school is a redistribution (schools.ts: every school sums to
 * the same budget), so it moves poise against regen and never makes anyone simply stronger.
 *
 * Adventure TRAINING (from play and the Mirror, kept in the save) adds at most TRAINING_BONUS_MAX points to an
 * attribute here. It never writes PRQ (owner rule: the Adventure reads PRQ only).
 *
 * Pure: no Babylon, no clock. Every output is clamped to STAT_BOUNDS, so no band, level, gear or bad data can produce
 * an unplayable or an unbounded actor.
 */
import { PRQ_ATTRS, prqGrade, type PrqAttr } from '@/lib/prq';
import { GUEST_BAND, prqMaxHp, prqSpeedMult } from '@/lib/babylon/core/PrqVitals';
import { ratingsFrom, type FightRatings } from '@/lib/babylon/core/FighterStyle';
import { PURE, blendTraits, clampMix, schoolById, type StyleBlend, type StyleTraits } from '@/lib/babylon/combat/schools';
import { PRQ_BANDS, pool, type ActorStats, type Element, type FusionState, type PrqBand } from '../contracts';
import { ADVENTURE_LEVEL_CAP } from './level';

// ── Tuning [TUNE] ────────────────────────────────────────────────────────────────────────────────────────────────

export const HP_BASE = 100;
export const HP_PER_LEVEL = 8;
export const ENERGY_BASE = 100;
export const ENERGY_PER_LEVEL = 4;
export const STAMINA_BASE = 100;
/** Stamina max gains endurance / this. */
export const STAMINA_ENDURANCE_DIV = 5;
export const POISE_BASE = 40;
export const POISE_STRENGTH_DIV = 5;
export const ENERGY_REGEN_BASE = 3;
export const ENERGY_REGEN_RECOVERY_DIV = 50;
/** Fusion: HP × (1 + this × tier) and energy + FUSION_ENERGY_PER_TIER × tier while fused. */
export const FUSION_HP_PER_TIER = 0.05;
export const FUSION_ENERGY_PER_TIER = 10;
/** A body that has never been scanned: every attribute at the middle. */
export const BASELINE_ATTR = 50;
/** Training points per attribute point of bonus, and the most bonus training can add. */
export const TRAINING_POINTS_PER_ATTR = 100;
export const TRAINING_BONUS_MAX = 10;
/** The most training points one attribute keeps (the bonus is capped well before this). */
export const TRAINING_POINTS_MAX = 5000;

/** Gear (BR loot, later story items): flat bonuses, each clamped to its own cap. */
export interface GearBonus { hp?: number; poise?: number; energyRegen?: number; speed?: number }
export const GEAR_CAPS: Readonly<Required<GearBonus>> = { hp: 60, poise: 30, energyRegen: 1.5, speed: 0.1 };

/** Every derived number stays inside these (inclusive). The tests sweep the whole input space against them. */
export const STAT_BOUNDS = {
  hp: [60, 700],
  stamina: [100, 120],
  energy: [100, 340],
  poise: [30, 110],
  energyRegen: [2, 8],
  speedMult: [0.85, 1.3],
} as const satisfies Record<string, readonly [number, number]>;

// ── Types ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DeriveInput {
  level: number;
  /** The PRQ band; null/undefined = a guest = READY. */
  band?: PrqBand | null;
  /** The 8 PRQ attributes (0..100) when known; a missing one is BASELINE_ATTR. */
  attrs?: Partial<Record<PrqAttr, number>> | null;
  /** Adventure training points per attribute (the save's `player.training`). */
  training?: Partial<Record<PrqAttr, number>> | null;
  school?: StyleBlend | null;
  gear?: GearBonus | null;
  element?: Element | null;
  /** While fused: the partner's attributes merge in, and the tier adds HP and energy. */
  fusion?: { partnerAttrs: Partial<Record<PrqAttr, number>>; tier: FusionState['tier']; element?: Element | null } | null;
}

export interface DerivedStats {
  level: number;
  prqBand: PrqBand;
  school: StyleBlend;
  element: Element | null;
  /** The effective attributes (PRQ + training, merged with the partner while fused), 0..100. */
  attrs: Record<PrqAttr, number>;
  hpMax: number;
  staminaMax: number;
  energyMax: number;
  poiseMax: number;
  energyRegenPerSec: number;
  /** Special meter gain multiplier (the school's chi trait). */
  specialGainMult: number;
  /** PRQ movement multiplier (PrqVitals), plus boots. A1 may read it; A3 does not apply it to any field. */
  speedMult: number;
  ratings: FightRatings;
  traits: StyleTraits;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const finite = (v: unknown, fb: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
const inBounds = (v: number, b: readonly [number, number]): number => clamp(v, b[0], b[1]);

/** A band as PRQ knows it: a guest or junk is GUEST_BAND (READY). */
export function bandOf(band: unknown): PrqBand {
  return (PRQ_BANDS as readonly unknown[]).includes(band) ? (band as PrqBand) : GUEST_BAND;
}

/** A representative score per band, so the band reads its speedMult from prqGrade's own table (one table, not two). */
const BAND_SCORE: Record<PrqBand, number> = { RECOVERING: 20, READY: 50, PRIMED: 70, ELITE: 90 };

/** A school blend with known ids and a clamped mix (unknown ids read as the first school, as schoolById does). */
export function sanitizeSchool(s: unknown): StyleBlend {
  if (!s || typeof s !== 'object') return { ...PURE };
  const o = s as Record<string, unknown>;
  const primary = typeof o.primary === 'string' ? schoolById(o.primary).id : PURE.primary;
  const secondary = typeof o.secondary === 'string' ? schoolById(o.secondary).id : primary;
  return { primary, secondary, mix: clampMix(finite(o.mix, 0)) };
}

/** Training points → bonus attribute points, capped. */
export function trainingBonus(points: number | undefined): number {
  return clamp(finite(points, 0) / TRAINING_POINTS_PER_ATTR, 0, TRAINING_BONUS_MAX);
}

/**
 * Fusion's attribute merge, per attribute: 0.7 × the higher + 0.3 × the lower. The weights are FusionColosseum.fuse's
 * (the companion + companion fusion), without its random roll: the player + partner fusion is deterministic, so the
 * same pair fuses to the same body every time (and a BR host and its peers agree).
 */
export function mergeFusionAttrs(
  a: Partial<Record<PrqAttr, number>>, b: Partial<Record<PrqAttr, number>>,
): Record<PrqAttr, number> {
  const out = {} as Record<PrqAttr, number>;
  for (const k of PRQ_ATTRS) {
    const x = clamp(finite(a[k], BASELINE_ATTR), 0, 100), y = clamp(finite(b[k], BASELINE_ATTR), 0, 100);
    out[k] = Math.round((Math.max(x, y) * 0.7 + Math.min(x, y) * 0.3) * 10) / 10;
  }
  return out;
}

function effectiveAttrs(attrs: DeriveInput['attrs'], training: DeriveInput['training']): Record<PrqAttr, number> {
  const out = {} as Record<PrqAttr, number>;
  for (const k of PRQ_ATTRS) {
    out[k] = clamp(finite(attrs?.[k], BASELINE_ATTR), 0, 100);
    out[k] = Math.min(100, out[k] + trainingBonus(training?.[k]));
  }
  return out;
}

// ── The derivation ───────────────────────────────────────────────────────────────────────────────────────────────

export function deriveActorStats(input: DeriveInput): DerivedStats {
  const level = Number.isFinite(input.level) ? clamp(Math.floor(input.level), 1, ADVENTURE_LEVEL_CAP) : 1;
  const band = bandOf(input.band);
  const school = sanitizeSchool(input.school);
  const traits = blendTraits(school);
  const gear = input.gear ?? {};
  const gHp = clamp(finite(gear.hp, 0), 0, GEAR_CAPS.hp);
  const gPoise = clamp(finite(gear.poise, 0), 0, GEAR_CAPS.poise);
  const gRegen = clamp(finite(gear.energyRegen, 0), 0, GEAR_CAPS.energyRegen);
  const gSpeed = clamp(finite(gear.speed, 0), 0, GEAR_CAPS.speed);

  let attrs = effectiveAttrs(input.attrs, input.training);
  const fusion = input.fusion ?? null;
  const tier = fusion ? clamp(Math.floor(finite(fusion.tier, 0)), 0, 3) : 0;
  if (fusion) {
    // fusion never makes the player weaker: an attribute the player already leads in stays theirs
    const merged = mergeFusionAttrs(attrs, fusion.partnerAttrs);
    for (const k of PRQ_ATTRS) merged[k] = Math.max(attrs[k], merged[k]);
    attrs = merged;
  }

  const hpRaw = prqMaxHp(HP_BASE + HP_PER_LEVEL * (level - 1), band) * (1 + FUSION_HP_PER_TIER * tier) + gHp;
  const energyRaw = ENERGY_BASE + ENERGY_PER_LEVEL * (level - 1) + FUSION_ENERGY_PER_TIER * tier;
  const staminaRaw = STAMINA_BASE + attrs.endurance / STAMINA_ENDURANCE_DIV;
  const poiseRaw = (POISE_BASE + attrs.strength / POISE_STRENGTH_DIV) * traits.guard + gPoise;
  const regenRaw = (ENERGY_REGEN_BASE + attrs.recovery / ENERGY_REGEN_RECOVERY_DIV) * traits.chi + gRegen;
  const speedRaw = prqSpeedMult(prqGrade(BAND_SCORE[band])) + gSpeed;

  return {
    level,
    prqBand: band,
    school,
    element: (fusion?.element ?? input.element) ?? null,
    attrs,
    hpMax: Math.round(inBounds(hpRaw, STAT_BOUNDS.hp)),
    staminaMax: Math.round(inBounds(staminaRaw, STAT_BOUNDS.stamina)),
    energyMax: Math.round(inBounds(energyRaw, STAT_BOUNDS.energy)),
    poiseMax: Math.round(inBounds(poiseRaw, STAT_BOUNDS.poise)),
    energyRegenPerSec: Math.round(inBounds(regenRaw, STAT_BOUNDS.energyRegen) * 100) / 100,
    specialGainMult: traits.chi,
    speedMult: Math.round(inBounds(speedRaw, STAT_BOUNDS.speedMult) * 1000) / 1000,
    ratings: ratingsFrom(attrs),
    traits,
  };
}

/** A fresh ActorStats with full pools and an empty special (a spawn). */
export function actorStatsFrom(d: DerivedStats): ActorStats {
  return {
    hp: pool(d.hpMax), stamina: pool(d.staminaMax), energy: pool(d.energyMax), poise: pool(d.poiseMax),
    special: 0, level: d.level, prqBand: d.prqBand, school: { ...d.school }, element: d.element, attrs: { ...d.attrs },
  };
}

/**
 * Write a derivation onto an actor's stats: every max, level, band, school, element and attrs (A3's fields).
 *
 * `fill` (a spawn): every pool starts full. Otherwise current values are left alone, EXCEPT that a current value above
 * its new max is lowered to it: a pool's cur ≤ max is the pool's invariant, and lowering a max (unfusing, a level
 * reset) is the only way A3 ever touches another lane's `cur`. A3 never RAISES hp or stamina `cur` (that is A2's).
 */
export function applyDerived(stats: ActorStats, d: DerivedStats, fill = false): void {
  const set = (p: { cur: number; max: number }, max: number) => {
    p.max = max;
    if (fill) p.cur = max;
    else if (p.cur > max) p.cur = max;
  };
  set(stats.hp, d.hpMax);
  set(stats.stamina, d.staminaMax);
  set(stats.energy, d.energyMax);
  set(stats.poise, d.poiseMax);
  if (fill) stats.special = 0;
  stats.level = d.level;
  stats.prqBand = d.prqBand;
  stats.school = { ...d.school };
  stats.element = d.element;
  stats.attrs = { ...d.attrs };
}
