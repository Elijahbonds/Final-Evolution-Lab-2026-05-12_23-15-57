// TRACK 2, THE AI BUILDER (docs/NEXUS-STUDIO.md §3): CELL builds a venue by saying WHAT to change in a small, closed edit
// vocabulary — never code, never files — and the Studio turns the edits into ONE command on the same undo stack a hand edit
// uses. "A night beach court with floodlights and a packed far stand" → set the mood, the sky and the ground; a row of
// floods; a stand at the far end → one "AI: …" step that Undo takes back whole.
//
// THE MODEL'S ANSWER IS UNTRUSTED, twice over: the server sanitises it before it answers (app/api/cell/venue) and the
// browser sanitises it again before it compiles a command (a proxy, an old server, a stub in a test). Sanitising here is
// the import path's own: every placed object goes through doc.ts `sanitizeObject` and every venue setting through
// `sanitizeVenue` (unknown kinds dropped, numbers clamped, strings capped, ids minted HERE — never taken from the model),
// and only catalog items can be placed (no gameplay prop: the catalog has no hoop, net or goal you could score on).
// Nothing in an answer is ever evaluated or executed: it is JSON read field by field from allow-lists.
//
// Pure: no fetch, no DOM, no Babylon. The prompt words live here too, so the server route stays a thin, testable shell.

import type { Command, Op } from './commands';
import { catalog, catalogItem, instantiate } from './catalog';
import {
  LIMITS, OBJECT_TYPES, clampNum, sanitizeObject, sanitizeVenue, wrapAngle,
  type StudioObject, type StudioObjectType, type StudioVenue, type V3, type VenueSettings,
} from './doc';
import { targetOf } from './targets';

// ── the vocabulary ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The venue settings an answer may change (never the base spec or the target mode: those are the game). */
export const AI_VENUE_KEYS = ['name', 'mood', 'sky', 'backdrop', 'paintedSky', 'ground', 'baseDressing', 'weather', 'intro', 'glossyFloor'] as const;
export type AiVenueKey = (typeof AI_VENUE_KEYS)[number];
/** Per-object fields an answer may set on a placed catalog item (the rest is the catalog's). */
export const AI_OBJECT_KEYS = ['color', 'tint', 'height', 'width', 'rows', 'gaps', 'posture', 'benches'] as const;
type AiObjectKey = (typeof AI_OBJECT_KEYS)[number];

export type AiEdit =
  | { op: 'venue'; set: Partial<Pick<VenueSettings, AiVenueKey>> }
  | { op: 'place'; item: string; at: V3; yaw: number; scale: number; name?: string; set: Partial<Record<AiObjectKey, unknown>> }
  | { op: 'clear'; type: StudioObjectType | 'all' };

export const AI_LIMITS = {
  /** edits in one answer */
  edits: 40,
  /** objects one answer may place (after rows are expanded) */
  placed: 80,
  /** one row's length */
  row: 16,
  prompt: 600,
  /** how far from the court centre an answer may place (metres) */
  reach: 80,
} as const;

// ── sanitise: an untrusted answer → edits ───────────────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
const isObj = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const own = (o: Json, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const num = (x: unknown, lo: number, hi: number, d: number) => clampNum(x, lo, hi, d);
const label = (x: unknown): string | undefined => {
  if (typeof x !== 'string') return undefined;
  const s = x.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIMITS.name);
  return s || undefined;
};
const xz = (x: unknown): [number, number] | null => {
  if (!Array.isArray(x) || x.length < 2) return null;
  return [num(x[0], -AI_LIMITS.reach, AI_LIMITS.reach, 0), num(x[x.length === 3 ? 2 : 1], -AI_LIMITS.reach, AI_LIMITS.reach, 0)];
};
const at3 = (x: unknown): V3 | null => {
  if (!Array.isArray(x) || x.length < 2) return null;
  const p = xz(x)!;
  return [p[0], x.length === 3 ? num(x[1], 0, 30, 0) : 0, p[1]];
};
/** Degrees in an answer (models write degrees); radians in the document. */
const yawOf = (x: unknown): number => wrapAngle((num(x, -3600, 3600, 0) * Math.PI) / 180);

/** A dummy venue the settings sanitiser can read (it needs a base to accept anything). */
const SANITISE_BASE = { base: { spec: 'tennis', target: 'tiebreak' }, objects: [] };

function venueSet(raw: unknown): AiEdit | null {
  if (!isObj(raw)) return null;
  const clean = sanitizeVenue({ ...SANITISE_BASE, ...Object.fromEntries(AI_VENUE_KEYS.map((k) => [k, own(raw, k)])) }, new Set());
  if (!clean) return null;
  const set: Partial<Pick<VenueSettings, AiVenueKey>> = {};
  for (const k of AI_VENUE_KEYS) {
    if (own(raw, k) === undefined) continue;
    const v = (clean as unknown as Record<string, unknown>)[k];
    // a value the sanitiser could not read falls back to its default; only keep a setting the answer actually made valid
    if (k === 'name') { const n = label(own(raw, 'name')); if (n) set.name = n; continue; }
    if (v === undefined) continue;
    if (k === 'paintedSky' || k === 'glossyFloor') { (set as Record<string, unknown>)[k] = own(raw, k) === true; continue; }
    if (typeof own(raw, k) === 'string' && v !== own(raw, k)) continue;   // an enum the sanitiser replaced with its default
    (set as Record<string, unknown>)[k] = v;
  }
  return Object.keys(set).length ? { op: 'venue', set } : null;
}

