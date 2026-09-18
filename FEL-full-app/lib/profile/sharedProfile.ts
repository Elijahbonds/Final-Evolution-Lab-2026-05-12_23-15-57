// SHARED PROFILE — the portable record everything in the coaching layer keys off (2026-09-13).
//
// The Coaching & Creator Economy brief's build-order item #1, and the audit found it genuinely absent: zero
// references anywhere in the repo. Every other system in that brief reads it.
//
// IT IS A PROJECTION, NOT A STORE, and that is the owner's decision after the audit. The brief assumed "v1
// ships without a backend — persistence is local/exportable", but this app HAS a backend: Prisma with ~60
// models, next-auth, Stripe, and live PRQ routes. Building a local-first profile alongside `PrqEntry`,
// `CreatorCard`, `LessonProgress` and `Credential` would create a SECOND source of truth for the same
// athlete — the exact parallel-profile failure the Creator Card spec already forbids ("one canonical record.
// No mode may persist its own parallel profile").
//
// So: the database is the truth, and this is the portable SHAPE of it. Assembling it is a read; exporting it
// is serialisation; importing it is a migration into the same tables. Nothing here is a place data lives.
//
// THE ACCEPTANCE CRITERION IS ROUND-TRIP FIDELITY: "SharedProfile must serialize to JSON and back with no
// loss." That is what the tests are mostly about, and it is stricter than it sounds — dates, floats, empty
// collections, unicode display names and absent optional fields all have to survive, and a profile written
// by a later version has to be readable rather than fatal.
//
// NO CLINICAL LANGUAGE, enforced by test as everywhere else in this layer. A profile describes performance
// and movement, never health.
//
// Pure: no Prisma import, no DOM. The database adapter lives in sharedProfile.server.ts, so this file can be
// tested — and reasoned about — without a connection.

export const SHARED_PROFILE_VERSION = 1;

/** Everything is sharded by this. The brief's first acceptance criterion. */
export type ClientId = string;

// ── the records ──────────────────────────────────────────────────────────────────────────────────────────

/** One timestamped System Scan measurement. Mirrors `PrqEntry` without binding to it. */
export interface ScanRecord {
  attribute: string;
  value: number;
  unit: string;
  /** manual | device | drillResult — how it was captured, which decides how much it is trusted. */
  source: string;
  /** ISO 8601. Stored as a string on purpose: a Date does not survive JSON.parse. */
  measuredAt: string;
  sessionId?: string;
}

/** A 0–100 composite with its per-axis parts, and the scan it came from. */
export interface PRQSnapshot {
  composite: number;
  axes: Record<string, number>;
  at: string;
  /** Which scan produced it, when one did. A snapshot with no source is a baseline. */
  sourceScanAt?: string;
}

/** A module completion or a passed credential. */
export interface AcademyProgress {
  trackKey: string;
  moduleKey: string;
  completedAt: string;
  /** Present only where the module was assessed. */
  score?: number;
  passed?: boolean;
  curriculumVersion?: string;
}

/** What a player has actually done, for a coach reading history rather than a dashboard reading today. */
export interface PerformanceEntry {
  modeId: string;
  score: number;
  at: string;
  outcome?: string;
}

/** The identity surface. A read over progression — never a second place credentials live. */
export interface CreatorCardRef {
  slug: string;
  displayName: string;
  mode: string;
  rarity: string;
  prq: number;
}

/**
 * How this athlete moves — the durable pattern, distinct from any one scan.
 *
 * Sourced from the Mirror's zone findings. Values are 0..1 persistence, NOT a measurement of a body: this
 * says "this pattern showed up in 5 of the last 7 sessions", which is a count of observations.
 */
export interface MovementSignature {
  zones: Record<string, number>;
  /** How many sessions the signature was built from. Zero means there is no signature yet. */
  sessions: number;
  updatedAt?: string;
}

export interface SharedProfile {
  v: number;
  clientId: ClientId;
  displayName: string;
  /** Newest first. */
  scans: ScanRecord[];
  prq: PRQSnapshot[];
  academy: AcademyProgress[];
  history: PerformanceEntry[];
  signature: MovementSignature;
  cards: CreatorCardRef[];
  /** When the projection was assembled. Not when anything happened. */
  assembledAt: string;
}

export function emptyProfile(clientId: ClientId, displayName = ''): SharedProfile {
  return {
    v: SHARED_PROFILE_VERSION,
    clientId,
    displayName,
    scans: [],
    prq: [],
    academy: [],
    history: [],
    signature: { zones: {}, sessions: 0 },
    cards: [],
    assembledAt: new Date(0).toISOString(),
  };
}

// ── serialisation ────────────────────────────────────────────────────────────────────────────────────────

export function serialize(p: SharedProfile): string {
  return JSON.stringify(p);
}

/**
 * Read a profile back.
 *
 * Defensive in the same way the dunk card is, and for the same reason: this crosses a version boundary and
 * an export made six months ago has to open. A FUTURE version is refused rather than half-read — a v2 field
 * this build does not understand could carry meaning that silently changes what the profile says.
 */
