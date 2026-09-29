export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId, bad } from '@/lib/camp/server';
import { needsGuardian, guardianStatus, type GuardianConsentLike } from '@/lib/consent/guardianGate';

/**
 * MIRROR-COACH P5 (2026-09-29): app/api/health/guardian — read-only status for the player-facing
 * "Ask a parent or guardian" screen (app/play/mirror/_components/guardian-consent-gate.tsx).
 *
 * REUSES THE CAMP FLOW rather than reimplementing it (PHASE-5 CONTRACT): the request itself is created by POSTing
 * straight to /api/v1/camp/consent (menteeId omitted → defaults to the signed-in user, that route's own rule), and
 * a guardian accepts it at GET /api/v1/camp/consent?token=… — neither is duplicated here. This route only ANSWERS
 * "where do I stand", which nothing before this phase needed to ask: every existing GuardianConsent read
 * (app/api/v1/camp/plans, /mentees, /mirror/assessment) only ever checked "is there an accepted one", never
 * distinguished none/pending/revoked for the athlete's OWN screen to explain back to them.
 *
 * The latest PENDING request's token is returned so a player who already asked and lost the link (closed the tab,
 * lost the DM) can reopen this screen and get the SAME accept link back rather than needing a facilitator to notice
 * and re-send one — the token is theirs; a guardianConsent row belongs to the mentee it names, and this route only
 * ever reads the signed-in user's own.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);

  const [user, rows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }),
    prisma.guardianConsent.findMany({
      where: { menteeId: userId },
      orderBy: { requestedAt: 'desc' },
      select: { token: true, guardianName: true, requestedAt: true, acceptedAt: true, revokedAt: true },
    }),
  ]);

  const consents: GuardianConsentLike[] = rows.map((r) => ({ requestedAt: r.requestedAt, acceptedAt: r.acceptedAt, revokedAt: r.revokedAt }));
  const status = guardianStatus(consents);
  // guardianStatus reads the most recently REQUESTED row; that is also the only one worth handing back a token for.
  const latest = rows[0] ?? null;

  return NextResponse.json({
    needsGuardian: needsGuardian(user?.dobYear ?? null),
    status,
    birthYear: user?.dobYear ?? null,
    pending: status === 'pending' && latest ? { token: latest.token, guardianName: latest.guardianName, requestedAt: latest.requestedAt } : null,
  });
}
