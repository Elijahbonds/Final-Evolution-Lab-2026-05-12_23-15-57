// PLAT-P06 (2026-10-28): the coached athlete's loop over one in-memory store — lib/coach/todayMemoryDb.ts (Today's tables,
// refusing columns the schema does not have) plus the program thread (ProgramMessage) and the two reads the coach's
// reply makes (lib/coach/coachReply.ts): the athlete's newest completed session of a program, and the coach's newest
// message since. Used by tests/coach-athlete-loop/*: the REAL routes run behind a vi.mock of @/lib/db.
import { todayMemoryDb, type Row, type TodayStore } from '@/lib/coach/todayMemoryDb';

export interface LoopStore extends TodayStore { messages: Row[] }

const time = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v) : 0);
const pick = (row: Row, select?: Row): Row => (select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]])) : { ...row });

/** ProgramMessage columns a write may name (prisma/schema.prisma model ProgramMessage, less id / createdAt / readAt). */
export const PROGRAM_MESSAGE_WRITABLE = ['programId', 'authorId', 'body'] as const;

export function athleteLoopDb(s: LoopStore) {
  const base = todayMemoryDb(s);
  let last = 0;
  // the thread is written on the wall clock, like the log route's completedAt (todayServer.ts saveClientLog: new Date()),
  // one millisecond apart at least, so "after the session" is never a tie
  const stamp = () => { last = Math.max(Date.now(), last + 1); return new Date(last); };
  return {
    ...base,
    clientSession: {
      ...base.clientSession,
      // the reply's read: no sessionId — this athlete's newest COMPLETED session of the program
      findFirst: async (a: Row) => {
        if (a.where.sessionId !== undefined) return base.clientSession.findFirst(a);
        const hit = s.cs.filter((c) => c.programId === a.where.programId && c.clientId === a.where.clientId && c.completedAt != null)
          .sort((x, y) => time(y.completedAt) - time(x.completedAt))[0];
        return hit ? pick(hit, a.select) : null;
      },
    },
    programMessage: {
      create: async (a: Row) => {
        for (const k of Object.keys(a.data)) if (!(PROGRAM_MESSAGE_WRITABLE as readonly string[]).includes(k)) throw new Error(`Unknown argument \`${k}\``);
        const m = { id: `msg-${++s.seq}`, readAt: null, ...a.data, createdAt: stamp() };
        s.messages.push(m);
        return { ...m };
      },
      findMany: async (a: Row) => {
        const w = a.where;
        return s.messages
          .filter((m) => m.programId === w.programId && (w.authorId === undefined || m.authorId === w.authorId) && (!w.createdAt?.gt || time(m.createdAt) > time(w.createdAt.gt)))
          .sort((x, y) => (a.orderBy?.createdAt === 'asc' ? 1 : -1) * (time(x.createdAt) - time(y.createdAt)))
          .slice(0, a.take ?? Infinity)
          .map((m) => pick(m, a.select));
      },
    },
  };
}
