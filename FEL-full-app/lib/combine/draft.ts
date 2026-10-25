// lib/combine/draft.ts — COMBINE-DAY (2026-10-25): the combine on the coach's phone, and every move the run screen makes.
//
// A combine works before the pending SQL is applied (and in a gym with no signal): it is a draft in this browser's
// storage, numbers only. Saving to the account (server.ts) is an extra once the tables are there, never a condition.
// Every move is pure — an event in, a new event out — so the run screen's buttons are tested without a browser.
//
// Storage reads and writes are wrapped: a private window or blocked storage gives an empty list and a combine that
// still runs (it just does not outlive the tab).
import { parseStations, STATIONS, type StationConfig } from './catalogue';
import { ADHOC_ACCESS, canTest } from './gate';
import { cleanWeights } from './score';
import type { AthleteAccess, Attempt, CombineAthlete, CombineEvent, HeldReason, Reach, ResultGrid, Slots } from './types';

export const DRAFTS_KEY = 'fel.combine.drafts.v1';
/** (new) Drafts kept on one phone; the oldest beyond this are dropped. */
export const MAX_DRAFTS = 12;
/** (new) Athletes in one combine: a team's cap (lib/groups/types.ts MAX_MEMBERS.team). */
export const MAX_ATHLETES = 60;
export const NAME_MAX = 60;

