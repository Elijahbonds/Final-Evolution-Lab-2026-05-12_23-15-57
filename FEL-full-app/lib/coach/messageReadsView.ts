// lib/coach/messageReadsView.ts — COACH-AI Phase 8 (2026-10-07): what the two thread views show from the read markers
// (lib/coach/messageReads.ts is the server half). Browser-safe: no Prisma, no next/server.
//
// AN UNKNOWN IS NOT A ZERO. Before the pending SQL is applied the routes say `available: false` / `reads: false` and the
// messages carry no `unread` field: every function here then answers null (show nothing), never "0 new" or "Seen".

export interface ThreadMsg { id: string; body: string; mine: boolean; fromCoach: boolean; readAt?: string | null; unread?: boolean }

export type UnreadView = { available: false } | { available: true; total: number; byProgram: Record<string, number> };

/** "N new" for one program's chip, or null (none, or the markers are not on). */
export function unreadBadge(counts: UnreadView | null | undefined, programId: string): number | null {
  if (!counts || !counts.available) return null;
  const n = counts.byProgram[programId] ?? 0;
  return n > 0 ? n : null;
}

/** Messages from the other side that were unread when the thread was opened, or null when there are none / no markers. */
export function unreadInThread(thread: readonly ThreadMsg[]): number | null {
  const n = thread.filter((m) => m.unread === true).length;
  return n > 0 ? n : null;
}

/** The id of my newest message, when the other side has read it ("Seen" goes under it), else null. */
export function seenMessageId(thread: readonly ThreadMsg[]): string | null {
  for (let i = thread.length - 1; i >= 0; i--) {
    if (thread[i].mine) return thread[i].readAt ? thread[i].id : null;
  }
  return null;
}

/** The counts with one program's unread cleared (after its thread was opened and marked). */
export function clearProgram(counts: UnreadView | null, programId: string): UnreadView | null {
  if (!counts || !counts.available || !counts.byProgram[programId]) return counts;
  const { [programId]: gone, ...rest } = counts.byProgram;
  return { available: true, total: Math.max(0, counts.total - gone), byProgram: rest };
}

/** Opened a thread with unread messages in it: tell the server. Resolves true when it marked something. Never throws. */
export async function markReadIfNeeded(endpoint: string, programId: string, thread: readonly ThreadMsg[]): Promise<boolean> {
  if (!unreadInThread(thread)) return false;
  try {
    const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programId }) });
    if (!r.ok) return false;
    const j = (await r.json().catch(() => null)) as { available?: boolean } | null;
    return j?.available === true;
  } catch {
    return false;
  }
}
