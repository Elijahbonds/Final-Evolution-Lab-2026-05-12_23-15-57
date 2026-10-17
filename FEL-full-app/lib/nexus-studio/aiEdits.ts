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
// studio-4b: CELL also proposes SCRIPTS (an event → condition → action graph in the script vocabulary, through scripts.ts
// sanitizeGraph — data, never code; scoped to the venue it was asked for) and CASTS (a project character as the player or among
// the fans), through the same review-then-apply step. And an EXPLAIN pass: a read-only, plain-language summary of the venue.
//
// PRIVACY (Privacy Policy §1, "Studio AI builder requests"): a request carries the typed request and the venue — its settings and
// what is placed where — and nothing else: never the account, age, birth year, character or health data. So the model is NOT
// told which characters the project has (not their names, not their looks). A cast edit names a character the way the CREATOR
// named it in the typed request, and the browser resolves that name against the project's own characters (resolveCastName); a
// name that matches none is shown in the review and left out. Existing scripts are not sent either: a proposal is a new script.
//
// studio-5 (§13.2): CELL also proposes STAMPS — a prefab group (stamps.ts) placed at a spot and turned, as one more op in the
// closed vocabulary, through the same review-then-apply step and the same one command. The model is told the BUILT-IN stamps
// (app content, like the catalog's ids). It is NOT told the project's own stamps: they are project data, not the venue's settings
// or placements (Privacy Policy §1 lets a request carry those and the typed request only), and their names are free text a
// creator typed. A project stamp is reached the way a character is: the creator names it in the request, the model repeats the
// name, and the browser resolves it against the project's own stamps (resolveStamp); a name that matches none is shown in the
// review and left out.
//
// Pure: no fetch, no DOM, no Babylon. The prompt words live here too, so the server route stays a thin, testable shell.

import type { Command, Op } from './commands';
import { catalog, catalogItem, instantiate } from './catalog';
import {
  LIMITS, OBJECT_TYPES, clampNum, newId, sanitizeObject, sanitizeVenue, wrapAngle,
  type StudioCharacter, type StudioObject, type StudioObjectType, type StudioScript, type StudioStamp, type StudioVenue, type V3, type VenueSettings,
} from './doc';
import { NODE_KINDS, NODE_SPECS, groupOf, sanitizeGraph, type ParamSpec, type ScriptGraph } from './scripts';
import { builtInStamps, stampCopies } from './stamps';
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
  | { op: 'clear'; type: StudioObjectType | 'all' }
  /** studio-4b: a new script for this venue (the graph already through sanitizeGraph, laid out by the Studio) */
  | { op: 'script'; name: string; graph: ScriptGraph }
  /** studio-4b: cast a character the creator NAMED (resolved in the browser), or empty the player slot (`character: null`) */
  | { op: 'cast'; slot: 'player' | 'crowd'; character: string | null }
  /** studio-5: a prefab stamp — a built-in's id or name, or a project stamp's name as the creator wrote it (resolved in the browser) —
   *  placed with its origin at `at`, turned `yaw` (radians) */
  | { op: 'stamp'; stamp: string; at: V3; yaw: number };

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
  /** scripts one answer may propose, and nodes in each */
  scripts: 4,
  scriptNodes: 24,
  /** cast edits one answer may make */
  casts: 1 + 4,
  /** stamps one answer may place (their pieces count toward `placed`) */
  stamps: 6,
  /** the explain pass's summary (characters) */
  summary: 1200,
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

/** A proposed script: the graph through the script vocabulary's own sanitiser, capped, then laid out in columns (event →
 *  condition → action) — the model's coordinates are never used. Null when it has no event or no action (it would do nothing). */
function scriptEdit(e: Json): AiEdit | null {
  const nodes = own(e, 'nodes');
  const g = sanitizeGraph({ enabled: true, nodes: Array.isArray(nodes) ? nodes.slice(0, AI_LIMITS.scriptNodes) : [], edges: own(e, 'edges') });
  if (!g.nodes.some((n) => groupOf(n.kind) === 'event') || !g.nodes.some((n) => groupOf(n.kind) === 'action') || !g.edges.length) return null;
  // fresh ids (the model's ids are labels inside one answer; the Studio mints its own), and the editor's own columns
  const ids = new Map(g.nodes.map((n) => [n.id, newId('node')]));
  const row: Record<string, number> = { event: 0, condition: 0, action: 0 };
  const col: Record<string, number> = { event: 40, condition: 280, action: 520 };
  const laid = g.nodes.map((n) => { const grp = groupOf(n.kind); const y = 40 + row[grp]++ * 88; return { ...n, id: ids.get(n.id)!, x: col[grp], y }; });
  const edges = g.edges.map((x) => ({ id: newId('edge'), from: ids.get(x.from)!, to: ids.get(x.to)! }));
  return { op: 'script', name: label(own(e, 'name')) ?? 'CELL script', graph: { enabled: true, nodes: laid, edges } };
}

