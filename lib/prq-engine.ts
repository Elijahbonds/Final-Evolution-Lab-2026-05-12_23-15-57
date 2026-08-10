/**
 * lib/prq-engine.ts
 *
 * Unified PRQ (Performance Rating Quotient) math for FEL.
 *
 * Pure, deterministic, unit-testable functions only — no I/O, no Prisma, no
 * Date.now() defaults inside the math (callers pass timestamps explicitly).
 * The server (app/api/sessions/route.ts) is the ONLY writer of PRQ state;
 * clients may import the read-only helpers (tierForPrq, attributesForMode)
 * for display but never apply deltas locally.
 *
 * Harvested from copilot_systems:
 * - PRQSystem.js  -> event type weights, quality weights, 50-baseline
 *                    normalisation curve (baseline + normalizedDelta * 4).
 * - ScoreSystem.js / ComboSystem.js -> combo multiplier ladder (4/7/10 -> 2x/3x/4x).
 * The rolling 60s event-window model was dropped: on the web app the client
 * reports end-of-session tallies and the server computes one performance
 * score per session (server-authoritative rule).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PRQ_BASELINE = 50;
export const ATTRIBUTE_MIN = 0;
export const ATTRIBUTE_MAX = 100;

/** Max PRQ movement a single session can produce on one attribute (anti-farm). */
export const MAX_SESSION_ATTRIBUTE_DELTA = 3;

/** Inactivity decay tuning. */
export const DECAY_GRACE_MS = 72 * 60 * 60 * 1000; // 3 days before decay starts
export const DECAY_PER_DAY = 0.5; // points per attribute per day past grace
export const DECAY_FLOOR = 30; // decay never drags an attribute below this
export const DECAY_MAX_TOTAL = 15; // total decay applied is capped

export type PrqTier =
  | 'FOUNDATION'
  | 'DEVELOPING'
  | 'ADVANCED'
  | 'ELITE'
  | 'LEGENDARY';

/** Ordered high -> low; first match wins. */
export const TIER_THRESHOLDS: ReadonlyArray<{ tier: PrqTier; min: number }> = [
  { tier: 'LEGENDARY', min: 95 },
  { tier: 'ELITE', min: 80 },
  { tier: 'ADVANCED', min: 60 },
  { tier: 'DEVELOPING', min: 40 },
  { tier: 'FOUNDATION', min: 0 },
];

// ---------------------------------------------------------------------------
// Attribute registry (per-mode attribute vectors)
// ---------------------------------------------------------------------------

/** An attribute vector: attribute name -> 0..100. */
export type AttributeVector = Record<string, number>;

/** Per-mode vectors keyed by mode id (e.g. { basketball: {...}, karate: {...} }). */
export type AttributesByMode = Record<string, AttributeVector>;

export const DEFAULT_MODE_ATTRIBUTES: readonly string[] = [
  'technique',
  'timing',
  'power',
  'consistency',
  'focus',
];

/**
 * Hero modes get bespoke vectors; every other mode falls back to the default
 * five so new play modes need zero engine changes.
 */
export const MODE_ATTRIBUTES: Record<string, readonly string[]> = {
  basketball: ['verticalControl', 'timing', 'power', 'consistency', 'focus'],
  dunking: ['verticalControl', 'timing', 'power', 'consistency', 'focus'],
  karate: ['technique', 'speed', 'power', 'defense', 'focus'],
};

export function attributesForMode(mode: string): readonly string[] {
  return MODE_ATTRIBUTES[mode] ?? DEFAULT_MODE_ATTRIBUTES;
}

/** Returns a fresh baseline vector for a mode (every attribute at 50). */
export function baselineVector(mode: string): AttributeVector {
  const vector: AttributeVector = {};
  for (const attr of attributesForMode(mode)) vector[attr] = PRQ_BASELINE;
  return vector;
}

/**
 * Merges a possibly-partial stored vector onto the mode baseline so newly
 * added attributes appear at 50 instead of undefined.
 */