function objectSet(raw: unknown): Partial<Record<AiObjectKey, unknown>> {
  const out: Partial<Record<AiObjectKey, unknown>> = {};
  if (!isObj(raw)) return out;
  for (const k of AI_OBJECT_KEYS) {
    const v = own(raw, k);
    if (v === undefined || !(typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) continue;
    if ((k === 'color' || k === 'tint') && !(typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v))) continue;   // not a colour: the catalog's stays
    out[k] = v;
  }
  return out;
}

export interface SanitisedEdits { edits: AiEdit[]; dropped: number }

/**
 * An answer (the parsed JSON, or its text) → edits. Accepts `{ edits: [...] }` or a bare array. Anything that is not one
 * of the three ops, names an item the catalog does not have, or carries nothing usable is dropped and counted.
 */
export function sanitizeAiEdits(answer: unknown): SanitisedEdits {
  let raw = answer;
  if (typeof raw === 'string') raw = parseAnswer(raw);
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(own(raw, 'edits')) ? (own(raw, 'edits') as unknown[]) : [];
  const edits: AiEdit[] = [];
  let dropped = 0, placed = 0;
  for (const e of list) {
    if (edits.length >= AI_LIMITS.edits) { dropped++; continue; }
    if (!isObj(e)) { dropped++; continue; }
    const op = own(e, 'op');
    if (op === 'venue') { const v = venueSet(own(e, 'set')); if (v) edits.push(v); else dropped++; continue; }
    if (op === 'clear') {
      const t = own(e, 'type');
      const type = t === undefined || t === 'all' ? 'all' : (OBJECT_TYPES as readonly unknown[]).includes(t) ? (t as StudioObjectType) : null;
      if (type) edits.push({ op: 'clear', type }); else dropped++;
      continue;
    }
    if (op !== 'place' && op !== 'row') { dropped++; continue; }
    const item = typeof own(e, 'item') === 'string' ? catalogItem(own(e, 'item') as string) : null;
    if (!item) { dropped++; continue; }
    const yaw = yawOf(own(e, 'yaw')), scale = num(own(e, 'scale'), 0.25, 4, 1), name = label(own(e, 'name')), set = objectSet(own(e, 'set'));
    const points: V3[] = [];
    if (op === 'place') {
      const p = at3(own(e, 'at'));
      if (p) points.push(p);
    } else {
      const a = xz(own(e, 'from')), b = xz(own(e, 'to'));
      const n = Math.round(num(own(e, 'count'), 1, AI_LIMITS.row, 1));
      if (a && b) for (let i = 0; i < n; i++) { const k = n === 1 ? 0 : i / (n - 1); points.push([a[0] + (b[0] - a[0]) * k, 0, a[1] + (b[1] - a[1]) * k]); }
    }
    if (!points.length) { dropped++; continue; }
    for (const p of points) {
      if (placed >= AI_LIMITS.placed) { dropped++; break; }
      edits.push({ op: 'place', item: item.id, at: p, yaw, scale, ...(name ? { name } : {}), set: { ...set } });
      placed++;
    }
  }
  return { edits, dropped };
}

/** The model's text → JSON: the whole text, else the first fenced or braced block. Never anything but JSON.parse. */
export function parseAnswer(text: string): unknown {
  if (typeof text !== 'string' || text.length > 200_000) return null;
  const tries = [text, /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1], text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)];
  for (const t of tries) {
    if (!t) continue;
    try { return JSON.parse(t); } catch { /* next */ }
  }
  return null;
}

// ── compile: edits → one command ────────────────────────────────────────────────────────────────────────────────────

export interface Compiled { cmd: Command; placed: number; removed: number; settings: string[] }

/** The edits as one command on `v` (one undo step), or null when they change nothing. Ids are minted here. */
export function compileAiEdits(v: StudioVenue, edits: readonly AiEdit[], prompt: string): Compiled | null {
  const ops: Op[] = [];
  const seen = new Set(v.objects.map((o) => o.id));
  const removed = new Set<string>();
  let patch: Partial<VenueSettings> = {};
  let placed = 0;
  for (const e of edits) {
    if (e.op === 'venue') { patch = { ...patch, ...e.set }; continue; }
    if (e.op === 'clear') {
      for (const o of v.objects) if (!o.locked && !removed.has(o.id) && (e.type === 'all' || o.type === e.type)) { removed.add(o.id); ops.push({ op: 'removeObject', venueId: v.id, id: o.id }); }
      continue;
    }
    if (v.objects.length - removed.size + placed >= LIMITS.objects) break;
    const item = catalogItem(e.item);
    if (!item) continue;
    const base = instantiate(item, e.at, e.yaw) as unknown as Record<string, unknown>;
    // only the fields this object's kind has survive sanitizeObject (a stand's rows, a fixture's height, a prop's colour)
    for (const k of AI_OBJECT_KEYS) if (e.set[k] !== undefined) base[k] = e.set[k];
    base.t = { ...(base.t as object), s: e.scale };
    if (e.name) base.name = e.name;
    // the import path's sanitiser: clamps every number, drops a bad colour, re-mints an id the venue already has
    const o: StudioObject | null = sanitizeObject(base, seen);
    if (!o) continue;
    ops.push({ op: 'addObject', venueId: v.id, object: o });
    placed++;
  }
  const settings = Object.keys(patch);
  if (settings.length) ops.unshift({ op: 'patchVenue', venueId: v.id, patch });
  if (!ops.length) return null;
  const words = prompt.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 48);
  return { cmd: { label: `AI: ${words || 'venue'}${prompt.trim().length > 48 ? '…' : ''}`, ops }, placed, removed: removed.size, settings };
}

