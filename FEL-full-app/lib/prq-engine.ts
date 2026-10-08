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
// PRQ recovery: earned by recovery work, and it falls (MIRROR-COACH P9, 2026-09-30)
// ---------------------------------------------------------------------------
//
// WHAT WAS WRONG (crossref audit item 8, "Recovery is inverted"; owner decision #12). PlayerProfile.recovery is one of
// the eight numbers lib/prq.ts prqScore averages into every player's PRQ, and it was moved by exactly two things:
//   · POST /api/sessions adds a play's delta to each attribute in lib/prq.ts MODE_ATTRS[mode]. Three rows named
//     recovery: brainBrawl (trivia), whoSceneIt (trivia) and training (the Iron Paradise gym game). lib/prq.ts
//     computePrqDelta never returns a negative number, so recovery could only rise, and a quiz raised it. All three
//     rows now train other attributes only (P9 took trivia's; the P9 code review took the gym game's — a won round was
//     0.6 recovery with no daily cap, so a game out-earned a day of real recovery work). No game raises recovery.
//   · lib/profile-service.ts getOrCreateProfile's inactivity decay: −0.5 on every attribute per idle day, toward 0, and
//     only once a player stops playing altogether. A player in every day never lost a point.
// Nothing a person does to recover (a cool-down, an easy day, an easy walk) touched it. (The crossref's critic noted the
// engine's own applyInactivityDecay above has no production caller; the live decay is profile-service's.)
//
// THE RULE NOW.
//   RISE: recovery work, as the coached log records it (the filters are lib/coach/recoverySources.ts):
//     · a completed cool-down (Today's automatic one, or a Cool-down section the coach wrote) → RECOVERY_CREDIT_COOLDOWN
//       (the automatic one only on a session with work logged in it — P9 code review: Done with nothing logged, then
//       the tap, was 0.6 for no work)
//     · a completed off day (a coached session of kind recovery with work logged)             → RECOVERY_CREDIT_OFF_DAY
//     ONE PRESCRIBED SESSION, ONE CREDIT (P9 code review): the same prescribed session completed again the same UTC day
//     credits nothing more (cool-downs, easy cardio), and the same off day at most once a UTC week — Done can be sent
//     for one session over and over (lib/coach/todayServer.ts opens a new row each time), so without this one off day
//     completed twice a day filled the cap. lib/prq-recovery.ts recoveryEventsFromRows does it.
//     · easy-cardio minutes (a timed locomotion item at the Idle or Cruise band), on a saturating curve per day:
//       EASY_CARDIO_MAX_CREDIT × (1 − 2^(−minutes / EASY_CARDIO_HALF_MINUTES)): 10 min 0.40, 20 min 0.60, 30 min 0.70,
//       never past 0.80. A day's minutes are summed before the curve, so two 10-minute walks are one 20-minute day
//       (0.60), not two fresh first-ten-minutes (0.80).
//     All of it together is capped at RECOVERY_DAILY_CAP per UTC day and credited in time order (the day's first work is
//     paid first). UTC days (assumption): the server has no time zone for the player, and a UTC day is the same for
//     everyone and cannot be moved by a device clock.
//   FALL: with no recovery work, the part ABOVE baseline (PRQ_BASELINE, 50) halves every RECOVERY_HALF_LIFE_DAYS,
//     continuously: B + (v − B) × 2^(−days / H). A value at or below baseline does not move by itself: the number falls
//     when recovery work stops and never rises without it (assumption: "decays toward baseline" is read as a fall to 50
//     from above, not a free climb to 50 from below; an owner question in the P9 report). SAID PLAINLY (P9 code review):
//     a value at or under 50 is FROZEN without recovery work — it no longer takes profile-service's old −0.5 per idle
//     day toward 0 either, so for roughly a third of dice-seeded profiles (seeded 40–70) "it can fall" does not hold
//     until they first earn their way above 50. The owner's call; the alternative is in the P9 fix report.
//   WHERE IT SETTLES (steady state, B + daily credit / daily fall): daily recovery work at the cap holds it near
//     B + CAP / (1 − 2^(−1/H)) ≈ 91; three coached sessions with cool-downs plus one off day a week hold it near 60;
//     no recovery work at all brings it back to 50.
//
// SELF-REPORTS NEVER COUNT (#12). A readiness check-in, a pain check-in, the health intake and the breath log are not
// inputs here and cannot become one: a RecoveryEvent is a source from a closed list, a time and (easy cardio only)
// minutes, and anything else on an event is ignored. lib/prq-engine-recovery.test.ts holds the engine to it and
// lib/prq-recovery-self-reports.test.ts the source tree.
//
// MIGRATION: NO HISTORY IS REWRITTEN. There is no backfill. A stored value, trivia-raised or not, is settled forward from
// its row's last write (PlayerProfile.updatedAt — lib/prq-recovery.ts), and never from before RECOVERY_RULE_SINCE_MS.
// P9 code review, corrected: that constant is the PHASE date (2026-09-30), not the deploy date, which is the owner's merge
// and not known here. So on the first settle after a later deploy, the half-life is charged from 2026-09-30 (a
// trivia-raised value comes down for the days between the phase and the deploy too), and recovery work logged in those
// days is credited. Both are small and both point the honest way (the inflation came from trivia; the work was real),
// but "nothing before the rule was live" is only true if RECOVERY_RULE_SINCE_MS is moved to the deploy date at landing —
// a one-line change the tests follow (they derive from the constant). A value at or under 50 stays exactly where it is
// until recovery work raises it.
//
// Pure, like the rest of this file: callers pass every time (ms) and every event; nothing here reads a clock or a
// database.