export function normalizeVector(
  mode: string,
  stored: AttributeVector | undefined,
): AttributeVector {
  const vector = baselineVector(mode);
  if (!stored) return vector;
  for (const attr of Object.keys(vector)) {
    const value = stored[attr];
    if (typeof value === 'number' && Number.isFinite(value)) {
      vector[attr] = clamp(value, ATTRIBUTE_MIN, ATTRIBUTE_MAX);
    }
  }
  return vector;
}

// ---------------------------------------------------------------------------
// Session performance (harvested weights from PRQSystem.js)
// ---------------------------------------------------------------------------

export interface SessionTallies {
  hits: number;
  misses: number;
  dodges: number;
  combos: number;
}

export const EMPTY_TALLIES: SessionTallies = {
  hits: 0,
  misses: 0,
  dodges: 0,
  combos: 0,
};

const TYPE_WEIGHTS: Record<keyof SessionTallies, number> = {
  hits: 8,
  misses: -12,
  dodges: 6,
  combos: 10,
};

/** Combo multiplier ladder, harvested verbatim from ComboSystem/ScoreSystem. */
export function comboMultiplier(chain: number): 1 | 2 | 3 | 4 {
  const length = Math.max(0, Math.floor(Number.isFinite(chain) ? chain : 0));
  if (length >= 10) return 4;
  if (length >= 7) return 3;
  if (length >= 4) return 2;
  return 1;
}

export interface SessionPerformanceInput {
  tallies: SessionTallies;
  /** Average execution quality 0..1 (PRQSystem quality weights collapse to this). */
  qualityAvg?: number;
  /** Longest combo chain in the session. */
  maxCombo?: number;
}

/**
 * Collapses a session's tallies into a single 0..100 performance score.
 *
 * Mirrors PRQSystem.computePRQ(): baseline 50, weighted event average scaled
 * by 4, clamped — plus a small bonus for sustained combo chains
 * ((multiplier - 1) * 2, so a 10+ chain is worth +6).
 * Empty sessions score exactly the 50 baseline.
 */
export function computeSessionPerformance(
  input: SessionPerformanceInput,
): number {
  const tallies = sanitizeTallies(input.tallies);
  const totalEvents =
    tallies.hits + tallies.misses + tallies.dodges + tallies.combos;
  if (totalEvents === 0) return PRQ_BASELINE;

  // PRQSystem default quality weight is 0.7 for positive events; misses
  // always count at full weight (quality can't soften a miss).
  const quality = clamp(input.qualityAvg ?? 0.7, 0, 1);

  const weighted =
    tallies.hits * TYPE_WEIGHTS.hits * quality +
    tallies.misses * TYPE_WEIGHTS.misses +
    tallies.dodges * TYPE_WEIGHTS.dodges * quality +
    tallies.combos * TYPE_WEIGHTS.combos * quality;

  const normalized = weighted / totalEvents;
  const comboBonus = (comboMultiplier(input.maxCombo ?? 0) - 1) * 2;

  return round2(clamp(PRQ_BASELINE + normalized * 4 + comboBonus, 0, 100));
}

// ---------------------------------------------------------------------------
// Session result -> PRQ delta pipeline
// ---------------------------------------------------------------------------

/**
 * Which tally signal each attribute keys off. Attributes not listed lean on
 * the blended performance score alone (emphasis 1.0).
 */
const ATTRIBUTE_SIGNAL: Record<string, keyof SessionTallies> = {
  technique: 'hits',
  power: 'hits',
  verticalControl: 'hits',
  speed: 'hits',
  timing: 'dodges',
  defense: 'dodges',
  consistency: 'combos',
  focus: 'combos',
};

export interface PrqDeltaInput {
  mode: string;
  /** 0..100 from computeSessionPerformance. */
  performance: number;
  /** Attribute vector BEFORE this session (post-decay). */
  currentAttributes: AttributeVector;
  won: boolean;
  tallies?: SessionTallies;
}

