export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { composeProfile, HISTORY_GAMES_TAKE } from '@/lib/camp/profile';
import { clientCoverage } from '@/lib/coach/coverage';
import { LOGGED_WORK_WHERE } from '@/lib/coach/setLog';

/** GET /api/coach/roster — every client I coach, with their card (if published), PRQ and the deltas since their program began (lane 5 S3). */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);
  // The programs carry their exercises' pattern tags for the coverage strip (MIRROR-COACH P2): one read, not one per
  // client. ProgramExercise.pattern is nullable — null = never tagged — and lib/coach/coverage.ts keeps it that way.
  const programs = await prisma.coachingProgram.findMany({
    where: { coachId: userId }, orderBy: { startDate: 'desc' },
    select: {
      id: true, name: true, clientId: true, startDate: true, isActive: true,
      blocks: { select: { sessions: { select: { id: true, exercises: { select: { id: true, exerciseId: true, sets: true, section: true, exercise: { select: { pattern: true } } } } } } } },
    },
  });
  // A CLIENT EXISTS BEFORE THEIR PROGRAMMING DOES (2026-09-19). This route used to derive the roster from
  // CoachingProgram rows alone, so an athlete who accepted an invite this morning was invisible until the coach had
  // already written them a program — which is backwards, because you write the program for somebody who is already
  // there. The roster is now the union: everyone on CoachClient, plus anyone with a program (which keeps every
  // relationship that predates the invite table working, untouched and unmigrated).
  const linked = await prisma.coachClient.findMany({
    where: { coachId: userId, endedAt: null },
    select: { clientId: true, createdAt: true, via: true },
  });
  const clientIds = [...new Set([...linked.map((l) => l.clientId), ...programs.map((p) => p.clientId)])];
  const [users, cards, completed] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, email: true } }),
    prisma.creatorCard.findMany({ where: { ownerId: { in: clientIds } }, select: { ownerId: true, slug: true, published: true, rarity: true, prq: true, topScore: true, wins: true } }),
    // COACHED SESSIONS (MIRROR-COACH P2, 2026-09-25; F8 of the P1 baseline): every completed ClientSession in this
    // coach's programs. The roster's only count was `sessions` = GameSession rows (composeProfile history.sessions),
    // so a client with six coached sessions read "0 sessions" — P1 relabelled it "games"; this adds the other number.
    // + which of each session's exercises have logged WORK (P2 review, 2026-09-26): the coverage strip counts a pattern
    // done only when its exercise was logged, not because the session holding it was marked complete
    prisma.clientSession.findMany({ where: { programId: { in: programs.map((p) => p.id) }, completedAt: { not: null } }, select: { clientId: true, sessionId: true, completedAt: true, exerciseLogs: { where: LOGGED_WORK_WHERE, select: { sessionExerciseId: true } } } }),
  ]);
  const completedRows = completed.map((c) => ({ ...c, loggedExerciseIds: c.exerciseLogs ? c.exerciseLogs.map((l) => l.sessionExerciseId) : null }));
  const now = Date.now();
  const roster = await Promise.all(clientIds.map(async (cid) => {
    const first = [...programs].filter((p) => p.clientId === cid).sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
    const profile = await composeProfile(cid, first?.startDate ?? null);
    const u = users.find((x) => x.id === cid); const card = cards.find((c) => c.ownerId === cid) ?? null;
    return {
      clientId: cid, name: u?.name ?? u?.email?.split('@')[0] ?? 'player',
      programs: programs.filter((p) => p.clientId === cid).map((p) => ({ id: p.id, name: p.name, isActive: p.isActive })),
      card: card ? { slug: card.slug, published: card.published, rarity: card.rarity, prq: card.prq, topScore: card.topScore, wins: card.wins } : null,
      // a client with no programming yet is NEW, not broken — the UI shows them first so the coach writes their block
      joinedAt: linked.find((l) => l.clientId === cid)?.createdAt ?? null,
      awaitingProgram: !programs.some((p) => p.clientId === cid),
      prq: profile.prq.measured && Object.keys(profile.prq.measured).length ? profile.prq.measured : profile.prq.card,
      prqDelta: profile.prq.delta, wins: profile.history.wins, resiliency: profile.resiliency,
      // TWO NUMBERS, NEVER ONE (MIRROR-COACH P2): coached sessions done for this coach, and games since the first
      // program began. `sessions` is kept, as the games count it always was, for older readers.
      sessions: profile.history.sessions,
      games: profile.history.sessions,
      gamesAtCap: profile.history.sessions >= HISTORY_GAMES_TAKE,
      coachedSessions: completed.filter((c) => c.clientId === cid).length,
      // the six-pattern strip: squat, hinge, lunge, push, pull, carry over the last 7 days (lib/coach/coverage.ts);
      // null when this coach has no active program for the client
      coverage: clientCoverage(programs, completedRows, cid, now),
    };
  }));
  return NextResponse.json({ roster });
}