/**
 * Recovery above baseline halves over this many days without recovery work. FEL's choice, and a conservative one (slow):
 * two weeks without a cool-down, an off day or an easy walk costs half the earned margin, not all of it.
 */
export const RECOVERY_HALF_LIFE_DAYS = 14;
/** The most recovery work can add in one UTC day, all sources together. */
export const RECOVERY_DAILY_CAP = 2;
/** A completed cool-down. */
export const RECOVERY_CREDIT_COOLDOWN = 0.6;
/** A completed off day. (Its walk's minutes also count as easy cardio.) */
export const RECOVERY_CREDIT_OFF_DAY = 1;
/** Easy cardio's ceiling for one day. */
export const EASY_CARDIO_MAX_CREDIT = 0.8;
/** The day's easy-cardio minutes that earn half of EASY_CARDIO_MAX_CREDIT. */
export const EASY_CARDIO_HALF_MINUTES = 10;
/** The most minutes one logged session can carry into the curve (a typed 600 is a long day, not a record). */
export const EASY_CARDIO_MAX_MINUTES_PER_EVENT = 240;
/**
 * The rule's start, 2026-09-30T00:00Z (this phase's date, NOT the deploy date — see MIGRATION above): no settle decays
 * across time before it. Set it to the merge/deploy date at landing to charge nothing before the rule was live.
 */
export const RECOVERY_RULE_SINCE_MS = Date.UTC(2026, 8, 30);
/**
 * Recovery is stored to this many decimals. Its fall is continuous, and at the 2 decimals every other attribute keeps, a
 * player seen every few minutes would have each step rounded away (0.003 per 3 minutes on a 30-point margin) and never
 * fall at all.
 */
export const RECOVERY_DECIMALS = 4;

export type RecoverySource = 'cooldown' | 'offDay' | 'easyCardio';
/** The closed list. Nothing outside it is a source. */
export const RECOVERY_SOURCES: readonly RecoverySource[] = ['cooldown', 'offDay', 'easyCardio'];

export interface RecoveryEvent {
  source: RecoverySource;
  /** When it became countable, ms since epoch (a cool-down: the later of the session's Done and the tap). */
  at: number;
  /** easyCardio only: the minutes logged. */
  minutes?: number;
  /** A stable tie-break for events in the same millisecond (the ClientSession id). */
  ref?: string;
}

export interface RecoveryCredit {
  event: RecoveryEvent;
  /** What the event is worth before the day's cap. */
  raw: number;
  /** What it was credited after the cap (0 once the day is full). */
  credit: number;
}

export interface RecoverySettle {
  /** The settled value, to RECOVERY_DECIMALS. */
  value: number;
  /** false = nothing to write. */
  changed: boolean;
  /** The events this settle credited (after the anchor, up to now), in the order they were applied. */
  credited: RecoveryCredit[];
  /** Points added by them. */
  gained: number;
  /** Points lost to the half-life over the settle. */
  decayed: number;
}

const RECOVERY_DAY_MS = 24 * 60 * 60 * 1000;
/** Same-millisecond order: an off day, then a cool-down, then minutes. */
const RECOVERY_SOURCE_ORDER: Record<RecoverySource, number> = { offDay: 0, cooldown: 1, easyCardio: 2 };

function roundRecovery(value: number): number {
  const f = 10 ** RECOVERY_DECIMALS;
  return Math.round(value * f) / f;
}

/** One-sided half-life decay toward PRQ_BASELINE: only a value above it falls; nothing ever rises by itself. */
export function decayRecovery(value: number, fromMs: number, toMs: number): number {
  if (!Number.isFinite(value)) return value;
  const days = (toMs - fromMs) / RECOVERY_DAY_MS;
  if (!(days > 0) || value <= PRQ_BASELINE) return value;
  return PRQ_BASELINE + (value - PRQ_BASELINE) * Math.pow(2, -days / RECOVERY_HALF_LIFE_DAYS);
}