/** attribute -> signed delta (already diminished + clamped, 2 decimals). */
export type AttributeDelta = Record<string, number>;

/**
 * Converts a session performance score into per-attribute deltas.
 *
 * - Base gain: (performance - 50) / 10, so a perfect 100 session is worth a
 *   raw +5 and a disastrous 0 session a raw -5. A win adds +0.5.
 * - Diminishing returns: gains scale by headroom^0.75 (a 90-rated attribute
 *   earns ~18% of what a 50-rated one does); losses scale by level^0.75 so
 *   low attributes are protected from collapse.
 * - Signal emphasis: attributes tied to a tally signal (dodges -> timing,
 *   combos -> consistency, ...) move more when that signal dominated the
 *   session, within 0.6x..1.4x.
 * - Hard clamp at +/- MAX_SESSION_ATTRIBUTE_DELTA per attribute.
 */
export function computePrqDelta(input: PrqDeltaInput): AttributeDelta {
  const attrs = attributesForMode(input.mode);
  const tallies = sanitizeTallies(input.tallies ?? EMPTY_TALLIES);
  const positiveEvents = tallies.hits + tallies.dodges + tallies.combos;

  const performance = clamp(input.performance, 0, 100);
  const baseGain =
    (performance - PRQ_BASELINE) / 10 + (input.won ? 0.5 : 0);

  const delta: AttributeDelta = {};
  for (const attr of attrs) {
    const current = clamp(
      input.currentAttributes[attr] ?? PRQ_BASELINE,
      ATTRIBUTE_MIN,
      ATTRIBUTE_MAX,
    );

    // Diminishing returns / floor protection.
    const scale =
      baseGain >= 0
        ? Math.pow((ATTRIBUTE_MAX - current) / ATTRIBUTE_MAX, 0.75)
        : Math.pow(current / ATTRIBUTE_MAX, 0.75);

    // Signal emphasis (neutral 1.0 when there is no tally data).
    let emphasis = 1;
    const signal = ATTRIBUTE_SIGNAL[attr];
    if (signal && positiveEvents > 0) {
      const share = tallies[signal] / positiveEvents;
      emphasis = clamp(0.6 + share * 1.2, 0.6, 1.4);
    }

    delta[attr] = round2(
      clamp(
        baseGain * scale * emphasis,
        -MAX_SESSION_ATTRIBUTE_DELTA,
        MAX_SESSION_ATTRIBUTE_DELTA,
      ),
    );
  }
  return delta;
}

/** Applies a delta to a vector, clamping every attribute into 0..100. */
export function applyDelta(
  attributes: AttributeVector,
  delta: AttributeDelta,
): AttributeVector {
  const next: AttributeVector = { ...attributes };
  for (const [attr, change] of Object.entries(delta)) {
    const current = next[attr] ?? PRQ_BASELINE;
    next[attr] = round2(
      clamp(current + change, ATTRIBUTE_MIN, ATTRIBUTE_MAX),
    );
  }
  return next;
}

// ---------------------------------------------------------------------------
// Inactivity decay
// ---------------------------------------------------------------------------

export interface DecayResult {
  attributes: AttributeVector;
  /** Points of decay applied per attribute (0 when within grace). */
  decayApplied: number;
}

/**
 * Decays a vector toward DECAY_FLOOR after DECAY_GRACE_MS of inactivity, at
 * DECAY_PER_DAY per full day past grace, capped at DECAY_MAX_TOTAL.
 * Attributes at or below the floor never move. Pure: caller supplies `now`.
 */