export function deserialize(raw: string | unknown): SharedProfile | null {
  let o: unknown;
  if (typeof raw === 'string') {
    try { o = JSON.parse(raw); } catch { return null; }
  } else o = raw;
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (typeof r.v !== 'number' || r.v > SHARED_PROFILE_VERSION) return null;
  if (typeof r.clientId !== 'string' || !r.clientId) return null;

  const sig = (r.signature ?? {}) as Record<string, unknown>;
  return {
    v: SHARED_PROFILE_VERSION,
    clientId: r.clientId,
    displayName: str(r.displayName),
    scans: arr(r.scans).map(scanOf).filter(Boolean) as ScanRecord[],
    prq: arr(r.prq).map(snapOf).filter(Boolean) as PRQSnapshot[],
    academy: arr(r.academy).map(academyOf).filter(Boolean) as AcademyProgress[],
    history: arr(r.history).map(histOf).filter(Boolean) as PerformanceEntry[],
    signature: {
      zones: numMap(sig.zones),
      sessions: num(sig.sessions),
      ...(typeof sig.updatedAt === 'string' ? { updatedAt: sig.updatedAt } : {}),
    },
    cards: arr(r.cards).map(cardOf).filter(Boolean) as CreatorCardRef[],
    assembledAt: str(r.assembledAt) || new Date(0).toISOString(),
  };
}

/** Round-trip in one call, for the test and for anything that wants a deep clone. */
export function roundTrip(p: SharedProfile): SharedProfile | null {
  return deserialize(serialize(p));
}

// ── the small, boring, load-bearing coercions ────────────────────────────────────────────────────────────

function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }
function str(v: unknown): string { return typeof v === 'string' ? v : ''; }
function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function numMap(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = num(val);
  return out;
}

function scanOf(v: unknown): ScanRecord | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  if (!str(s.attribute)) return null;
  return {
    attribute: str(s.attribute), value: num(s.value), unit: str(s.unit),
    source: str(s.source), measuredAt: str(s.measuredAt),
    ...(typeof s.sessionId === 'string' ? { sessionId: s.sessionId } : {}),
  };
}

function snapOf(v: unknown): PRQSnapshot | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Record<string, unknown>;
  return {
    composite: num(s.composite), axes: numMap(s.axes), at: str(s.at),
    ...(typeof s.sourceScanAt === 'string' ? { sourceScanAt: s.sourceScanAt } : {}),
  };
}

function academyOf(v: unknown): AcademyProgress | null {
  if (!v || typeof v !== 'object') return null;
  const a = v as Record<string, unknown>;
  if (!str(a.moduleKey)) return null;
  return {
    trackKey: str(a.trackKey), moduleKey: str(a.moduleKey), completedAt: str(a.completedAt),
    ...(a.score === undefined ? {} : { score: num(a.score) }),
    ...(a.passed === undefined ? {} : { passed: a.passed === true }),
    ...(typeof a.curriculumVersion === 'string' ? { curriculumVersion: a.curriculumVersion } : {}),
  };
}

function histOf(v: unknown): PerformanceEntry | null {
  if (!v || typeof v !== 'object') return null;
  const h = v as Record<string, unknown>;
  if (!str(h.modeId)) return null;
  return {
    modeId: str(h.modeId), score: num(h.score), at: str(h.at),
    ...(typeof h.outcome === 'string' ? { outcome: h.outcome } : {}),
  };
}

function cardOf(v: unknown): CreatorCardRef | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  if (!str(c.slug)) return null;
  return {
    slug: str(c.slug), displayName: str(c.displayName), mode: str(c.mode),
    rarity: str(c.rarity), prq: num(c.prq),
  };
}

// ── reading a profile ────────────────────────────────────────────────────────────────────────────────────

/** The newest PRQ snapshot, or null when the athlete has never been scanned. */
export function currentPRQ(p: SharedProfile): PRQSnapshot | null {
  return p.prq.length ? p.prq.reduce((a, b) => (b.at > a.at ? b : a)) : null;
}

/** The composite, or null. Never a default 50 — "unscanned" and "average" are different states. */
export function currentComposite(p: SharedProfile): number | null {
  return currentPRQ(p)?.composite ?? null;
}

/** Modules completed on a track. */
export function completedModules(p: SharedProfile, trackKey: string): string[] {
  return p.academy.filter((a) => a.trackKey === trackKey).map((a) => a.moduleKey);
}

/** Credentials earned — a passed module is a credential, an attempted one is not. */
export function credentials(p: SharedProfile): AcademyProgress[] {
  return p.academy.filter((a) => a.passed === true);
}

/**
 * Change in the composite over a window, or null when there is not enough history.
 *
 * Null rather than zero, because "no change" and "we cannot tell" are different answers and a coach acts
 * differently on each.
 */
export function prqTrend(p: SharedProfile, sinceIso: string): number | null {
  const inWindow = p.prq.filter((s) => s.at >= sinceIso).sort((a, b) => a.at.localeCompare(b.at));
  if (inWindow.length < 2) return null;
  return inWindow[inWindow.length - 1].composite - inWindow[0].composite;
}