/** A cast edit: the slot, and the character's name as the creator wrote it (null empties the player slot). */
function castEdit(e: Json): AiEdit | null {
  const slot = own(e, 'slot');
  if (slot !== 'player' && slot !== 'crowd') return null;
  const c = own(e, 'character');
  if (c === null && slot === 'player') return { op: 'cast', slot, character: null };
  const name = label(c);
  return name ? { op: 'cast', slot, character: name } : null;
}

/** A stamp edit: the stamp's name or id (text, capped), where its origin goes, and its turn. */
function stampEdit(e: Json): AiEdit | null {
  const name = label(own(e, 'stamp'));
  const p = xz(own(e, 'at'));
  return name && p ? { op: 'stamp', stamp: name, at: [p[0], 0, p[1]], yaw: yawOf(own(e, 'yaw')) } : null;
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
  let dropped = 0, placed = 0, scripts = 0, casts = 0, stamps = 0;
  for (const e of list) {
    if (edits.length >= AI_LIMITS.edits) { dropped++; continue; }
    if (!isObj(e)) { dropped++; continue; }
    const op = own(e, 'op');
    if (op === 'script') { const x = scripts < AI_LIMITS.scripts ? scriptEdit(e) : null; if (x) { edits.push(x); scripts++; } else dropped++; continue; }
    if (op === 'cast') { const x = casts < AI_LIMITS.casts ? castEdit(e) : null; if (x) { edits.push(x); casts++; } else dropped++; continue; }
    if (op === 'stamp') { const x = stamps < AI_LIMITS.stamps ? stampEdit(e) : null; if (x) { edits.push(x); stamps++; } else dropped++; continue; }
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

export interface Compiled { cmd: Command; placed: number; removed: number; settings: string[]; scripts: number; cast: number; /** studio-5: stamps placed (their pieces are in `placed`) */ stamps: number }

/** The project around the venue, for the edits that reach past it (scripts are added to the project; casts name its characters). */
export interface AiProjectCtx {
  characters: readonly Pick<StudioCharacter, 'id' | 'name'>[];
  scripts: readonly Pick<StudioScript, 'id'>[];
  /** studio-5: the project's own stamps (StudioProject.stamps), which a stamp edit may name; the built-ins need no project */
  stamps?: readonly StudioStamp[];
}

/**
 * A character the creator named → the project's character: the exact name (case and spacing aside); else, if exactly one
 * character's name contains it or is contained by it, that one. Ambiguous or unknown: null (the review says so).
 */
export function resolveCastName(characters: readonly Pick<StudioCharacter, 'id' | 'name'>[], name: string): Pick<StudioCharacter, 'id' | 'name'> | null {
  return byName(characters, name);
}

/** The name rule casts and stamps share: exact (case and spacing aside), else one unique partial match; else null. */
function byName<T extends { name: string }>(list: readonly T[], name: string): T | null {
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, ' ').trim();
  const n = norm(name);
  if (!n) return null;
  const exact = list.filter((c) => norm(c.name) === n);
  if (exact.length === 1) return exact[0];   // two with the same name: the partial match below finds both → null
  const near = list.filter((c) => norm(c.name).includes(n) || n.includes(norm(c.name)));
  return near.length === 1 ? near[0] : null;
}

/**
 * studio-5: the stamp a stamp edit names — a built-in by its id (`stamp:lampRow`), else by name among the built-ins and the
 * project's own stamps together (byName: exact, else one unique partial match). Ambiguous or unknown: null (the review says so).
 */
export function resolveStamp(name: string, project: readonly StudioStamp[] = []): StudioStamp | null {
  const built = builtInStamps();
  return built.find((b) => b.id === name.trim()) ?? byName([...built, ...project], name);
}

/** The edits as one command on `v` (one undo step), or null when they change nothing. Ids are minted here. Scripts and casts need
 *  the project (`ctx`); without it they are left out. */
export function compileAiEdits(v: StudioVenue, edits: readonly AiEdit[], prompt: string, ctx?: AiProjectCtx): Compiled | null {
  const ops: Op[] = [];
  const seen = new Set(v.objects.map((o) => o.id));
  const removed = new Set<string>();
  let patch: Partial<VenueSettings> = {};
  let placed = 0, scripts = 0, cast = 0, stamps = 0;
  let player = v.cast?.player;
  const crowd = [...(v.cast?.crowd ?? [])];
  let castTouched = false;
  for (const e of edits) {
    if (e.op === 'venue') { patch = { ...patch, ...e.set }; continue; }
    if (e.op === 'script') {
      if (!ctx || ctx.scripts.length + scripts >= LIMITS.scripts) continue;
      const script: StudioScript = { id: newId('script'), name: e.name, ...e.graph, venues: [v.id] };   // scoped to the venue it was asked for
      ops.push({ op: 'addScript', script });
      scripts++;
      continue;
    }
    if (e.op === 'cast') {
      if (!ctx) continue;
      if (e.slot === 'player' && e.character === null) { if (player) { player = undefined; castTouched = true; cast++; } continue; }
      const c = resolveCastName(ctx.characters, e.character ?? '');
      if (!c) continue;
      if (e.slot === 'player') { if (player !== c.id) { player = c.id; castTouched = true; cast++; } continue; }
      if (!crowd.includes(c.id) && crowd.length < LIMITS.crowdCast) { crowd.push(c.id); castTouched = true; cast++; }
      continue;
    }
    if (e.op === 'stamp') {
      // the whole stamp or none of it (a half-placed stamp is a broken one — stamps.ts placeStamp's rule), inside the venue's cap
      // and the answer's placement cap
      const st = resolveStamp(e.stamp, ctx?.stamps);
      if (!st?.objects.length) continue;
      if (v.objects.length - removed.size + placed + st.objects.length > LIMITS.objects || placed + st.objects.length > AI_LIMITS.placed) continue;
      const copies = stampCopies(st, e.at, e.yaw, seen);
      for (const object of copies) ops.push({ op: 'addObject', venueId: v.id, object });
      placed += copies.length;
      stamps++;
      continue;
    }
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
    // the answer's scale is RELATIVE to the catalog's own placement scale (studio-4a §11: a Kenney kit item is placed at its kit's
    // venue-set median, e.g. nature ×4.6 — the models are toy-sized at 1×), so "scale 1.4" is a palm 1.4× its natural size
    const t0 = base.t as { s?: number };
    base.t = { ...(base.t as object), s: (typeof t0.s === 'number' && Number.isFinite(t0.s) ? t0.s : 1) * e.scale };
    if (e.name) base.name = e.name;
    // the import path's sanitiser: clamps every number, drops a bad colour, re-mints an id the venue already has
    const o: StudioObject | null = sanitizeObject(base, seen);
    if (!o) continue;
    ops.push({ op: 'addObject', venueId: v.id, object: o });
    placed++;
  }
  const settings = Object.keys(patch);
  if (castTouched) {
    const next = { ...(player ? { player } : {}), ...(crowd.length ? { crowd } : {}) };
    patch = { ...patch, cast: Object.keys(next).length ? next : undefined };
  }
  if (settings.length || castTouched) ops.unshift({ op: 'patchVenue', venueId: v.id, patch });
  if (!ops.length) return null;
  const words = prompt.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 48);
  return { cmd: { label: `AI: ${words || 'venue'}${prompt.trim().length > 48 ? '…' : ''}`, ops }, placed, removed: removed.size, settings, scripts, cast, stamps };
}