export function applyInactivityDecay(
  attributes: AttributeVector,
  lastActiveAt: number | Date | null,
  now: number,
): DecayResult {
  if (lastActiveAt === null) return { attributes: { ...attributes }, decayApplied: 0 };
  const lastMs =
    lastActiveAt instanceof Date ? lastActiveAt.getTime() : lastActiveAt;
  const idleMs = now - lastMs - DECAY_GRACE_MS;
  if (!Number.isFinite(idleMs) || idleMs <= 0) {
    return { attributes: { ...attributes }, decayApplied: 0 };
  }

  const idleDays = Math.floor(idleMs / (24 * 60 * 60 * 1000));
  const decay = Math.min(idleDays * DECAY_PER_DAY, DECAY_MAX_TOTAL);
  if (decay <= 0) return { attributes: { ...attributes }, decayApplied: 0 };

  const next: AttributeVector = {};
  for (const [attr, value] of Object.entries(attributes)) {
    next[attr] =
      value <= DECAY_FLOOR ? value : round2(Math.max(DECAY_FLOOR, value - decay));
  }
  return { attributes: next, decayApplied: decay };
}

/** Decays every mode vector in a profile at once. */
export function decayAllModes(
  attributesByMode: AttributesByMode,
  lastActiveAt: number | Date | null,
  now: number,
): { attributesByMode: AttributesByMode; decayApplied: number } {
  let decayApplied = 0;
  const next: AttributesByMode = {};
  for (const [mode, vector] of Object.entries(attributesByMode)) {
    const result = applyInactivityDecay(vector, lastActiveAt, now);
    next[mode] = result.attributes;
    decayApplied = result.decayApplied; // identical across modes
  }
  return { attributesByMode: next, decayApplied };
}

// ---------------------------------------------------------------------------
// Aggregate PRQ + tiers
// ---------------------------------------------------------------------------

/** Overall PRQ = mean of every attribute across every mode played (1 dp). */
export function overallPrq(attributesByMode: AttributesByMode): number {
  let sum = 0;
  let count = 0;
  for (const vector of Object.values(attributesByMode)) {
    for (const value of Object.values(vector)) {
      if (Number.isFinite(value)) {
        sum += value;
        count += 1;
      }
    }
  }
  if (count === 0) return PRQ_BASELINE;
  return Math.round((sum / count) * 10) / 10;
}

export function tierForPrq(prq: number): PrqTier {
  const value = clamp(prq, 0, 100);
  for (const { tier, min } of TIER_THRESHOLDS) {
    if (value >= min) return tier;
  }
  return 'FOUNDATION';
}

// ---------------------------------------------------------------------------
// Lesson delta application (education-lane interface)
// ---------------------------------------------------------------------------

export interface LessonDeltaSpec {
  /** attribute -> points to award. */
  points: Record<string, number>;
  /** attribute -> lifetime cap for this module (spec: "applied once, capped"). */
  caps: Record<string, number>;
}

export interface LessonDeltaResult {
  attributes: AttributeVector;
  /** What was actually credited after caps (ledger-worthy). */
  applied: AttributeDelta;
}

/**
 * Applies a lesson's declared prqDelta once, honouring per-attribute caps
 * against the amount already applied for the same module. Education lane
 * calls this from its /api/education/complete transaction.
 */
export function applyLessonDelta(
  attributes: AttributeVector,
  spec: LessonDeltaSpec,
  alreadyApplied: Record<string, number>,
): LessonDeltaResult {
  const applied: AttributeDelta = {};
  const next: AttributeVector = { ...attributes };

  for (const [attr, points] of Object.entries(spec.points)) {
    if (!Number.isFinite(points) || points <= 0) continue;
    const cap = spec.caps[attr] ?? points;
    const used = Math.max(0, alreadyApplied[attr] ?? 0);
    const room = Math.max(0, cap - used);
    const credit = round2(Math.min(points, room));
    if (credit <= 0) continue;

    applied[attr] = credit;
    next[attr] = round2(
      clamp((next[attr] ?? PRQ_BASELINE) + credit, ATTRIBUTE_MIN, ATTRIBUTE_MAX),
    );
  }
  return { attributes: next, applied };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sanitizeTallies(tallies: SessionTallies): SessionTallies {
  return {
    hits: nonNegativeInt(tallies.hits),
    misses: nonNegativeInt(tallies.misses),
    dodges: nonNegativeInt(tallies.dodges),
    combos: nonNegativeInt(tallies.combos),
  };
}

function nonNegativeInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
