// lib/coach/todayExtras.ts — PLAT-P06 (2026-10-28): what GET /api/coach/me/today adds to loadToday's payload for the
// coached athlete's loop, without changing loadToday (lib/coach/todayServer.ts, read-only for this phase):
//
//   reply    the coach's newest word since the last completed session (lib/coach/coachReply.ts): Today's first card,
//            and the first card of the session player;
//   clips    each of today's exercises → the loop that IS its movement, so the player's demo plays with no further
//            request. The coach's catalogue row is matched to the library by name (lib/library/match.ts: exactly one
//            entry by its name or an alias, approved, youth-safe for a youth reader) and the loop is the library's own
//            choice (lib/library/demo.ts demoClipFor: structured tags, a whitelist). No match is no loop: the player shows
//            the still start pose, "Demo coming" — never another movement;
//   coached  with no program: whether a coach link is live, so Today says "No coach yet" only to someone with no coach.
//
// Every read is soft: a failure is "no reply", "no loop", "unknown" — the session itself always arrives as before.
import 'server-only';
import { coachReplyFor, type TodayExtras } from './coachReply';
import type { TodayPayload } from './todayServer';

export type ClipReader = (rows: readonly { id: string; name: string; youth: boolean }[]) => Promise<Record<string, string | null>>;

/** The real clip reader: the server's library index (never shipped to a browser). */
export const libraryClips: ClipReader = async (rows) => {
  if (!rows.length) return {};
  const [{ libraryState }, { matchLibraryByName }, { demoClipFor }] = await Promise.all([
    import('@/lib/library/server'), import('@/lib/library/match'), import('@/lib/library/demo'),
  ]);
  const { index } = await libraryState();
  const out: Record<string, string | null> = {};
  for (const r of rows) {
    const e = matchLibraryByName(index.docs, [r.name]);
    out[r.id] = e && e.review.status === 'approved' && (!r.youth || e.youthOk) ? demoClipFor(e) : null;
  }
  return out;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a Prisma client or the in-memory test store
type ExtrasDb = any;

/** The extras, each present only when it says something: a payload with none of them is exactly loadToday's. */
export async function todayExtras(db: ExtrasDb, userId: string, payload: TodayPayload, o: { now?: Date; clips?: ClipReader | null } = {}): Promise<Partial<TodayExtras>> {
  const now = o.now ?? new Date();
  const ex = payload.today?.session.exercises ?? [];
  const [reply, clips, coached] = await Promise.all([
    coachReplyFor(db, userId, payload, now),
    o.clips && ex.length ? o.clips(ex.map((e) => ({ id: e.id, name: e.name, youth: !!e.youthRules }))).catch(() => null) : Promise.resolve(null),
    payload.program ? Promise.resolve(null) : Promise.resolve()
      .then(() => db.coachClient?.findFirst?.({ where: { clientId: userId, endedAt: null }, select: { id: true } }))
      .then((r: unknown) => (r === undefined ? null : !!r), () => null),
  ]);
  return { ...(reply ? { reply } : {}), ...(clips ? { clips } : {}), ...(coached === null ? {} : { coached }) };
}