/** A typed name: control characters out, spaces collapsed, cut to NAME_MAX. */
export function cleanName(raw: unknown, fallback = ''): string {
  if (typeof raw !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return s || fallback;
}

export function defaultEventName(now: Date = new Date()): string {
  return `Combine ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

const rid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export function newEvent(o: { name: string; athletes: CombineAthlete[]; stations: StationConfig[]; teamId?: string | null; teamName?: string | null; now?: number; localId?: string }): CombineEvent {
  const now = o.now ?? Date.now();
  const stations = parseStations(o.stations);
  return {
    v: 1, localId: o.localId ?? rid(), serverId: null, name: cleanName(o.name, defaultEventName(new Date(now))), createdAt: now, updatedAt: now,
    teamId: o.teamId ?? null, teamName: o.teamName ?? null, athletes: o.athletes.slice(0, MAX_ATHLETES), stations,
    weights: cleanWeights({}, stations), results: {}, reach: {},
  };
}

/** A typed athlete: held until they are on the roster with an account (gate.ts ADHOC_ACCESS). */
export function adhocAthlete(name: string, existing: readonly CombineAthlete[]): CombineAthlete {
  let n = existing.filter((a) => a.source === 'adhoc').length + 1;
  while (existing.some((a) => a.id === `adhoc:${n}`)) n++;
  return { id: `adhoc:${n}`, name: cleanName(name, `Athlete ${n}`), source: 'adhoc', access: { ...ADHOC_ACCESS } };
}

const slotsOf = (ev: CombineEvent, athleteId: string, st: StationConfig): Slots => {
  const cur = ev.results[athleteId]?.[st.id] ?? [];
  return Array.from({ length: st.attempts }, (_, i) => cur[i] ?? null);
};

function withSlots(ev: CombineEvent, athleteId: string, stationId: string, slots: Slots, now: number): CombineEvent {
  return { ...ev, updatedAt: now, results: { ...ev.results, [athleteId]: { ...(ev.results[athleteId] ?? {}), [stationId]: slots } } };
}

/** The station, and the athlete, if they may be tested there; null otherwise. */
function find(ev: CombineEvent, athleteId: string, stationId: string): { st: StationConfig; a: CombineAthlete } | null {
  const st = ev.stations.find((s) => s.id === stationId);
  const a = ev.athletes.find((x) => x.id === athleteId);
  return st && a && canTest(a, st.kind) ? { st, a } : null;
}

/** The next attempt's slot (0-based), or null when every attempt is taken. */
export function nextSlot(ev: CombineEvent, athleteId: string, stationId: string): number | null {
  const f = find(ev, athleteId, stationId);
  if (!f) return null;
  const i = slotsOf(ev, athleteId, f.st).findIndex((s) => s === null);
  return i < 0 ? null : i;
}

/**
 * Record attempts into the next free slots (a camera take may read several jumps at once). A value is a number, or null
 * for a no-mark. Anything past the station's attempts is dropped. An athlete who may not be tested here: unchanged.
 */
export function recordAttempts(ev: CombineEvent, athleteId: string, stationId: string, values: readonly { value: number | null; touchCm?: number | null }[], now: number = Date.now()): CombineEvent {
  const f = find(ev, athleteId, stationId);
  if (!f) return ev;
  const slots = slotsOf(ev, athleteId, f.st);
  let changed = false;
  for (const v of values) {
    const i = slots.findIndex((s) => s === null);
    if (i < 0) break;
    const value = typeof v.value === 'number' && Number.isFinite(v.value) && v.value >= 0 ? v.value : null;
    const a: Attempt = { value, at: now };
    if (f.st.kind === 'approach' && typeof v.touchCm === 'number' && Number.isFinite(v.touchCm)) a.touchCm = v.touchCm;
    slots[i] = a;
    changed = true;
  }
  return changed ? withSlots(ev, athleteId, stationId, slots, now) : ev;
}

/** Redo: clear the latest taken attempt (or a given one), so it is taken again. */
export function redoAttempt(ev: CombineEvent, athleteId: string, stationId: string, index?: number, now: number = Date.now()): CombineEvent {
  const f = find(ev, athleteId, stationId);
  if (!f) return ev;
  const slots = slotsOf(ev, athleteId, f.st);
  let i = index ?? -1;
  if (index === undefined) for (let k = slots.length - 1; k >= 0; k--) if (slots[k] !== null) { i = k; break; }
  if (i < 0 || i >= slots.length || slots[i] === null) return ev;
  slots[i] = null;
  return withSlots(ev, athleteId, stationId, slots, now);
}

/** The athletes in line at a station, in the combine's order: only those who may be tested there. */
export function lineFor(ev: CombineEvent, stationId: string): CombineAthlete[] {
  const st = ev.stations.find((s) => s.id === stationId);
  return st ? ev.athletes.filter((a) => canTest(a, st.kind)) : [];
}

/**
 * Next athlete: the first after `current` (wrapping) with an attempt still to take; if everyone is done, null.
 * `current` null starts from the top of the line.
 */
export function nextAthlete(ev: CombineEvent, stationId: string, current: string | null): string | null {
  const line = lineFor(ev, stationId);
  if (!line.length) return null;
  const start = current ? line.findIndex((a) => a.id === current) : -1;
  for (let k = 1; k <= line.length; k++) {
    const a = line[(start + k + line.length) % line.length];
    if (nextSlot(ev, a.id, stationId) !== null) return a.id;
  }
  return null;
}

/** Done / total attempts at a station, over its line. */
export function stationProgress(ev: CombineEvent, stationId: string): { done: number; total: number } {
  const st = ev.stations.find((s) => s.id === stationId);
  if (!st) return { done: 0, total: 0 };
  const line = lineFor(ev, stationId);
  return { done: line.reduce((t, a) => t + slotsOf(ev, a.id, st).filter((s) => s !== null).length, 0), total: line.length * st.attempts };
}

export function setWeights(ev: CombineEvent, weights: Record<string, number>, now: number = Date.now()): CombineEvent {
  return { ...ev, weights: cleanWeights(weights, ev.stations), updatedAt: now };
}

export function setReach(ev: CombineEvent, athleteId: string, reach: Reach, now: number = Date.now()): CombineEvent {
  const r = cleanReach(reach);
  if (!r || !ev.athletes.some((a) => a.id === athleteId && a.access.camera)) return ev;
  return { ...ev, reach: { ...ev.reach, [athleteId]: r }, updatedAt: now };
}

function cleanReach(raw: unknown): Reach | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const share = r.reachOverLeg, sd = r.reachOverLegSd;
  if (typeof share !== 'number' || !Number.isFinite(share) || share <= 0) return null;
  return { reachOverLeg: share, reachOverLegSd: typeof sd === 'number' && Number.isFinite(sd) && sd >= 0 ? sd : 0 };
}

// ── storage ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function draftStorage(): DraftStorage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

const HELD = new Set<HeldReason>(['age_required', 'guardian_consent_required', 'under_13', 'age_unknown']);

function cleanAccess(raw: unknown, source: 'roster' | 'adhoc'): AthleteAccess {
  if (source === 'adhoc') return { ...ADHOC_ACCESS };
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const testable = r.testable === true;
  const camera = testable && r.camera === true;
  const held = HELD.has(r.held as HeldReason) ? (r.held as HeldReason) : null;
  return { testable, camera, saveCamera: camera && r.saveCamera === true, held: testable ? null : held ?? 'age_required' };
}

/** Slots from untrusted input (a stored draft, a request body): one per attempt, numbers only. */
export function cleanSlots(raw: unknown, attempts: number): Slots {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: attempts }, (_, i) => {
    const a = arr[i] as Record<string, unknown> | null | undefined;
    if (!a || typeof a !== 'object') return null;
    const value = typeof a.value === 'number' && Number.isFinite(a.value) && a.value >= 0 ? a.value : null;
    const out: Attempt = { value, at: typeof a.at === 'number' ? a.at : 0 };
    if (typeof a.touchCm === 'number' && Number.isFinite(a.touchCm)) out.touchCm = a.touchCm;
    return out;
  });
}

/** A stored draft, checked field by field (a hand-edited or older shape never reaches the screens). */
export function cleanEvent(raw: unknown): CombineEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.localId !== 'string') return null;
  const stations = parseStations(r.stations);
  const athletes: CombineAthlete[] = (Array.isArray(r.athletes) ? r.athletes : []).flatMap((x) => {
    const a = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    if (typeof a.id !== 'string') return [];
    const source = a.source === 'adhoc' || a.id.startsWith('adhoc:') ? 'adhoc' : 'roster';
    return [{ id: a.id, name: cleanName(a.name, 'Athlete'), source, access: cleanAccess(a.access, source) } as CombineAthlete];
  }).slice(0, MAX_ATHLETES);
  const results: ResultGrid = {};
  const rawResults = (r.results && typeof r.results === 'object' ? r.results : {}) as Record<string, Record<string, unknown>>;
  for (const a of athletes) {
    for (const s of stations) {
      const slots = cleanSlots(rawResults[a.id]?.[s.id], s.attempts);
      if (slots.some((x) => x !== null)) (results[a.id] ??= {})[s.id] = slots;
    }
  }
  const reach: Record<string, Reach> = {};
  const rawReach = (r.reach && typeof r.reach === 'object' ? r.reach : {}) as Record<string, unknown>;
  for (const a of athletes) { const v = cleanReach(rawReach[a.id]); if (v && a.access.camera) reach[a.id] = v; }
  return {
    v: 1, localId: r.localId, serverId: typeof r.serverId === 'string' ? r.serverId : null, name: cleanName(r.name, 'Combine'),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0, updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
    teamId: typeof r.teamId === 'string' ? r.teamId : null, teamName: typeof r.teamName === 'string' ? cleanName(r.teamName) : null,
    athletes, stations, weights: cleanWeights(r.weights, stations), results, reach,
  };
}

export function loadDrafts(store: DraftStorage | null = draftStorage()): CombineEvent[] {
  if (!store) return [];
  try {
    const raw = JSON.parse(store.getItem(DRAFTS_KEY) ?? '[]');
    return (Array.isArray(raw) ? raw : []).map(cleanEvent).filter((e): e is CombineEvent => e !== null).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** Keep (insert or replace) one draft. false when storage refused it. */
export function keepDraft(ev: CombineEvent, store: DraftStorage | null = draftStorage()): boolean {
  if (!store) return false;
  try {
    const rest = loadDrafts(store).filter((d) => d.localId !== ev.localId);
    store.setItem(DRAFTS_KEY, JSON.stringify([ev, ...rest].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_DRAFTS)));
    return true;
  } catch {
    return false;
  }
}

export function dropDraft(localId: string, store: DraftStorage | null = draftStorage()): void {
  if (!store) return;
  try { store.setItem(DRAFTS_KEY, JSON.stringify(loadDrafts(store).filter((d) => d.localId !== localId))); } catch { /* nothing kept to drop */ }
}

/** The kind of a station config by id (for the screens). */
export const stationOf = (ev: Pick<CombineEvent, 'stations'>, id: string): StationConfig | undefined => ev.stations.find((s) => s.id === id);

/** Is this station hand-timed? */
export const isHand = (s: Pick<StationConfig, 'kind'>): boolean => STATIONS[s.kind].method === 'hand';