/** One line per edit, for the review list the creator reads before Apply. */
export function describeEdit(e: AiEdit): string {
  if (e.op === 'venue') return `Venue: ${Object.entries(e.set).map(([k, val]) => `${k} ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`).join(' · ')}`;
  if (e.op === 'clear') return e.type === 'all' ? 'Clear every unlocked object' : `Clear every unlocked ${e.type}`;
  const item = catalogItem(e.item);
  return `Place ${e.name ?? item?.label ?? e.item} at (${e.at[0].toFixed(1)}, ${e.at[2].toFixed(1)})`;
}

// ── the prompt (what the server sends) ──────────────────────────────────────────────────────────────────────────────

/** What the model is told about the venue: its settings and what stands where. No account, no character, no look. */
export function venueBrief(v: StudioVenue): Record<string, unknown> {
  const target = targetOf(v.base.target);
  return {
    name: v.name, plays: target?.label ?? v.base.target, mood: v.mood, backdrop: v.backdrop ?? null, weather: v.weather,
    intro: v.intro, glossyFloor: v.glossyFloor, ground: v.ground ?? null, sky: v.sky ?? null, baseDressing: v.baseDressing,
    objects: v.objects.slice(0, 60).map((o) => [o.type, o.name, Math.round(o.t.p[0]), Math.round(o.t.p[2])]),
    objectCount: v.objects.length,
  };
}

const ENUMS = 'mood: goldenHour|daylight|dojoWarm|nightGame|alpine|overcast|dusk|indoorArena; backdrop: beach|ocean|city|stadium|mountains|dojo|neon|links; '
  + 'weather: natural|clear|rain|storm|snow|wind|fog|dawn|day|dusk|night; intro: none|establish|walkIn; ground.kind: court|clay|hardcourt|sand|street|stage; baseDressing: keep|none';

/** The system words: the closed vocabulary, the frame, the catalog's ids. */
export function aiVenueSystem(): string {
  const ids = catalog().map((c) => c.id).join(', ');
  return [
    'You are CELL inside Nexus Studio. You dress a sports venue by answering with JSON ONLY: {"edits":[...]} — no prose, no code.',
    'Edits (nothing else is read):',
    ' {"op":"venue","set":{name?,mood?,sky?:{top,bottom,fog,sun:"#rrggbb",ambient?:0..2,fogDensity?:0..0.08},backdrop?,paintedSky?:bool,ground?:{color?,line?,kind?},weather?,intro?,glossyFloor?:bool,baseDressing?}}',
    ' {"op":"place","item":<catalog id>,"at":[x,z],"yaw":degrees,"scale":0.25..4,"name"?,"set"?:{color?,tint?,height?,width?,rows?,gaps?,posture?:"seated"|"standing",benches?}}',
    ' {"op":"row","item":<catalog id>,"from":[x,z],"to":[x,z],"count":1..16,"yaw":degrees,"set"?}',
    ' {"op":"clear","type"?:"fixture"|"crowdStand"|"kitProp"|"specProp"|"meshyProp"|"decal"|"all"}',
    `Values: ${ENUMS}. Colours are "#rrggbb".`,
    'Frame (metres): the court is centred at 0,0, about 11 wide (x) and 24 long (z). The play camera stands at z=+16 looking toward −z:',
    '"far" is −z (z −16 to −30), "near" is +z behind the player (keep z < 13 clear), "left" is −x, "right" is +x.',
    'yaw 0 faces +z (toward the camera); a far stand facing the court uses yaw 0, a left stand yaw 90, a right stand yaw −90.',
    'Keep everything at least 2 m off the court lines. Floodlights (fixture:flood) stand at the corners/sides, 12–20 m tall.',
    'A crowd stand (crowd:bleacher / crowd:standing) is placed at its FRONT edge; set width (2–80) and rows (1–12); gaps 0..0.9 (0 = packed).',
    `Catalog ids: ${ids}.`,
  ].join('\n');
}

export function aiVenueUser(prompt: string, v: StudioVenue): string {
  return `Venue now: ${JSON.stringify(venueBrief(v))}\nCreator asks: ${prompt.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, AI_LIMITS.prompt)}`;
}
