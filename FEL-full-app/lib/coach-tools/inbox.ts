// inbox — the coach's Messages list (COACH-TOOLS-EASY, 2026-11-02; owner: "All tools need to be accessible, easy to
// use"). There was no list of threads: messaging an athlete who was not in "Needs you" took the avatar, the Week tab,
// the Thread tab, then typing. This orders the roster for one tap into a thread: unread first, then by name.
//
// THE UNREAD SEAM. Unread counts come from the existing read markers (lib/coach/messageReads.ts, COACH-AI phase 8),
// which need their pending SQL. Until it is applied /api/coach/messages/unread answers { available: false } and this
// shows NO count at all — an unknown is never shown as 0 — and the list is simply by name. No new table.
//
// Pure.
import type { UnreadView } from '@/lib/coach/messageReadsView';

export interface InboxAthlete { id: string; name: string; programId: string | null }
export interface InboxRow extends InboxAthlete {
  /** Unread messages from them, or null when the read markers are not on (or they have no thread). */
  unread: number | null;
}

export function unreadFor(view: UnreadView | null | undefined, programId: string | null): number | null {
  if (!view || !view.available || !programId) return null;
  return view.byProgram[programId] ?? 0;
}

/** Athletes with a thread first (unread first, most unread first, then A–Z); athletes with no program yet last. */
export function inboxRows(roster: readonly InboxAthlete[], view: UnreadView | null | undefined): InboxRow[] {
  const rows = roster.map((a) => ({ ...a, unread: unreadFor(view, a.programId) }));
  return rows.sort((a, b) =>
    Number(!a.programId) - Number(!b.programId) || (b.unread ?? 0) - (a.unread ?? 0) || a.name.localeCompare(b.name));
}

/** The sheet opens where the work is: on the thread when they have written and the coach has not read it. */
export const sheetTabFor = (unread: number | null): 'thread' | 'week' => (unread && unread > 0 ? 'thread' : 'week');

export const INBOX_COPY = {
  title: 'Messages',
  noThread: 'A thread starts with their first program.',
  newCount: (n: number) => (n === 1 ? '1 new' : `${n} new`),
} as const;