/** A day's easy-cardio minutes → credit (before the daily cap): the saturating curve above. */
export function easyCardioCredit(minutes: number): number {
  const m = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  return EASY_CARDIO_MAX_CREDIT * (1 - Math.pow(2, -m / EASY_CARDIO_HALF_MINUTES));
}

/**
 * Where a settle starts: the stored value's last write, never before RECOVERY_RULE_SINCE_MS. null when there is no
 * usable time (then nothing is settled).
 */
export function recoveryAnchor(lastWrittenAt: number | Date | null | undefined): number | null {
  const ms = lastWrittenAt instanceof Date ? lastWrittenAt.getTime() : lastWrittenAt;
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  return Math.max(ms, RECOVERY_RULE_SINCE_MS);
}

/** The start of the UTC day `ms` falls in (a settle's event window opens there, for the day's cap). */
export function recoveryDayStart(ms: number): number {
  return Math.floor(ms / RECOVERY_DAY_MS) * RECOVERY_DAY_MS;
}

/** An event the engine will read: a source on the closed list at a finite time. Anything else is dropped. */
export function isRecoveryEvent(e: unknown): e is RecoveryEvent {
  const x = e as RecoveryEvent | null | undefined;
  return !!x && RECOVERY_SOURCES.includes(x.source) && typeof x.at === 'number' && Number.isFinite(x.at);
}

/**
 * Every event's credit, the per-UTC-day cap applied in time order. Only `source`, `at` and (easy cardio) `minutes` are
 * read: an event carrying anything else is worth exactly what it is worth without it.
 */
export function recoveryCredits(events: readonly RecoveryEvent[]): RecoveryCredit[] {
  const ordered = events.filter(isRecoveryEvent).sort((a, b) =>
    a.at - b.at || RECOVERY_SOURCE_ORDER[a.source] - RECOVERY_SOURCE_ORDER[b.source] || String(a.ref ?? '').localeCompare(String(b.ref ?? '')));
  const used = new Map<number, number>();
  const cardioMinutes = new Map<number, number>();
  return ordered.map((event) => {
    const day = Math.floor(event.at / RECOVERY_DAY_MS);
    let raw: number;
    if (event.source === 'easyCardio') {
      const before = cardioMinutes.get(day) ?? 0;
      const add = clamp(Number(event.minutes ?? 0), 0, EASY_CARDIO_MAX_MINUTES_PER_EVENT);
      cardioMinutes.set(day, before + add);
      raw = easyCardioCredit(before + add) - easyCardioCredit(before);
    } else {
      raw = event.source === 'offDay' ? RECOVERY_CREDIT_OFF_DAY : RECOVERY_CREDIT_COOLDOWN;
    }
    const u = used.get(day) ?? 0;
    const credit = Math.max(0, Math.min(RECOVERY_DAILY_CAP, u + raw) - u);
    used.set(day, u + credit);
    return { event, raw, credit };
  });
}

/**
 * Settles a stored recovery value from `anchorMs` (recoveryAnchor of its last write) to `nowMs`: decay to each event
 * after the anchor, add its capped credit, decay on to now. `events` should reach back to recoveryDayStart(anchorMs),
 * because work done earlier that day (credited by an earlier settle) still counts against the day's cap; events at or
 * before the anchor are never credited again, and events after `nowMs` wait for a later settle.
 */
export function settleRecovery(
  value: number,
  anchorMs: number,
  events: readonly RecoveryEvent[],
  nowMs: number,
): RecoverySettle {
  if (!Number.isFinite(value) || !Number.isFinite(anchorMs) || !Number.isFinite(nowMs) || nowMs <= anchorMs) {
    return { value, changed: false, credited: [], gained: 0, decayed: 0 };
  }
  const fresh = recoveryCredits(events.filter((e) => isRecoveryEvent(e) && e.at <= nowMs)).filter((c) => c.event.at > anchorMs);
  let v = clamp(value, ATTRIBUTE_MIN, ATTRIBUTE_MAX);
  let t = anchorMs;
  let gained = 0;
  let decayed = 0;
  for (const c of fresh) {
    const d = decayRecovery(v, t, c.event.at);
    decayed += v - d;
    const next = Math.min(ATTRIBUTE_MAX, d + c.credit);
    gained += next - d;
    v = next;
    t = c.event.at;
  }
  const end = decayRecovery(v, t, nowMs);
  decayed += v - end;
  const out = roundRecovery(end);
  return { value: out, changed: out !== value, credited: fresh, gained: roundRecovery(gained), decayed: roundRecovery(decayed) };
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
