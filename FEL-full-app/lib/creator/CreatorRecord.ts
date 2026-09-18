// CreatorRecord — THE ONE CANONICAL RECORD, and the emit() every mode writes through (2026-09-13).
//
// Mission: Creator Cards. Its hard constraints, verbatim:
//   · "one canonical record. No mode may persist its own parallel profile"
//   · "Label all derived values as 'estimated engagement,' never as measurement. No clinical or diagnostic
//      phrasing"
//   · "No-op cleanly when no profile exists."
//
// WHY THIS IS NOT THE CARD WE ALREADY HAVE. lib/creator/card-service.ts is a SHAREABLE CARD: a slug, a
// rarity, a PRQ, a published flag — an artefact a player shows other people, backed by the database. This is
// the record UNDER it: what the player has actually been doing, written by the modes as they run, on the
// device. Different lifetime, different owner, different privacy posture. Conflating them is how a mode ends
// up writing to a published object.
//
// THE RULE THAT MATTERS. Every mode writes through emit() and nothing else keeps its own profile. That is
// not a style preference: a parallel profile is a second answer to "what does this person do here", and two
// answers means one of them is quietly wrong — and, worse, means a privacy decision made in one place does
// not hold in the other. So the record is one shape, in one module, with one writer.
//
// WHAT IT IS NOT ALLOWED TO SAY. Everything derived from this data is ESTIMATED ENGAGEMENT — a guess about
// what someone seems to enjoy, made from how they spent their time in a game. It is not a measurement, not
// an assessment, and never a diagnosis. The vocabulary is enforced below (ENGAGEMENT_BANDS / describe) and
// asserted in the tests, because the failure mode here is not a crash: it is a sentence that reads like a
// clinician wrote it about a child.
//
// Pure except for the storage adapter at the bottom, so the rules are testable without a browser.

/** A discipline the player can spend time in. Free-form by design — modes name themselves. */
export type DisciplineId = string;

export interface DisciplineRecord {
  /** Sessions started. */
  sessions: number;
  /** Seconds spent. Rounded on write; nothing here needs sub-second resolution. */
  seconds: number;
  /** Things finished rather than abandoned — a run completed, a song exported, a routine danced through. */
  completions: number;
  /** Things the player MADE here (a song, a chart, a deck, a card). */
  creations: number;
}

export const EMPTY_DISCIPLINE: DisciplineRecord = { sessions: 0, seconds: 0, completions: 0, creations: 0 };

export interface PlaceRecord {
  /**
   * How many times the player has checked in at this place.
   *
   * Courts' constraint, verbatim: the Creator Card stores "placeId and visit counts only. Never raw
   * coordinates, never per-session timestamps, never a movement trail." So this record is a COUNT and the
   * type has nowhere to put anything else — a shape that cannot hold a trail cannot leak one.
   */
  visits: number;
}

export interface CreatorRecord {
  /** Schema version, so a later shape can migrate rather than silently mis-reading an old one. */
  v: 1;
  disciplines: Record<DisciplineId, DisciplineRecord>;
  places: Record<string, PlaceRecord>;
  /**
   * Is this account flagged under 18?
   *
   * Courts, verbatim: "Accounts flagged under 18 have no public presence in this system at all." The flag
   * lives on the canonical record so every surface reads the same answer — a per-feature copy is exactly the
   * parallel-profile problem, and the thing it would be wrong about is a child's visibility.
   */
  minor: boolean;
}

export const EMPTY_RECORD: CreatorRecord = { v: 1, disciplines: {}, places: {}, minor: false };

// ── Events ─────────────────────────────────────────────────────────────────
/**
 * Everything a mode is allowed to say about a player.
 *
 * Deliberately small and deliberately coarse. A richer event stream would be more useful to us and worse for
 * the person it is about; if a future feature needs something not in this union, that is a conversation to
 * have on purpose rather than a field to add quietly.
 */
