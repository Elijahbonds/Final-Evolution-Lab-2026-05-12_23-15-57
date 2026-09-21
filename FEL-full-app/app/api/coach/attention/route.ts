export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { attentionBoard, type ClientFacts } from '@/lib/coach/attention';

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
    prisma.coachingProgram.findMany({ where: { coachId: userId }, select: { clientId: true } }),
    prisma.coachClient.findMany({ where: { coachId: userId, endedAt: null }, select: { clientId: true, createdAt: true } }),
  ]);
  const clientIds = [...new Set([...linked.map((l) => l.clientId), ...programs.map((p) => p.clientId)])];
  if (!clientIds.length) return NextResponse.json({ triage: { flags: [], totalFlagged: 0, clear: 0, summary: 'No athletes on your roster yet.' }, drift: [], headline: null });

  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
  const [users, sessions, prqRows, scans] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, email: true } }),
    prisma.gameSession.findMany({ where: { userId: { in: clientIds }, createdAt: { gte: since } }, select: { userId: true, createdAt: true } }),
    prisma.prqEntry.findMany({ where: { userId: { in: clientIds } }, select: { userId: true, attribute: true, value: true, measuredAt: true }, orderBy: { measuredAt: 'asc' } }),
    prisma.workoutScan.findMany({ where: { userId: { in: clientIds } }, select: { userId: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
  ]);

  const by = <T,>(rows: readonly T[], key: (r: T) => string) => {
    const m = new Map<string, T[]>();
    for (const r of rows) { const k = key(r); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
    return m;
  };
  const sessionsBy = by(sessions, (s) => s.userId);
  const prqBy = by(prqRows, (p) => p.userId);
  const scansBy = by(scans, (s) => s.userId);

  const facts: ClientFacts[] = clientIds.map((cid) => {
    const u = users.find((x) => x.id === cid);
    const sess = (sessionsBy.get(cid) ?? []).map((s) => s.createdAt.getTime());
    const scanTimes = (scansBy.get(cid) ?? []).map((s) => s.createdAt.getTime());
    // "Active" is any sign of life, not only a finished session — a scan uploaded yesterday is not silence.
    const lastActive = [...sess, ...scanTimes].sort((a, b) => b - a)[0] ?? null;
    return {
      clientId: cid,
      name: u?.name ?? u?.email?.split('@')[0] ?? 'player',
      joinedAtMs: linked.find((l) => l.clientId === cid)?.createdAt.getTime() ?? null,
      hasProgram: programs.some((p) => p.clientId === cid),
      sessionTimesMs: sess,
      prq: (prqBy.get(cid) ?? []).map((p) => ({ attribute: p.attribute, value: p.value, measuredAtMs: p.measuredAt.getTime() })),
      lastActiveMs: lastActive,
    };
  });

  return NextResponse.json(attentionBoard(facts, Date.now()));
}
