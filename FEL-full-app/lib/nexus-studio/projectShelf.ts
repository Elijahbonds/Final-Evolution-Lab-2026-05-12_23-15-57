// THE PROJECT LIST, on this device (STUDIO-EASY, coordinator decision 6, 2026-10-28: "New project and a project list — local
// storage, no server"). The audit measured one project per device: starting another meant Import or clearing site data.
//
// THE FORMAT IS UNCHANGED. The open project stays exactly where it always was (storage.ts PROJECT_KEY, the same JSON), so every
// existing project opens as before and nothing else reads a new shape. The OTHER projects wait beside it on a shelf under their
// own key (SHELF_KEY), each one the very same project JSON. Opening one swaps it with the open one; nothing is ever dropped
// silently: a full shelf or a full device refuses the swap and says so (export first). Server save is studio-save's (PR #373,
// held), and does not read this key.

import { parseProject, type StudioProject } from './doc';
import type { KV } from './storage';

export const SHELF_KEY = 'fel.nexusStudio.shelf.v1';
const SHELF_KIND = 'nexus-studio-shelf';
/** Projects kept beside the open one. A cap so the device's ~5 MB is never filled by the shelf alone. */
export const SHELF_MAX = 20;

export interface ShelfEntry { id: string; name: string; updatedAt: string; objects: number; text: string }
export interface ShelfSummary { id: string; name: string; updatedAt: string; objects: number }

const isEntry = (e: unknown): e is ShelfEntry => {
  const x = e as Partial<ShelfEntry> | null;
  return !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.text === 'string' && typeof x.updatedAt === 'string' && typeof x.objects === 'number';
};

function read(kv: KV | null): ShelfEntry[] {
  if (!kv) return [];
  try {
    const raw = kv.getItem(SHELF_KEY);
    if (!raw) return [];
    const j = JSON.parse(raw) as { kind?: string; projects?: unknown[] };
    return j?.kind === SHELF_KIND && Array.isArray(j.projects) ? j.projects.filter(isEntry) : [];
  } catch { return []; }
}

function write(kv: KV, list: ShelfEntry[]): { ok: true } | { ok: false; error: string } {
  try { kv.setItem(SHELF_KEY, JSON.stringify({ kind: SHELF_KIND, version: 1, projects: list })); return { ok: true }; }
  catch (e) {
    const quota = e instanceof Error && /quota/i.test(`${e.name} ${e.message}`);
    return { ok: false, error: quota ? 'This device is out of room. Export a project to a file, then delete it here.' : 'This device would not keep the project list.' };
  }
}

const objectsIn = (p: StudioProject) => p.venues.reduce((n, v) => n + v.objects.length, 0);

/** The shelf, newest first, without the project bodies. */
export function listShelf(kv: KV | null): ShelfSummary[] {
  return read(kv).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(({ id, name, updatedAt, objects }) => ({ id, name, updatedAt, objects }));
}

/** Put a project on the shelf (replacing its own older copy). Refuses — never drops another — when the shelf is full. */
export function shelve(kv: KV | null, p: StudioProject): { ok: true } | { ok: false; error: string } {
  if (!kv) return { ok: false, error: 'This browser is not keeping site data. Export the project to keep it.' };
  const list = read(kv).filter((e) => e.id !== p.id);
  if (list.length >= SHELF_MAX) return { ok: false, error: `This device keeps ${SHELF_MAX} other projects. Delete or export one first.` };
  list.push({ id: p.id, name: p.name, updatedAt: p.updatedAt, objects: objectsIn(p), text: JSON.stringify(p) });
  return write(kv, list);
}

/** Read one shelved project (parsed through the import path: migrate + sanitize). */
export function readShelved(kv: KV | null, id: string): StudioProject | null {
  const e = read(kv).find((x) => x.id === id);
  if (!e) return null;
  const r = parseProject(e.text);
  return r.ok ? r.project : null;
}

export function removeShelved(kv: KV | null, id: string): { ok: true } | { ok: false; error: string } {
  if (!kv) return { ok: false, error: 'This browser is not keeping site data.' };
  return write(kv, read(kv).filter((e) => e.id !== id));
}

/**
 * Swap: shelve the open project, take `next` off the shelf (when it came from there) — the caller then saves `next` as the open
 * project. All or nothing: if the open one cannot be shelved, nothing moves.
 */
export function swapIn(kv: KV | null, open: StudioProject, nextId: string | null): { ok: true; next: StudioProject | null } | { ok: false; error: string } {
  if (!kv) return { ok: false, error: 'This browser is not keeping site data. Export the project to keep it.' };
  const next = nextId ? readShelved(kv, nextId) : null;
  if (nextId && !next) return { ok: false, error: 'That project could not be read on this device.' };
  // one write: the open project in, the opened one out
  const list = read(kv).filter((e) => e.id !== open.id && e.id !== nextId);
  if (list.length >= SHELF_MAX) return { ok: false, error: `This device keeps ${SHELF_MAX} other projects. Delete or export one first.` };
  list.push({ id: open.id, name: open.name, updatedAt: open.updatedAt, objects: objectsIn(open), text: JSON.stringify(open) });
  const w = write(kv, list);
  return w.ok ? { ok: true, next } : w;
}