export type CreatorEvent =
  /** A mode started. */
  | { kind: 'session'; discipline: DisciplineId }
  /** Time spent in a mode. Seconds, accumulated. */
  | { kind: 'time'; discipline: DisciplineId; seconds: number }
  /** Something was finished rather than abandoned. */
  | { kind: 'completion'; discipline: DisciplineId }
  /** Something was made. */
  | { kind: 'creation'; discipline: DisciplineId }
  /** A foreground, explicit check-in at a place. A COUNT — see PlaceRecord. */
  | { kind: 'place'; placeId: string };

/** The longest single time contribution one event may make: 30 minutes. */
export const MAX_EVENT_SECONDS = 1800;

/**
 * Fold one event into the record. Pure — no storage, no clock, no I/O.
 *
 * Returns a NEW record; the caller decides whether to persist it. That split is what lets the whole rule set
 * be tested without a browser, and what stops a mode accidentally persisting from inside a render loop.
 */
export function apply(rec: CreatorRecord, e: CreatorEvent): CreatorRecord {
  const d = (id: DisciplineId): DisciplineRecord => rec.disciplines[id] ?? { ...EMPTY_DISCIPLINE };
  switch (e.kind) {
    case 'session':
      if (!e.discipline) return rec;
      return { ...rec, disciplines: { ...rec.disciplines, [e.discipline]: { ...d(e.discipline), sessions: d(e.discipline).sessions + 1 } } };
    case 'time': {
      if (!e.discipline) return rec;
      // clamped and floored: a NaN dt, a tab left open for a week, or a frame-time glitch must not be able to
      // write a number that makes the estimate nonsense
      const secs = Math.floor(Math.max(0, Math.min(MAX_EVENT_SECONDS, Number(e.seconds) || 0)));
      if (secs <= 0) return rec;
      return { ...rec, disciplines: { ...rec.disciplines, [e.discipline]: { ...d(e.discipline), seconds: d(e.discipline).seconds + secs } } };
    }
    case 'completion':
      if (!e.discipline) return rec;
      return { ...rec, disciplines: { ...rec.disciplines, [e.discipline]: { ...d(e.discipline), completions: d(e.discipline).completions + 1 } } };
    case 'creation':
      if (!e.discipline) return rec;
      return { ...rec, disciplines: { ...rec.disciplines, [e.discipline]: { ...d(e.discipline), creations: d(e.discipline).creations + 1 } } };
    case 'place': {
      if (!e.placeId) return rec;
      const p = rec.places[e.placeId] ?? { visits: 0 };
      return { ...rec, places: { ...rec.places, [e.placeId]: { visits: p.visits + 1 } } };
    }
    default:
      return rec;
  }
}

// ── Estimated engagement ───────────────────────────────────────────────────
/**
 * The ONLY vocabulary this system may use about a person.
 *
 * Every one of these is a statement about time spent in a game, phrased as the guess it is. None of them is
 * a claim about ability, attention, development or health. The tests assert the absence of clinical language
 * rather than the presence of nice language, because the risk is a word creeping in later.
 */
export const ENGAGEMENT_BANDS = ['none', 'trying it', 'coming back', 'a favourite'] as const;
export type EngagementBand = (typeof ENGAGEMENT_BANDS)[number];

/** Sessions at which a discipline reads as returned-to rather than tried. */
export const RETURNING_AT = 3;
/** Sessions at which it reads as a favourite. */
export const FAVOURITE_AT = 8;

export function bandFor(d: DisciplineRecord | undefined): EngagementBand {
  if (!d || d.sessions <= 0) return 'none';
  if (d.sessions >= FAVOURITE_AT) return 'a favourite';
  if (d.sessions >= RETURNING_AT) return 'coming back';
  return 'trying it';
}

export interface EngagementEstimate {
  discipline: DisciplineId;
  band: EngagementBand;
  /** Always the same words. A caller that renders this cannot invent a stronger claim. */
  label: string;
  sessions: number;
  minutes: number;
}

/** The fixed prefix. Every derived value in this system is labelled with it. */
export const ESTIMATE_PREFIX = 'Estimated engagement';

