// FIGHTING STYLES, AND BLENDS OF THEM (2026-09-13).
//
// Owner: "For the karate modes allow them to select their fighting style, and the ability to create different
// blends of fighting styles." How a blend is built, decided up front: "two styles + a balance slider".
//
// WHAT A STYLE IS HERE, and what it is not. FighterStyle.ts already owns what your body CAN do — quickness
// and force derived from the PRQ scan, which moves that unlocks, which combo routes you own. That is what you
// have EARNED. A school is a different question: not what you can do, but how you do it. So a school never
// grants a move and never gates one; it scales the seams FighterStyle already exposes (startup, damage,
// cancel window) plus reach, guard and chi.
//
// THE BUDGET, which is the whole reason blending is safe.
//
// Every trait is a multiplier where HIGHER IS BETTER, and every school's six traits sum to exactly 6.0. A
// school is therefore a redistribution, never an upgrade — you cannot pick a school that is simply better,
// because there is no slack to put anywhere.
//
// And then the part that makes the slider work: a blend is a CONVEX COMBINATION of two schools, and a convex
// combination of two vectors that both sum to 6 also sums to 6. So every blend a player can build is exactly
// as on-budget as the schools it came from — at any mix, for any pair, without anyone tuning a single one of
// them. There is no combination to discover that breaks the game, and no cap anybody has to remember to
// enforce. schools.test.ts proves it over the whole space rather than over a handful of examples.
//
// Pure: no Babylon, no scene, no DOM beyond the remembered pick.

import type { RouteStrike } from '../core/FighterStyle';

/**
 * How a school fights. Every field is a multiplier, higher is better, and the six sum to STYLE_BUDGET.
 *
 * Two of them are inverted where they are USED rather than where they are stored, because "higher is better"
 * is what makes the budget arithmetic work and a shorter startup is a smaller number. See startupMult and
 * guardTakenMult — never read `speed` or `guard` directly into a frame count.
 */
export interface StyleTraits {
  /** Hands and feet arrive sooner. */
  speed: number;
  /** Clean hits take more. */
  power: number;
  /** Strikes land from further out. */
  reach: number;
  /** A block soaks more before the guard breaks. */
  guard: number;
  /** Chi builds faster, so the finisher comes round sooner. */
  chi: number;
  /** Longer cancel window: one strike runs into the next, so routes are actually runnable. */
  flow: number;
}

export const STYLE_TRAIT_KEYS = ['speed', 'power', 'reach', 'guard', 'chi', 'flow'] as const;
/** Six traits, each nominally 1.0. A school spends this and not a point more. */
export const STYLE_BUDGET = 6;

export interface School {
  id: string;
  name: string;
  /** One line on the picker: what it gives you, then what it costs. */
  sub: string;
  tint: string;
  traits: StyleTraits;
  /** The strike this school throws most naturally — a small route bonus, never a gate. */
  favours: RouteStrike;
  ready: boolean;
}

/**
 * The schools.
 *
 * Named for what they DO rather than after any real organisation or lineage, which is both the respectful
 * choice and the accurate one: these are six movement identities in a video game, not a claim about how any
 * real school trains. Nothing here is a real curriculum and the game never says it is.
 */
export const SCHOOLS: readonly School[] = [
  {
    id: 'straight', name: 'STRAIGHT', sub: 'The even hand. Slightly quicker, slightly less flow.',
    tint: '#ff9d5c', favours: 'jab', ready: true,
    traits: { speed: 1.05, power: 1.00, reach: 1.00, guard: 1.00, chi: 1.00, flow: 0.95 },
  },
  {
    id: 'crashing', name: 'CRASHING', sub: 'Heavy and hard to move. Everything arrives late.',
    tint: '#e0604a', favours: 'heavy', ready: true,
    traits: { speed: 0.90, power: 1.20, reach: 1.05, guard: 1.10, chi: 0.95, flow: 0.80 },
  },
  {
    id: 'sharp', name: 'SHARP', sub: 'The fastest hands in the game, and no legs to speak of.',
    tint: '#4cc9f0', favours: 'jab', ready: true,
    traits: { speed: 1.25, power: 1.05, reach: 0.80, guard: 1.00, chi: 0.95, flow: 0.95 },
  },
  {
    id: 'sweeping', name: 'SWEEPING', sub: 'Long legs and quick chi. Your guard is paper.',
    tint: '#c99bf7', favours: 'kick', ready: true,
    traits: { speed: 1.10, power: 0.90, reach: 1.15, guard: 0.80, chi: 1.15, flow: 0.90 },
  },
  {
    id: 'anchored', name: 'ANCHORED', sub: 'Nothing gets through the guard. Nothing you throw is quick.',
    tint: '#8fe0a0', favours: 'heavy', ready: true,
    traits: { speed: 0.85, power: 1.20, reach: 0.85, guard: 1.25, chi: 1.00, flow: 0.85 },
  },
  {
    id: 'flowing', name: 'FLOWING', sub: 'Chains everything into everything. Hits like a rumour.',
    tint: '#ffd75e', favours: 'jab', ready: true,
    traits: { speed: 1.15, power: 0.85, reach: 0.85, guard: 0.95, chi: 1.00, flow: 1.20 },
  },
];

export function schoolById(id: string): School {
  return SCHOOLS.find((s) => s.id === id) ?? SCHOOLS[0];
}

export function readySchools(): School[] {
  return SCHOOLS.filter((s) => s.ready);
}

