// THE ATHLETE PROFILE — deterministic, versioned, human-diffable (2026-09-14). Spec §9.
//
// TWO RULES THAT LOOKED LIKE A CONTRADICTION AND ARE NOT.
//
// `lib/profile/sharedProfile.ts` refuses a FUTURE version outright — "a v2 field this build does not
// understand could change what the record means" — and it is right to. The character-creation spec says
// import must "never a hard fail" and must report violations rather than refusing the load, and it is also
// right. They are about different risks, and the resolution is to do both:
//
//   OLDER  → migrated forward, silently. That is what a migration layer is for.
//   CURRENT→ loaded.
//   NEWER  → loaded as much as is understood, every unknown key PRESERVED, and the profile flagged
//            `fromFuture`. Nothing is destroyed and the player is not locked out of their own build; the
//            app simply knows not to treat it as authoritative or to overwrite the original blindly.
//
// Refusing outright would lose a player's work. Loading silently would let a v2 meaning be reinterpreted as
// v1 and quietly corrupt it. Flagging is the only option that does neither.
//
// UNKNOWN KEYS ARE CARRIED, NOT DROPPED (§9). A round-trip through an older client must not amputate the
// fields it did not recognise, or syncing between two versions destroys data in one direction.
//
// DETERMINISM IS A SORTED SERIALISER, not a hope. Object key order in JavaScript is insertion order, so two
// equal profiles built by different code paths stringify differently and a byte-identical round-trip test
// passes or fails by accident. Every object is emitted with sorted keys.
//
// Pure: no Babylon, no DOM, no storage, no clock beyond what the caller passes in.

import type { PrqAxisId } from './types';

export const ATHLETE_PROFILE_VERSION = '1.0.0';

export interface AthleteProfile {
  schema_version: string;
  profile_id: string;
  created_at: string;
  updated_at: string;
  vitals: Record<string, unknown>;
  appearance: Record<string, unknown>;
  body: Record<string, unknown>;
  ink: Array<Record<string, unknown>>;
  gear: Record<string, unknown>;
  attributes: Record<string, number>;
  tendencies: Record<string, number>;
  hot_zones: Record<string, string>;
  mechanics: Record<string, unknown>;
  traits: Record<string, number>;
  budgets: Record<string, number>;
  /** The measured axes this build's ceilings were resolved against, when the athlete had any. */
  prq: Partial<Record<PrqAxisId, number>> | null;
  /** Keys from a NEWER schema this build does not understand. Carried through verbatim — see the header. */
  unknown?: Record<string, unknown>;
  checksum: string;
}

const KNOWN_KEYS = new Set([
  'schema_version', 'profile_id', 'created_at', 'updated_at', 'vitals', 'appearance', 'body', 'ink',
  'gear', 'attributes', 'tendencies', 'hot_zones', 'mechanics', 'traits', 'budgets', 'prq', 'unknown',
  'checksum',
]);

/** Stable stringify: every object's keys sorted, so equal profiles always produce equal bytes. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

/**
 * A content checksum over everything except the checksum itself.
 *
 * FNV-1a rather than a crypto hash on purpose: this file must run on the client and in a test with no
 * `node:crypto` import, the way `shareable.ts` had to. It detects corruption and accidental edits, which is
 * what a profile checksum is for; it is not a signature and nothing should treat it as one.
 */
