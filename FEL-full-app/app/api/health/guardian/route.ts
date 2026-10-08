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
 *
 * MIRROR-COACH P6 FIX (2026-09-29, code review — "the minor is handed the camp token"): "the token is theirs" was only
 * true of a request the athlete made for THEMSELVES. A certified facilitator can request consent for a mentee too
 * (components/camp/camp-view.tsx "Request consent (copies the link)" POSTs with menteeId), and that row is a CAMP row
 * (selfRequested false), whose accept is P5's unchanged token-is-the-credential GET — it accepts signed out. This
 * route used to return the newest pending row's token whoever asked for it, so the minor's own Mirror gate showed
 * the coach's camp link ("Waiting on …" + /consent/guardian/<campToken>), the minor opened it in a private window,
 * tapped Accept, and canUse('mirror' | 'pain_checkin') unlocked. Measured by the route test that seeds a facilitator
 * row (tests/camp/consent-guardian-residual.test.ts). Now the token is returned ONLY for a player request
 * (selfRequested) — the one the minor already holds, whose accept needs an adult's own signed-in account. A pending
 * camp request answers `pending` with `token: null, by: 'coach'`: the gate says the coach or camp has the link and
 * offers the athlete's own request instead. The facilitator's link never leaves the facilitator's screen.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return bad('unauthorized', 401);

  const [user, rows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }),
    prisma.guardianConsent.findMany({
      where: { menteeId: userId },
      orderBy: { requestedAt: 'desc' },
      select: { token: true, guardianName: true, requestedAt: true, acceptedAt: true, revokedAt: true, selfRequested: true },
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
    // a player request hands back its own link; a coach's or camp's never does (see the P6 fix above)
    pending: status === 'pending' && latest
      ? latest.selfRequested
        ? { token: latest.token, guardianName: latest.guardianName, requestedAt: latest.requestedAt, by: 'you' as const }
        : { token: null, guardianName: latest.guardianName, requestedAt: latest.requestedAt, by: 'coach' as const }
      : null,
  });
}
