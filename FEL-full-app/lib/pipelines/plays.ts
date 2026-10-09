// lib/pipelines/plays.ts — PIPELINES: which community cards count plays, and the client's fire-and-forget report. Pure
// apart from the fetch it is handed.

/** A pack you played through, a routine you danced. (A music card's plays are the soundtrack's, counted there.) */
export const PLAYABLE_DISCIPLINES = ['scene', 'dance'] as const;
export const isPlayableDiscipline = (d: unknown): boolean => typeof d === 'string' && (PLAYABLE_DISCIPLINES as readonly string[]).includes(d);

type FetchLike = (url: string, init?: RequestInit) => Promise<unknown>;

/** Report one play. Never throws, never blocks a game: a failure is just an uncounted play. */
export function reportCommunityPlay(cardId: string, fetchImpl: FetchLike | null = typeof fetch === 'function' ? (u, i) => fetch(u, i) : null): void {
  if (!fetchImpl || !/^[A-Za-z0-9_-]{1,120}$/.test(cardId)) return;
  try {
    void Promise.resolve(fetchImpl('/api/v1/pipelines/play', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cardId }), keepalive: true,
    })).catch(() => { /* uncounted */ });
  } catch { /* uncounted */ }
}