/** A player's style: a primary, a secondary, and how much of the secondary is in it. */
export interface StyleBlend {
  primary: string;
  secondary: string;
  /** 0 = pure primary, 1 = pure secondary. The picker's slider. */
  mix: number;
}

export const PURE: StyleBlend = { primary: 'straight', secondary: 'straight', mix: 0 };

export function clampMix(mix: number): number {
  return Number.isFinite(mix) ? Math.max(0, Math.min(1, mix)) : 0;
}

/**
 * The traits a blend actually fights with.
 *
 * A straight lerp, and that is the point: because both inputs sum to STYLE_BUDGET, so does every output. No
 * clamping, no renormalising, no per-pair balancing — the arithmetic does it.
 */
export function blendTraits(blend: StyleBlend): StyleTraits {
  const a = schoolById(blend.primary).traits;
  const b = schoolById(blend.secondary).traits;
  const t = clampMix(blend.mix);
  const out = {} as StyleTraits;
  for (const k of STYLE_TRAIT_KEYS) out[k] = a[k] * (1 - t) + b[k] * t;
  return out;
}

/** What the blend is called. A blend that is really one school says so rather than naming itself twice. */
export function blendName(blend: StyleBlend): string {
  const a = schoolById(blend.primary), b = schoolById(blend.secondary);
  const t = clampMix(blend.mix);
  if (a.id === b.id || t <= 0.02) return a.name;
  if (t >= 0.98) return b.name;
  return `${a.name} / ${b.name} ${Math.round((1 - t) * 100)}-${Math.round(t * 100)}`;
}

/** The accent colour a blend shows. At a 50-50 it is the primary's, because something has to lead. */
export function blendTint(blend: StyleBlend): string {
  return clampMix(blend.mix) >= 0.5 && blend.primary !== blend.secondary
    ? schoolById(blend.secondary).tint
    : schoolById(blend.primary).tint;
}

// ── USING A STYLE ────────────────────────────────────────────────────────────────────────────────────────
// The converters. Two traits are stored "higher is better" and USED as "lower is better", and these are the
// only places that flip them — a frame count computed straight from `speed` would make the fastest school
// the slowest one.

/** Startup multiplier: speed 1.25 gives 0.75x, so a sharp fighter's jab lands in three quarters of the time. */
export function startupMult(t: StyleTraits): number {
  return Math.max(0.5, 2 - t.speed);
}

/** Damage multiplier on a clean hit. */
export function damageMult(t: StyleTraits): number {
  return t.power;
}

/** Attack range multiplier. */
export function rangeMult(t: StyleTraits): number {
  return t.reach;
}

/** Guard damage TAKEN when blocking: guard 1.25 gives 0.75x, so the anchored school's guard lasts longer. */
export function guardTakenMult(t: StyleTraits): number {
  return Math.max(0.4, 2 - t.guard);
}

/** Chi gained per clean hit. */
export function chiMult(t: StyleTraits): number {
  return t.chi;
}

/** Cancel-window multiplier — how much one strike runs into the next. */
export function cancelMult(t: StyleTraits): number {
  return t.flow;
}

/**
 * A small payoff bonus when a route ends on the strike this blend favours.
 *
 * Deliberately tiny (a blend at most 6% up on one of five routes) and deliberately OUTSIDE the budget, because
 * it is not a stat — it is a reason to pick the school whose rhythm matches the route you like running. A
 * blend's favoured strike is its primary's unless the secondary is more than half of it.
 */
export const FAVOUR_BONUS = 0.06;

export function favouredStrike(blend: StyleBlend): RouteStrike {
  return clampMix(blend.mix) > 0.5 ? schoolById(blend.secondary).favours : schoolById(blend.primary).favours;
}

export function routeBonus(blend: StyleBlend, lastStrike: RouteStrike): number {
  return lastStrike === favouredStrike(blend) ? 1 + FAVOUR_BONUS : 1;
}

// ── THE PICK ─────────────────────────────────────────────────────────────────────────────────────────────

export const BLEND_KEY = 'fel-combat-style';

/** The player's style: `?style=` (as `primary:secondary:mix`) wins, then the remembered blend, then STRAIGHT. */
export function readBlend(): StyleBlend {
  const fallback: StyleBlend = { primary: SCHOOLS[0].id, secondary: SCHOOLS[0].id, mix: 0 };
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('style');
      const fromQuery = parseBlend(q);
      if (fromQuery) return fromQuery;
      const fromStore = parseBlend(window.localStorage.getItem(BLEND_KEY));
      if (fromStore) return fromStore;
    }
  } catch { /* private mode: the even hand */ }
  return fallback;
}

/** `primary:secondary:mix`, e.g. `sharp:anchored:0.3`. Unknown ids fall back rather than throwing. */
export function parseBlend(raw: string | null | undefined): StyleBlend | null {
  if (!raw) return null;
  const [p, s, m] = raw.split(':');
  if (!SCHOOLS.some((x) => x.id === p)) return null;
  return {
    primary: p,
    secondary: SCHOOLS.some((x) => x.id === s) ? s : p,
    mix: clampMix(Number(m)),
  };
}

export function formatBlend(blend: StyleBlend): string {
  return `${blend.primary}:${blend.secondary}:${clampMix(blend.mix).toFixed(2)}`;
}

export function writeBlend(blend: StyleBlend): void {
  try { window.localStorage.setItem(BLEND_KEY, formatBlend(blend)); } catch { /* convenience only */ }
}