export function describe(discipline: DisciplineId, d: DisciplineRecord | undefined): EngagementEstimate {
  const band = bandFor(d);
  return {
    discipline,
    band,
    label: `${ESTIMATE_PREFIX}: ${band}`,
    sessions: d?.sessions ?? 0,
    minutes: Math.round((d?.seconds ?? 0) / 60),
  };
}

/**
 * What this player seems to enjoy, strongest first.
 *
 * "Seems to" is load-bearing. Ordered by sessions and then by time, both of which are things we actually
 * saw; nothing here is weighted by a notion of what is worth doing.
 */
export function estimates(rec: CreatorRecord): EngagementEstimate[] {
  return Object.entries(rec.disciplines)
    .map(([id, d]) => describe(id, d))
    .filter((e) => e.band !== 'none')
    .sort((a, b) => b.sessions - a.sessions || b.minutes - a.minutes);
}

/** Places the player has checked in at, most visited first. Ids and counts — there is nothing else to show. */
export function places(rec: CreatorRecord): { placeId: string; visits: number }[] {
  return Object.entries(rec.places)
    .map(([placeId, p]) => ({ placeId, visits: p.visits }))
    .sort((a, b) => b.visits - a.visits);
}

/**
 * May this record appear anywhere other people can see?
 *
 * One question, one answer, read by every public surface. Courts: "Accounts flagged under 18 have no public
 * presence in this system at all."
 */
export function hasPublicPresence(rec: CreatorRecord | null): boolean {
  return !!rec && !rec.minor;
}

// ── Storage ────────────────────────────────────────────────────────────────
export const CREATOR_RECORD_KEY = 'fel-creator-record';

function sane(v: unknown): CreatorRecord | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Partial<CreatorRecord>;
  if (r.v !== 1) return null;                      // an unknown version is not guessed at
  const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  const disciplines: Record<string, DisciplineRecord> = {};
  for (const [k, d] of Object.entries(r.disciplines ?? {})) {
    const dd = d as Partial<DisciplineRecord>;
    disciplines[k] = { sessions: n(dd.sessions), seconds: n(dd.seconds), completions: n(dd.completions), creations: n(dd.creations) };
  }
  const places: Record<string, PlaceRecord> = {};
  for (const [k, p] of Object.entries(r.places ?? {})) {
    // the shape is rebuilt field by field rather than spread, so a stored object carrying coordinates or a
    // timestamp from some future bug cannot survive a read
    places[k] = { visits: n((p as Partial<PlaceRecord>)?.visits) };
  }
  return { v: 1, disciplines, places, minor: r.minor === true };
}

/**
 * The record, or null when there is no profile.
 *
 * NULL, not an empty record — "No-op cleanly when no profile exists" needs callers to be able to tell the
 * difference between "nobody has used this" and "someone used it and did nothing".
 */
export function readRecord(): CreatorRecord | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(CREATOR_RECORD_KEY);
    if (!raw) return null;
    return sane(JSON.parse(raw));
  } catch { return null; }
}

export function writeRecord(rec: CreatorRecord): void {
  try { window.localStorage.setItem(CREATOR_RECORD_KEY, JSON.stringify(rec)); } catch { /* private mode: nothing is recorded, which is a fine outcome */ }
}

/** Delete everything. The user's own answer to all of this, and it has to be one call. */
export function forgetRecord(): void {
  try { window.localStorage.removeItem(CREATOR_RECORD_KEY); } catch { /* already gone */ }
}

/**
 * THE ONE WRITER. Every mode calls this and nothing else keeps a profile.
 *
 * No-ops cleanly when there is no profile AND the event is not one that should create one: a 'time' event
 * from a mode nobody opted into must not bring a record into existence. A 'session', a 'creation' or a
 * 'place' is an explicit act and may create it.
 */
export function emit(e: CreatorEvent): CreatorRecord | null {
  const existing = readRecord();
  const creates = e.kind === 'session' || e.kind === 'creation' || e.kind === 'place';
  if (!existing && !creates) return null;
  const next = apply(existing ?? { ...EMPTY_RECORD }, e);
  if (next === existing) return existing;          // nothing changed: no write, no churn
  writeRecord(next);
  return next;
}
