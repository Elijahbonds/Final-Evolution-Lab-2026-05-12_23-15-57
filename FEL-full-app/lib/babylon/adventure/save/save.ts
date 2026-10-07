/**
 * The Adventure save (ADVENTURE PLAN, "Data and saves", A3, 2026-10-06): one versioned document, sanitised on every
 * read, size-capped, migrated one version at a time. The Creator doc's pattern (lib/creator/look/*).
 *
 *   readAdventureSave(raw)   unknown JSON (or a string) → { ok: true, save } or { ok: false, reason }
 *   sanitizeAdventureSave    field by field: clamps, drops junk, re-derives what must agree (level from XP, a
 *                            creature's ride / fly stages from its species), dedupes and caps every list
 *   migrateAdventureSave     an older version, one step at a time; a newer version is refused (never downgraded)
 *   adventureSaveBytes       the UTF-8 size the cap is measured in
 *
 * WHAT IS REFUSED, not repaired: a document that is not an object, a version with no path to the current one, a
 * document over ADVENTURE_SAVE_MAX_BYTES, and one that fails the contract's shape gate after migration. Repairing a
 * corrupt save by guessing would hand the player someone else's idea of their progress; the caller keeps a fresh save
 * and the raw text (deviceStore keeps a backup).
 *
 * Pure: no storage, no clock (the caller passes `now`).
 */
import { PRQ_ATTRS, type PrqAttr } from '@/lib/prq';
import { sanitizeStampText } from '@/lib/creator/look/sanitize';
import {
  ADVENTURE_SAVE_MAX_BYTES, ADVENTURE_SAVE_VERSION, ELEMENTS, PARTNER_KINDS, SPELL_SLOTS, emptyAdventureSave,
  isAdventureSave, type AdventureSave, type Element, type PartnerDef,
} from '../contracts';
import { TRAINING_POINTS_MAX, sanitizeSchool } from '../stats/derive';
import { adventureLevelFor, clampAdventureXp } from '../stats/level';
import { ADVENTURE_SPECIES_TABLE } from '../partner/species';

// ── Caps [TUNE] ──────────────────────────────────────────────────────────────────────────────────────────────────

export const SAVE_ID_MAX = 64;
export const SAVE_TEXT_MAX = 256;
export const SAVE_SPELLS_MAX = 64;
export const SAVE_FLAGS_MAX = 256;
export const SAVE_LIST_MAX = 128;
export const SAVE_MOVES_MAX = 16;
export const BR_PLACE_MAX = 16;
export const PARTNER_NAME_FALLBACK = 'PARTNER';

export type SaveRefusal = 'junk' | 'version' | 'oversize' | 'shape';
export type SaveRead = { ok: true; save: AdventureSave; migrated: boolean } | { ok: false; reason: SaveRefusal };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, fb: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
const int = (v: unknown, lo: number, hi: number, fb: number): number => Math.max(lo, Math.min(hi, Math.floor(num(v, fb))));
const bool = (v: unknown): boolean => v === true;

/** An id: a short string of letters, digits and `_ . : -`. Anything else is dropped. */
export function sanitizeSaveId(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= SAVE_ID_MAX && /^[A-Za-z0-9_.:-]+$/.test(v) ? v : null;
}

function idList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const id = sanitizeSaveId(x);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

const isElement = (v: unknown): v is Element => (ELEMENTS as readonly unknown[]).includes(v);

/** The 8 PRQ-shaped attributes, each 0..100 (a missing one is 50). */
function attrRecord(v: unknown): Record<PrqAttr, number> {
  const out = {} as Record<PrqAttr, number>;
  for (const k of PRQ_ATTRS) out[k] = Math.max(0, Math.min(100, num(isObj(v) ? v[k] : undefined, 50)));
  return out;
}

function trainingRecord(v: unknown): Partial<Record<PrqAttr, number>> {
  const out: Partial<Record<PrqAttr, number>> = {};
  if (!isObj(v)) return out;
  for (const k of PRQ_ATTRS) {
    const n = num(v[k], 0);
    if (n > 0) out[k] = Math.min(TRAINING_POINTS_MAX, n);
  }
  return out;
}

