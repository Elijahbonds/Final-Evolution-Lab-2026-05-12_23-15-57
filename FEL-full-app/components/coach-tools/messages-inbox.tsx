'use client';
// MessagesInbox — every athlete's thread, one tap each, unread first (COACH-TOOLS-EASY, 2026-11-02). The order and the
// unread seam are lib/coach-tools/inbox.ts; the thread itself is the athlete sheet's (it opens on Thread).
import { ChevronRight } from 'lucide-react';
import { LOOK, initials } from '@/components/coach/coach-queue/look';
import { INBOX_COPY, inboxRows, type InboxAthlete } from '@/lib/coach-tools/inbox';
import type { UnreadView } from '@/lib/coach/messageReadsView';

export function MessagesInbox({ roster, unread, onOpen }: { roster: readonly InboxAthlete[]; unread: UnreadView | null; onOpen: (athleteId: string) => void }) {
  const rows = inboxRows(roster, unread);
  return (
    <ul className="flex flex-col" data-messages-inbox>
      {rows.map((r) => (
        <li key={r.id}>
          <button type="button" className={LOOK.row} onClick={() => onOpen(r.id)} disabled={!r.programId} data-inbox-row={r.id} data-unread={r.unread ?? ''}>
            <span className="flex min-w-0 items-center gap-3">
              <span className={`${LOOK.avatar} shrink-0`} aria-hidden>{initials(r.name)}</span>
              <span className="min-w-0">
                <span className={`${LOOK.name} block truncate`}>{r.name}</span>
                {!r.programId ? <span className={`${LOOK.quiet} block`}>{INBOX_COPY.noThread}</span> : null}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {r.unread ? <span className="rounded-full bg-fel-cyan px-2 py-0.5 text-[14px] font-bold text-black" data-inbox-unread>{INBOX_COPY.newCount(r.unread)}</span> : null}
              <ChevronRight className="h-5 w-5 text-fel-dim" aria-hidden />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