/** One line per edit, for the review list the creator reads before Apply. */
export function describeEdit(e: AiEdit): string {
  if (e.op === 'venue') {
    const say = (k: string, val: unknown): string => {
      if (k === 'sky' && val && typeof val === 'object') { const sky = val as { top?: string; bottom?: string }; return `own sky ${sky.top} → ${sky.bottom}`; }
      if (k === 'ground' && val && typeof val === 'object') { const g = val as { kind?: string; color?: string }; return `ground ${[g.kind, g.color].filter(Boolean).join(' ')}`; }
      return `${k} ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`;
    };
    return `Venue: ${Object.entries(e.set).map(([k, val]) => say(k, val)).join(' · ')}`;
  }
  if (e.op === 'clear') return e.type === 'all' ? 'Clear every unlocked object' : `Clear every unlocked ${e.type}`;
  if (e.op === 'script') {
    const byId = new Map(e.graph.nodes.map((n) => [n.id, n]));
    const events = e.graph.nodes.filter((n) => groupOf(n.kind) === 'event').map((n) => NODE_SPECS[n.kind].label);
    const actions = e.graph.nodes.filter((n) => groupOf(n.kind) === 'action').map((n) => NODE_SPECS[n.kind].label);
    const ifs = e.graph.edges.filter((x) => groupOf(byId.get(x.to)!.kind) === 'condition').length;
    return `Script “${e.name}” (this venue): when ${events.join(' / ')}${ifs ? ', if …' : ''} → ${actions.join(', ')}`;
  }
  if (e.op === 'cast') return e.character === null ? 'Cast: the player’s own look again' : e.slot === 'player' ? `Cast “${e.character}” as the player` : `Seat “${e.character}” among the fans`;
  if (e.op === 'stamp') {
    const turn = Math.round((e.yaw * 180) / Math.PI);
    return `Stamp “${e.stamp}” at (${e.at[0].toFixed(1)}, ${e.at[2].toFixed(1)})${turn ? `, turned ${turn}°` : ''}`;
  }
  const item = catalogItem(e.item);
  return `Place ${e.name ?? item?.label ?? e.item} at (${e.at[0].toFixed(1)}, ${e.at[2].toFixed(1)})`;
}