/** A partner as stored, or null when it is not one (an unknown species, a missing slot id, a bad element). */
export function sanitizePartnerDef(v: unknown): PartnerDef | null {
  if (!isObj(v)) return null;
  const id = sanitizeSaveId(v.id);
  const kind = (PARTNER_KINDS as readonly unknown[]).includes(v.kind) ? (v.kind as PartnerDef['kind']) : null;
  if (!id || !kind || !isElement(v.element)) return null;
  const name = sanitizeStampText(v.name) || PARTNER_NAME_FALLBACK;
  const out: PartnerDef = {
    id, kind, name, element: v.element, attrs: attrRecord(v.attrs),
    bond: Math.max(0, Math.min(100, num(v.bond, 0))),
    moves: idList(v.moves, SAVE_MOVES_MAX),
  };
  if (kind === 'creature') {
    const c = v.creature;
    if (!isObj(c)) return null;
    const speciesId = sanitizeSaveId(c.speciesId);
    const sp = speciesId ? ADVENTURE_SPECIES_TABLE[speciesId] : undefined;
    if (!speciesId || !sp) return null;
    // ride / fly stages come from the species table, never from the document: a save cannot grant itself a flyer
    const creature: PartnerDef['creature'] & { xp?: number } = {
      speciesId, stage: int(c.stage, 0, sp.stages - 1, 0), rideableAtStage: sp.rideableAtStage, flyableAtStage: sp.flyableAtStage,
    };
    const xp = num(c.xp, 0);
    if (xp > 0) creature.xp = Math.min(1e6, xp);
    out.creature = creature;
  } else {
    const ch = v.character;
    const slot = isObj(ch) ? sanitizeSaveId(ch.creatorSlotId) : null;
    if (!slot) return null;
    out.character = { creatorSlotId: slot };
  }
  return out;
}

function flagRecord(v: unknown): Record<string, boolean | number | string> {
  const out: Record<string, boolean | number | string> = {};
  if (!isObj(v)) return out;
  let n = 0;
  for (const [k, val] of Object.entries(v)) {
    if (n >= SAVE_FLAGS_MAX) break;
    if (!sanitizeSaveId(k)) continue;
    if (typeof val === 'boolean' || (typeof val === 'number' && Number.isFinite(val))) out[k] = val;
    else if (typeof val === 'string' && val.length <= SAVE_TEXT_MAX) out[k] = val;
    else continue;
    n++;
  }
  return out;
}

/**
 * Field by field, from any object that passed the version gate. Unknown fields are dropped; every known one is
 * clamped or defaulted. `now` fills a missing `updatedAt`.
 */
export function sanitizeAdventureSave(doc: Obj, now: number): AdventureSave {
  const base = emptyAdventureSave(num(doc.updatedAt, now));
  const p = isObj(doc.player) ? doc.player : {};
  const xp = clampAdventureXp(num(p.xp, 0));
  const spells = isObj(p.spells) ? p.spells : {};
  const known = idList(spells.known, SAVE_SPELLS_MAX);
  const eqRaw = Array.isArray(spells.equipped) ? spells.equipped : [];
  const equipped: (string | null)[] = [];
  for (let i = 0; i < SPELL_SLOTS; i++) {
    const id = sanitizeSaveId(eqRaw[i]);
    // only a known spell, and each at most once
    equipped.push(id && known.includes(id) && !equipped.includes(id) ? id : null);
  }
  const s = isObj(doc.story) ? doc.story : {};
  const cp = isObj(s.checkpoint) ? s.checkpoint : null;
  const cpWorld = cp ? sanitizeSaveId(cp.worldId) : null, cpSpawn = cp ? sanitizeSaveId(cp.spawnId) : null;
  const b = isObj(doc.br) ? doc.br : {};
  const matches = int(b.matches, 0, 1e6, 0);
  const st = isObj(doc.settings) ? doc.settings : {};
  const place = b.bestPlace === null || b.bestPlace === undefined ? null : int(b.bestPlace, 1, BR_PLACE_MAX, BR_PLACE_MAX);
  return {
    version: ADVENTURE_SAVE_VERSION,
    updatedAt: Math.max(0, base.updatedAt),
    player: {
      level: adventureLevelFor(xp).level,   // level always agrees with XP
      xp,
      school: sanitizeSchool(p.school),
      spells: { known, equipped },
      training: trainingRecord(p.training),
    },
    partner: sanitizePartnerDef(doc.partner),
    story: {
      chapterId: sanitizeSaveId(s.chapterId),
      beatId: sanitizeSaveId(s.beatId),
      flags: flagRecord(s.flags),
      worldsVisited: idList(s.worldsVisited, SAVE_LIST_MAX),
      clearedBosses: idList(s.clearedBosses, SAVE_LIST_MAX),
      checkpoint: cpWorld && cpSpawn ? { worldId: cpWorld, spawnId: cpSpawn } : null,
    },
    br: { matches, wins: int(b.wins, 0, matches, 0), bestPlace: matches > 0 ? place : null },
    settings: { mirror: bool(st.mirror), invertFlightY: bool(st.invertFlightY) },
  };
}

