// lib/pipelines/client.ts — PIPELINES: the browser's copy of the community lists, fetched once per kind per page life
// (refreshed after five minutes) and shared by every consumer on the page. A failure is an empty list: no game waits on it.

import type {
  CommunityKind, DanceSongEntry, McLineEntry, ReadEntry, RecipeEntry, RoutineEntry, ScenePackEntry,
} from './community';

export interface CommunityByKind {
  'dance-songs': DanceSongEntry; routines: RoutineEntry; 'scene-packs': ScenePackEntry; recipes: RecipeEntry; reads: ReadEntry; 'mc-lines': McLineEntry;
}

export const CLIENT_TTL_MS = 5 * 60_000;
type FetchLike = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const memo = new Map<CommunityKind, { at: number; p: Promise<unknown[]> }>();

export function fetchCommunity<K extends CommunityKind>(
  kind: K, fetchImpl: FetchLike | null = typeof fetch === 'function' ? (u) => fetch(u) : null, now: number = Date.now(),
): Promise<CommunityByKind[K][]> {
  const hit = memo.get(kind);
  if (hit && now - hit.at < CLIENT_TTL_MS) return hit.p as Promise<CommunityByKind[K][]>;
  const p = (async () => {
    if (!fetchImpl) return [];
    try {
      const res = await fetchImpl(`/api/v1/pipelines/community?kind=${kind}`);
      if (!res.ok) return [];
      const body = (await res.json()) as { entries?: unknown };
      return Array.isArray(body?.entries) ? body.entries : [];
    } catch { return []; }
  })();
  memo.set(kind, { at: now, p });
  return p as Promise<CommunityByKind[K][]>;
}

/** Tests only: forget every list. */
export function resetCommunityClient(): void { memo.clear(); }