export function checksumOf(p: Omit<AthleteProfile, 'checksum'>): string {
  const s = stableStringify(p);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function emptyAthleteProfile(id: string, now = new Date(0).toISOString()): AthleteProfile {
  const base: Omit<AthleteProfile, 'checksum'> = {
    schema_version: ATHLETE_PROFILE_VERSION, profile_id: id, created_at: now, updated_at: now,
    vitals: {}, appearance: {}, body: {}, ink: [], gear: {},
    attributes: {}, tendencies: {}, hot_zones: {}, mechanics: {}, traits: {}, budgets: {}, prq: null,
  };
  return { ...base, checksum: checksumOf(base) };
}

/** Serialise. Deterministic by construction — see the header. */
export function exportProfile(p: AthleteProfile): string {
  const { checksum: _drop, ...rest } = p;
  void _drop;
  return stableStringify({ ...rest, checksum: checksumOf(rest) });
}

export interface ImportResult {
  profile: AthleteProfile;
  /** The file came from a newer schema than this build understands. Loaded, flagged, never trusted. */
  fromFuture: boolean;
  /** The file was older and has been migrated forward. */
  migrated: boolean;
  /** The checksum did not match the content. The profile still loads — see the header. */
  checksumMismatch: boolean;
  notes: string[];
}

function major(v: string): number {
  const n = Number.parseInt(String(v).split('.')[0] ?? '', 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Import. Never throws, never refuses, never drops a key it did not recognise.
 *
 * A caller that wants to know whether to trust the file reads the flags; a caller that just wants the
 * player's build back gets it either way.
 */
export function importProfile(raw: string | unknown): ImportResult {
  const notes: string[] = [];
  let o: unknown = raw;
  if (typeof raw === 'string') {
    try { o = JSON.parse(raw); } catch { notes.push('Not valid JSON — started a new profile.'); return { profile: emptyAthleteProfile('recovered'), fromFuture: false, migrated: false, checksumMismatch: false, notes }; }
  }
  if (!o || typeof o !== 'object') {
    notes.push('Not a profile object — started a new profile.');
    return { profile: emptyAthleteProfile('recovered'), fromFuture: false, migrated: false, checksumMismatch: false, notes };
  }
  const r = o as Record<string, unknown>;
  const ver = typeof r.schema_version === 'string' ? r.schema_version : '0.0.0';
  const fromFuture = major(ver) > major(ATHLETE_PROFILE_VERSION);
  const migrated = major(ver) < major(ATHLETE_PROFILE_VERSION) || ver !== ATHLETE_PROFILE_VERSION;

  // carry everything this build does not know about, so a round-trip through an older client is lossless
  const unknown: Record<string, unknown> = { ...(r.unknown as Record<string, unknown> ?? {}) };
  for (const k of Object.keys(r)) if (!KNOWN_KEYS.has(k)) unknown[k] = r[k];

  const num = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (Number.isFinite(x as number)) out[k] = Math.round(x as number);
    return out;
  };
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {});

  const body: Omit<AthleteProfile, 'checksum'> = {
    schema_version: ATHLETE_PROFILE_VERSION,
    profile_id: typeof r.profile_id === 'string' ? r.profile_id : 'recovered',
    created_at: typeof r.created_at === 'string' ? r.created_at : new Date(0).toISOString(),
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : new Date(0).toISOString(),
    vitals: obj(r.vitals), appearance: obj(r.appearance), body: obj(r.body),
    ink: Array.isArray(r.ink) ? (r.ink as Array<Record<string, unknown>>).map((x) => ({ ...x })) : [],
    gear: obj(r.gear),
    attributes: num(r.attributes), tendencies: num(r.tendencies),
    hot_zones: Object.fromEntries(Object.entries(obj(r.hot_zones)).filter(([, v]) => typeof v === 'string')) as Record<string, string>,
    mechanics: obj(r.mechanics), traits: num(r.traits), budgets: num(r.budgets),
    prq: r.prq && typeof r.prq === 'object' ? (num(r.prq) as Partial<Record<PrqAxisId, number>>) : null,
    ...(Object.keys(unknown).length ? { unknown } : {}),
  };

  const want = checksumOf(body);
  const checksumMismatch = typeof r.checksum === 'string' && r.checksum.length > 0 && r.checksum !== want && !migrated && !fromFuture;
  if (fromFuture) notes.push(`This profile was made by a newer version (${ver}). It has been loaded and nothing was discarded, but it is not treated as authoritative.`);
  if (migrated && !fromFuture) notes.push(`Migrated from ${ver}.`);
  if (checksumMismatch) notes.push('The checksum does not match the contents — the file may have been edited by hand.');

  return { profile: { ...body, checksum: want }, fromFuture, migrated, checksumMismatch, notes };
}
