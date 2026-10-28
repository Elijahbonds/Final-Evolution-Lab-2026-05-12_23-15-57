// CoachReplyCard — PLAT-P06 (2026-10-28): the coach's reply (lib/coach/coachReply.ts), the first card of Today and of the
// player while its ready count runs. The coach's words, as written; three lines at most on screen.
import type { CoachReply } from '@/lib/coach/coachReply';
import { COACH_PLAYER_COPY as C } from './coach-copy';
import { COACH_LOOK as L } from './coach-look';

export function CoachReplyCard({ reply }: { reply: CoachReply }) {
  return (
    <section className={L.reply} data-coach-reply={reply.kind} aria-label={C.replyFrom(reply.from)}>
      <p className={L.replyFrom}>{C.replyFrom(reply.from)}{reply.exercise ? ` · ${reply.exercise}` : ''}</p>
      <p className={L.replyBody}>{reply.body}</p>
    </section>
  );
}