/** The review list against the project: each line, plus why a cast is left out (no such character, ambiguous, a full crowd). */
export function reviewAiEdits(edits: readonly AiEdit[], ctx: AiProjectCtx): Array<{ line: string; skipped?: string }> {
  return edits.map((e) => {
    const line = describeEdit(e);
    if (e.op === 'stamp') {
      const st = resolveStamp(e.stamp, ctx.stamps);
      if (!st) return { line, skipped: `no single stamp called “${e.stamp}” on the shelf — left out` };
      const own = !st.id.startsWith('stamp:');
      // a built-in asked for by its id reads by its name; a partial match says which stamp it found
      const said = st.id === e.stamp ? describeEdit({ ...e, stamp: st.name }) : st.name === e.stamp ? line : `${line} → ${st.name}`;
      return { line: `${said} (${st.objects.length} piece${st.objects.length === 1 ? '' : 's'}${own ? ', this project’s stamp' : ''})` };
    }
    if (e.op !== 'cast' || e.character === null) return { line };
    const c = resolveCastName(ctx.characters, e.character);
    return c ? { line: c.name === e.character ? line : `${line} → ${c.name}` } : { line, skipped: `no single character called “${e.character}” in this project — left out` };
  });
}

// ── the prompt (what the server sends) ──────────────────────────────────────────────────────────────────────────────

/** What the browser sends as the venue: the venue WITHOUT its cast (character ids are character data; Privacy Policy §1 lets the
 *  request carry the typed request and the venue's settings and placements only). The server's brief never reads a cast either. */
