// lib/coach/coachReply.ts — PLAT-P06 (2026-10-28): the coach's reply, on top of the athlete's next session.
//
// The loop the owner asked for: the athlete trains, sends a set (or just logs), the coach answers from "Needs you today"
// (lib/coach/queue.ts: a reply, a cue on a filmed set, a nudge — every one is a ProgramMessage in the program's thread;
// or a comment on a logged exercise from the inbox), and the athlete's NEXT session opens with that answer on top.
//
// THE RULE: the coach's newest word since the athlete's last completed session of this program — a thread message the
// coach wrote, or a coach comment on a log — no older than REPLY_FRESH_DAYS. Once the athlete completes a session after
// it, it steps down (it stays in the thread, where it always was). Nothing new is stored: the reply is read from the rows
// the queue's buttons already write.
//
// Pure, and the reads (coachReplyFor) take the database as an argument like lib/coach/todayServer.ts, so the route test
// runs the real GET over an in-memory store. A read that fails is no reply: Today never breaks over this.

import type { TodayPayload } from './todayServer';

/** What GET /api/coach/me/today adds to loadToday's payload (lib/coach/todayExtras.ts), each only when it says something. */
export interface TodayExtras {
  reply: CoachReply | null;
  /** SessionExercise id → its demo loop, or null (the still pose). */
  clips: Record<string, string | null>;
  /** No program: whether a coach link is live (null: not known). */
  coached: boolean | null;
}

/** The payload Today reads: loadToday's, plus the extras. */
export type TodayPayloadPlus = TodayPayload & Partial<TodayExtras>;

/** A reply older than this is not "the reply to your last session" any more; it is just in the thread. (new) */
export const REPLY_FRESH_DAYS = 14;

export interface CoachReply {
  id: string;
  /** The coach's name, as Today names them. */
  from: string;
  body: string;
  /** ISO time it was written. */
  at: string;
  /** A thread message, or a comment on one logged exercise. */
  kind: 'message' | 'comment';
  /** The exercise a comment is on. */
  exercise: string | null;
}

export interface ReplyMessageRow { id: string; body: string; createdAt: Date | string }
export interface ReplyCommentRow { exercise: string; comment: string | null; at: Date | string | null }

const ms = (v: Date | string | null | undefined): number => (v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : NaN);

/** The reply to show, from the coach's newest message and comments, or null. */
export function pickCoachReply(i: {
  coachName: string; messages: readonly ReplyMessageRow[]; comments: readonly ReplyCommentRow[];
  since: Date | string | null; now: Date;
}): CoachReply | null {
  const floor = Math.max(Number.isFinite(ms(i.since)) ? ms(i.since) : -Infinity, i.now.getTime() - REPLY_FRESH_DAYS * 86_400_000);
  const out: CoachReply[] = [];
  for (const m of i.messages) {
    const t = ms(m.createdAt);
    const body = (m.body ?? '').trim();
    if (body && Number.isFinite(t) && t > floor) out.push({ id: `m:${m.id}`, from: i.coachName, body, at: new Date(t).toISOString(), kind: 'message', exercise: null });
  }
  for (const [k, c] of i.comments.entries()) {
    const t = ms(c.at);
    const body = (c.comment ?? '').trim();
    if (body && Number.isFinite(t) && t > floor) out.push({ id: `c:${k}:${t}`, from: i.coachName, body, at: new Date(t).toISOString(), kind: 'comment', exercise: c.exercise || null });
  }
  out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return out[0] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Prisma client or the in-memory test store
type ReplyDb = any;

export interface ReplyPayloadLike {
  program: { id: string; coachName: string } | null;
  today: unknown | null;
  recentComments: readonly ReplyCommentRow[];
}

/** The reply for today's payload: reads the program's coach, the last completed session and the coach's newest message. */
export async function coachReplyFor(db: ReplyDb, userId: string, payload: ReplyPayloadLike, now: Date = new Date()): Promise<CoachReply | null> {
  if (!payload.program || !payload.today) return null;
  try {
    const programId = payload.program.id;
    const p = await db.coachingProgram.findUnique({ where: { id: programId }, select: { coachId: true, clientId: true } });
    if (!p || p.clientId !== userId) return null;
    const last = await db.clientSession.findFirst({
      where: { programId, clientId: userId, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, select: { completedAt: true },
    }).catch(() => null);
    const since: Date | null = last?.completedAt ?? null;
    const messages: ReplyMessageRow[] = await db.programMessage.findMany({
      where: { programId, authorId: p.coachId, ...(since ? { createdAt: { gt: since } } : {}) },
      orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, body: true, createdAt: true },
    }).catch(() => []);
    return pickCoachReply({ coachName: payload.program.coachName, messages, comments: payload.recentComments, since, now });
  } catch {
    return null;
  }
}
