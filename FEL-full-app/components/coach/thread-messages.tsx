'use client';
// COACH-AI Phase 8 (2026-10-07): the coach ↔ athlete thread, shared by the coach's Clients view and the athlete's
// Today view. Same bubbles as before; with the read markers on (lib/coach/messageReads.ts), a message that was unread
// when the thread opened has a gold edge, and "Seen" sits under my newest message once the other side has opened it.
// Without them it renders exactly what the two views rendered before.
import { seenMessageId, type ThreadMsg } from '@/lib/coach/messageReadsView';

export function ThreadMessages({ thread }: { thread: readonly ThreadMsg[] }) {
  const seen = seenMessageId(thread);
  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {thread.map((m) => (
        <div key={m.id}>
          <div
            data-unread={m.unread ? '' : undefined}
            className={`text-sm rounded-lg px-3 py-1.5 ${m.mine ? 'bg-[#00E5FF]/10 text-white ml-8' : 'bg-white/5 text-white/80 mr-8'}${m.unread ? ' border border-[#FFD700]/40' : ''}`}
          >
            {m.body}
          </div>
          {m.id === seen && <div data-seen className="text-right text-[10px] text-white/40 mt-0.5">Seen</div>}
        </div>
      ))}
    </div>
  );
}

/** "N new", or nothing. */
export function UnreadPill({ n }: { n: number | null }) {
  if (!n) return null;
  return <span data-unread-count={n} className="ml-1 rounded-full bg-[#FFD700]/15 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-[#FFD700]">{n} new</span>;
}