export function venueForAi(v: StudioVenue): StudioVenue {
  const { cast: _cast, ...rest } = v;
  void _cast;
  return rest;
}

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
    ' {"op":"place","item":<catalog id>,"at":[x,z],"yaw":degrees,"scale":0.25..4 (relative to the item’s natural size; 1 = as placed by hand),"name"?,"set"?:{color?,tint?,height?,width?,rows?,gaps?,posture?:"seated"|"standing",benches?}}',
    ' {"op":"row","item":<catalog id>,"from":[x,z],"to":[x,z],"count":1..16,"yaw":degrees,"set"?}',
    ' {"op":"clear","type"?:"fixture"|"crowdStand"|"kitProp"|"specProp"|"meshyProp"|"decal"|"all"}',
    `Values: ${ENUMS}. Colours are "#rrggbb".`,
    'Frame (metres): the court is centred at 0,0, about 11 wide (x) and 24 long (z). The play camera stands at z=+16 looking toward −z:',
    '"far" is −z (z −16 to −30), "near" is +z behind the player (keep z < 13 clear), "left" is −x, "right" is +x.',
    'yaw 0 faces +z (toward the camera); a far stand facing the court uses yaw 0, a left stand yaw 90, a right stand yaw −90.',
    'Keep everything at least 2 m off the court lines. Floodlights (fixture:flood) stand at the corners/sides, 12–20 m tall.',
    'A crowd stand (crowd:bleacher / crowd:standing) is placed at its FRONT edge; set width (2–80) and rows (1–12); gaps 0..0.9 (0 = packed).',
    `Catalog ids: ${ids}.`,
    // studio-4b: scripts and casts
    'Scripts (presentation only: they never change a score, a timer or a rule) — add one when the creator asks for a reaction:',
    ' {"op":"script","name":"...","nodes":[{"id":"a","kind":<kind>,"params":{...}}],"edges":[{"from":"a","to":"b"}]}',
    ' Edges run event → condition|action and condition → condition|action; at least one event and one action.',
    `Script kinds: ${scriptKinds()}.`,
    'Casts: the creator may NAME one of their characters in the request. You are not told which characters exist; use the name',
    ' exactly as the creator wrote it: {"op":"cast","slot":"player"|"crowd","character":"<name>"} ({"slot":"player","character":null}',
    ` gives the player their own look back). The crowd seats up to ${LIMITS.crowdCast} named characters among the fans.`,
    // studio-5: stamps
    'Stamps (prefab groups of catalog items, placed whole) — use one when it fits the request:',
    ' {"op":"stamp","stamp":<stamp id>,"at":[x,z],"yaw":degrees} — "at" is the stamp\'s centre; yaw turns the whole group about it.',
    `Built-in stamps: ${builtInStamps().map((b) => `${b.id} (${b.name})`).join(', ')}.`,
    'The creator may also NAME a stamp of their own in the request. You are not told which they have; use the name exactly as the',
    ' creator wrote it in "stamp".',
  ].join('\n');
}

/** The script vocabulary in one line for the model: each kind and its parameters (enum options inline). */
function scriptKinds(): string {
  return NODE_KINDS.map((k) => {
    const ps = (NODE_SPECS[k].params as readonly ParamSpec[]).map((p) => (p.type === 'enum' ? `${p.key}:${p.options.join('|')}` : p.type === 'number' ? `${p.key}:${p.min}..${p.max}` : `${p.key}:${p.type}`));
    return `${k}(${groupOf(k)}${ps.length ? '; ' + ps.join(', ') : ''})`;
  }).join(' ');
}

export function aiVenueUser(prompt: string, v: StudioVenue): string {
  return `Venue now: ${JSON.stringify(venueBrief(v))}\nCreator asks: ${prompt.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, AI_LIMITS.prompt)}`;
}

// ── the explain pass (studio-4b): read-only, plain words ─────────────────────────────────────────────────────────────

/** The system words for "Explain this venue": a plain-language summary, no edits, no markup. */
export function aiExplainSystem(): string {
  return [
    'You are CELL inside Nexus Studio. Explain the creator\'s sports venue in plain language: what it looks like, the light and',
    'the weather, where the crowd and the lights are, and one thing that might make it better. Six short sentences at most.',
    'Plain text only: no lists, no markdown, no code, no links. Do not suggest JSON or edits. Frame (metres): the court is centred',
    'at 0,0; the play camera stands at z=+16 looking toward −z; "far" is −z, "left" is −x.',
  ].join('\n');
}

export function aiExplainUser(v: StudioVenue): string {
  return `Venue: ${JSON.stringify(venueBrief(v))}`;
}

/** The model's summary → text the panel shows AS TEXT: control characters and markup marks out, whitespace folded, capped. */
export function sanitizeSummary(text: unknown): string {
  if (typeof text !== 'string') return '';
  const s = text
    .replace(/```[\s\S]*?```/g, ' ')                  // a fenced block is not a summary
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')  // control characters (newlines and tabs fold below)
    .replace(/[<>]/g, '')                              // never markup, even as text
    .replace(/[*_#`]+/g, '')                           // markdown marks
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= AI_LIMITS.summary) return s;
  const cut = s.slice(0, AI_LIMITS.summary);
  return `${cut.slice(0, Math.max(cut.lastIndexOf('. ') + 1, AI_LIMITS.summary - 40)).trim()}…`;
}
