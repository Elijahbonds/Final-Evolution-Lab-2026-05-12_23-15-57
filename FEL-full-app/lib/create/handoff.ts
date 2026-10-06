// lib/create/handoff.ts — CREATE HUB: hand one audio file from a tool to the Create flow ON THIS DEVICE.
//
// A rendered song (SongPanel's RENDER SONG) or a player's own file (FlipShelf's YOUR FILE) is megabytes: it cannot ride
// in the URL, and an in-memory hand-off dies with a full page load. It goes into the Academy's own IndexedDB store (the
// one StudioLibrary keeps songs in, 'fel-studio' table `audio`) under one fixed key, with a small record in
// localStorage naming where it came from. The flow takes it once (and deletes it); a hand-off older than 30 minutes, or
// from another tool, is ignored. Nothing leaves the device here: the upload happens only when the creator submits.

import type { PublishSource } from './flow';

export const HANDOFF_AUDIO_KEY = 'create/handoff';
export const HANDOFF_META_KEY = 'fel-create-handoff-v1';
export const HANDOFF_TTL_MS = 30 * 60_000;

export interface HandoffMeta { from: PublishSource; fileName: string; mime: string; bpm?: number; title?: string; at: number }

export interface HandoffStore {
  putAudio(key: string, data: ArrayBuffer, mime: string): Promise<void>;
  getAudio(key: string): Promise<{ data: ArrayBuffer; mime: string } | null>;
  deleteAudio(key: string): Promise<void>;
}
export interface HandoffDeps { store: () => Promise<HandoffStore>; storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null; now?: () => number }

const defaultDeps = (): HandoffDeps => ({
  store: () => import('@/lib/babylon/music/studioStore').then((m) => m.openStudioStore()),
  storage: () => { try { return window.localStorage; } catch { return null; } },
});

export function readMeta(raw: string | null): HandoffMeta | null {
  try {
    const m = raw ? JSON.parse(raw) as HandoffMeta : null;
    return m && typeof m.from === 'string' && typeof m.fileName === 'string' && typeof m.mime === 'string' && typeof m.at === 'number' ? m : null;
  } catch { return null; }
}

/** Is this hand-off for `from`, and recent? */
export const isFresh = (m: HandoffMeta | null, from: PublishSource, now: number): m is HandoffMeta =>
  !!m && m.from === from && now - m.at >= 0 && now - m.at <= HANDOFF_TTL_MS;

/** Keep the file for the flow. False when this browser keeps no files (the flow then asks for the file instead). */
export async function putHandoff(blob: Blob, meta: Omit<HandoffMeta, 'at'>, deps: HandoffDeps = defaultDeps()): Promise<boolean> {
  try {
    const storage = deps.storage();
    if (!storage) return false;
    await (await deps.store()).putAudio(HANDOFF_AUDIO_KEY, await blob.arrayBuffer(), meta.mime);
    storage.setItem(HANDOFF_META_KEY, JSON.stringify({ ...meta, at: (deps.now ?? Date.now)() }));
    return true;
  } catch { return false; }
}

/** Take the file once: returns it and clears both halves, or null (none, stale, or from another tool). */
export async function takeHandoff(from: PublishSource, deps: HandoffDeps = defaultDeps()): Promise<{ blob: Blob; meta: HandoffMeta } | null> {
  try {
    const storage = deps.storage();
    const meta = readMeta(storage?.getItem(HANDOFF_META_KEY) ?? null);
    if (!isFresh(meta, from, (deps.now ?? Date.now)())) return null;
    const store = await deps.store();
    const rec = await store.getAudio(HANDOFF_AUDIO_KEY);
    storage?.removeItem(HANDOFF_META_KEY);
    await store.deleteAudio(HANDOFF_AUDIO_KEY).catch(() => {});
    return rec ? { blob: new Blob([rec.data], { type: rec.mime || meta.mime }), meta } : null;
  } catch { return null; }
}