// ── Versions ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** One step: a document at version `from` → the same document at `from + 1`. */
export type SaveMigration = (doc: Obj) => Obj;

/**
 * The shipped steps, keyed by the version they upgrade FROM. Version 1 is the first that ever shipped, so this is empty
 * today; the first contract bump adds `1: (doc) => …` here and a test with a real v1 document (contracts.ts rule).
 */
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = Object.freeze({});

/** Walk a document up to ADVENTURE_SAVE_VERSION. Null when it is newer than this build, or a step is missing. */
export function migrateAdventureSave(
  doc: Obj, steps: Readonly<Record<number, SaveMigration>> = SAVE_MIGRATIONS,
): { doc: Obj; migrated: boolean } | null {
  const v0 = doc.version;
  if (typeof v0 !== 'number' || !Number.isInteger(v0) || v0 < 0) return null;
  let v: number = v0;
  if (v > ADVENTURE_SAVE_VERSION) return null;   // a newer build's save: never downgrade it
  let cur = doc;
  let migrated = false;
  while (v < ADVENTURE_SAVE_VERSION) {
    const step = steps[v];
    if (!step) return null;
    cur = step(cur);
    if (!isObj(cur) || cur.version !== v + 1) return null;
    v = v + 1;
    migrated = true;
  }
  return { doc: cur, migrated };
}

// ── Size ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The document's size as stored: UTF-8 bytes of its JSON. */
export function adventureSaveBytes(save: unknown): number {
  const json = typeof save === 'string' ? save : JSON.stringify(save);
  if (typeof json !== 'string') return Infinity;
  let bytes = 0;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

/** True when a document fits the cap. */
export const fitsAdventureSaveCap = (save: unknown): boolean => adventureSaveBytes(save) <= ADVENTURE_SAVE_MAX_BYTES;

// ── The one reader ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Read a stored save: JSON text or an already-parsed value. Refuses junk, an unknown version, an oversize document and
 * one that fails the shape gate; everything else comes back sanitised (and migrated when it was older).
 */
export function readAdventureSave(raw: unknown, now: number, steps?: Readonly<Record<number, SaveMigration>>): SaveRead {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    if (adventureSaveBytes(raw) > ADVENTURE_SAVE_MAX_BYTES) return { ok: false, reason: 'oversize' };
    try { value = JSON.parse(raw); } catch { return { ok: false, reason: 'junk' }; }
  } else if (!fitsAdventureSaveCap(raw)) {
    return isObj(raw) ? { ok: false, reason: 'oversize' } : { ok: false, reason: 'junk' };
  }
  if (!isObj(value)) return { ok: false, reason: 'junk' };
  const m = migrateAdventureSave(value, steps);
  if (!m) return { ok: false, reason: 'version' };
  if (!isAdventureSave(m.doc)) return { ok: false, reason: 'shape' };
  const save = sanitizeAdventureSave(m.doc, now);
  if (!fitsAdventureSaveCap(save)) return { ok: false, reason: 'oversize' };
  return { ok: true, save, migrated: m.migrated };
}

/**
 * Prepare a save for writing: sanitised, stamped `now`, and refused (null) when it does not fit the cap. The writer's
 * gate (deviceStore, and a server route later) calls this and stores nothing on null.
 */
export function prepareAdventureSave(save: AdventureSave, now: number): AdventureSave | null {
  if (!isAdventureSave(save)) return null;
  const clean = sanitizeAdventureSave({ ...(save as unknown as Obj), updatedAt: now }, now);
  return fitsAdventureSaveCap(clean) ? clean : null;
}

/** The systems' progress folded into a save (a copy): the player's level, XP, school and training, and the partner. */
export function withProgress(
  save: AdventureSave,
  o: { player?: { xp: number; training: Partial<Record<PrqAttr, number>> } | null; partner?: PartnerDef | null },
): AdventureSave {
  const next: AdventureSave = JSON.parse(JSON.stringify(save));
  if (o.player) {
    next.player.xp = clampAdventureXp(o.player.xp);
    next.player.level = adventureLevelFor(next.player.xp).level;
    next.player.training = { ...o.player.training };
  }
  if (o.partner !== undefined) next.partner = o.partner ? JSON.parse(JSON.stringify(o.partner)) : null;
  return next;
}
