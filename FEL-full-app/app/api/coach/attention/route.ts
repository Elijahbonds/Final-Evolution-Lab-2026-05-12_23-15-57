export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { attentionBoard, gradedScreenTimes, type ClientFacts } from '@/lib/coach/attention';
import { LOGGED_WORK_WHERE } from '@/lib/coach/setLog';
import { MIRROR_SCREEN_KIND } from '@/lib/mirror/screen';

/**
 * GET /api/coach/attention — who on my roster needs me today, and who is drifting.
 *
 * The judgement lives in lib/coach/{triage,compliance}.ts and the adapter in lib/coach/attention.ts; this route
 * only fetches. Every query is batched across the whole roster rather than run per client: a coach with fifty
 * athletes is the case this feature exists for, and a per-client loop would be fifty round trips to answer one
 * screen.
 */
const HISTORY_DAYS = 60;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);

  // The roster is the same union the /roster route uses: a client exists before their programming does.
  const [programs, linked] = await Promise.all([
    prisma.coachingProgram.findMany({ where: { coachId: userId }, select: { id: true, clientId: true, createdAt: true } }),
    prisma.coachClient.findMany({ where: { coachId: userId, endedAt: null }, select: { clientId: true, createdAt: true } }),
  ]);
  const clientIds = [...new Set([...linked.map((l) => l.clientId), ...programs.map((p) => p.clientId)])];
  if (!clientIds.length) return NextResponse.json({ triage: { flags: [], totalFlagged: 0, clear: 0, summary: 'No athletes on your roster yet.' }, drift: [], headline: null });
  const programIds = programs.map((p) => p.id);

  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
  // COACHED WORK AND GAMES, READ APART (MIRROR-COACH P2, 2026-09-25). P1 fixed this route reading GameSession only (a
  // client with six coached sessions and no games read "stalled", "Has never completed a session.") by adding the
  // completed ClientSessions to the same list as the games — so a client playing a game a day and doing none of the
  // program read "steady". Now:
  //   · coached sessions = completed ClientSessions in THIS coach's programs (compliance is "are they doing the work I
  //     wrote"; another coach's program is not this coach's to chase);
  //   · coached work = ExerciseLog and SetLog rows saved on those programs' sessions, completed or not — a client who
  //     logged every set and never tapped "complete" trained;
  //   · games = GameSession rows, a separate signal the board names but never counts as a session;
  //   · Mirror screens = WorkoutScan rows of kind mirror_screen, which triage now counts as current data (F7).
  //
  // MIRROR-COACH P2 review (2026-09-26), two reads narrowed:
  //   · an ExerciseLog counts as coached work only when something is IN it (LOGGED_WORK_WHERE: a set, or a typed
  //     number). Today's Save wrote an empty row for every untouched exercise, so a client who only saved a note read
  //     as training ("stalled" → "steady"; triage's stale-scan hidden for 14 days). SetLog rows are work by definition.
  //   · a Mirror screen counts only when it is GRADED (lib/coach/attention.ts gradedScreenTimes). Every screen stored
  //     until P3 is ungraded, and an ungraded screen is not something to program from.
  const inMyPrograms = { programId: { in: programIds } };
  const [users, games, coached, logs, sets, prqRows, scans, screens] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, email: true } }),
    prisma.gameSession.findMany({ where: { userId: { in: clientIds }, createdAt: { gte: since } }, select: { userId: true, createdAt: true } }),
    prisma.clientSession.findMany({ where: { ...inMyPrograms, clientId: { in: clientIds }, completedAt: { gte: since } }, select: { clientId: true, completedAt: true } }),
    prisma.exerciseLog.findMany({ where: { clientSession: inMyPrograms, createdAt: { gte: since }, ...LOGGED_WORK_WHERE }, select: { createdAt: true, clientSession: { select: { clientId: true } } } }),
    prisma.setLog.findMany({ where: { exerciseLog: { clientSession: inMyPrograms }, createdAt: { gte: since } }, select: { createdAt: true, exerciseLog: { select: { clientSession: { select: { clientId: true } } } } } }),
    prisma.prqEntry.findMany({ where: { userId: { in: clientIds } }, select: { userId: true, attribute: true, value: true, measuredAt: true }, orderBy: { measuredAt: 'asc' } }),
    prisma.workoutScan.findMany({ where: { userId: { in: clientIds } }, select: { userId: true, kind: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    // the screens' results, read apart so the scan list above does not carry every row's metrics
    prisma.workoutScan.findMany({ where: { userId: { in: clientIds }, kind: MIRROR_SCREEN_KIND }, select: { userId: true, createdAt: true, metrics: true }, orderBy: { createdAt: 'desc' } }),
  ]);

  const by = <T,>(rows: readonly T[], key: (r: T) => string) => {
    const m = new Map<string, T[]>();
    for (const r of rows) { const k = key(r); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
    return m;
  };
  const gamesBy = by(games, (s) => s.userId);
  const coachedBy = by(coached, (s) => s.clientId);
  const logsBy = by([
    ...logs.map((l) => ({ clientId: l.clientSession.clientId, at: l.createdAt })),
    ...sets.map((l) => ({ clientId: l.exerciseLog.clientSession.clientId, at: l.createdAt })),
  ], (l) => l.clientId);
  const prqBy = by(prqRows, (p) => p.userId);
  const scansBy = by(scans, (s) => s.userId);
  const screensBy = by(screens, (s) => s.userId);
  // P2 review: a client added only through a program (a camp plan, no CoachClient row) had no join date, so no grace:
  // assigned a program today, they read "stalled". The earliest of this coach's programs for them stands in.
  const firstProgramMs = (cid: string) => {
    const t = programs.filter((p) => p.clientId === cid).map((p) => p.createdAt.getTime());
    return t.length ? Math.min(...t) : null;
  };

  const facts: ClientFacts[] = clientIds.map((cid) => {
    const u = users.find((x) => x.id === cid);
    const coachedTimes = (coachedBy.get(cid) ?? []).flatMap((s) => (s.completedAt ? [s.completedAt.getTime()] : []));
    const loggedTimes = (logsBy.get(cid) ?? []).map((l) => l.at.getTime());
    const gameTimes = (gamesBy.get(cid) ?? []).map((s) => s.createdAt.getTime());
    const scanRows = scansBy.get(cid) ?? [];
    const scanTimes = scanRows.map((s) => s.createdAt.getTime());
    // "Active" is any sign of life, not only a finished session — a scan uploaded yesterday is not silence, and
    // neither is a game.
    const all = [...coachedTimes, ...loggedTimes, ...gameTimes, ...scanTimes];
    return {
      clientId: cid,
      name: u?.name ?? u?.email?.split('@')[0] ?? 'player',
      joinedAtMs: linked.find((l) => l.clientId === cid)?.createdAt.getTime() ?? firstProgramMs(cid),
      hasProgram: programs.some((p) => p.clientId === cid),
      sessionTimesMs: coachedTimes,
      loggedTimesMs: loggedTimes,
      gameTimesMs: gameTimes,
      screenTimesMs: gradedScreenTimes(screensBy.get(cid) ?? []),
      prq: (prqBy.get(cid) ?? []).map((p) => ({ attribute: p.attribute, value: p.value, measuredAtMs: p.measuredAt.getTime() })),
      lastActiveMs: all.length ? Math.max(...all) : null,
    };
  });

  return NextResponse.json(attentionBoard(facts, Date.now()));
}
