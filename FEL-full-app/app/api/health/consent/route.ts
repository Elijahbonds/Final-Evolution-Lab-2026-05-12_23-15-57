// app/api/health/consent — MIRROR-COACH P5 (2026-09-29): the Health data section's own API.
//
// GET returns the settings page's whole view model in one call: whether health_data collection is currently opted
// in, and for every coach ACTIVELY on this athlete's roster (a live CoachClient row), whether that coach currently
// has a live coach_view grant. A coach whose relationship already ended is simply not in that list — see
// lib/health/consent.ts's own comment on why that read-side behaviour is not the same as revoking their grant.
//
// POST takes one action at a time and returns the same view model afterwards, so the page never has to guess what
// changed: 'grant'/'revoke' scope 'health_data' turns collection on/off for the whole account; 'grant'/'revoke'
// scope 'coach_view' (with a coachId) does the same for one named coach. 'erase' runs the narrow health-only erase
// (lib/prq-data-rights.ts's eraseHealthData) that Privacy §5 promises never touches a workout plan or PRQ history.
//
// THE LEDGER IS APPEND-ONLY (see schema.prisma's HealthConsent doc). A grant always INSERTS a new row; a revoke
// always UPDATEs every currently-live row of that scope (there should only ever be one, but this is defensive) to
// set revokedAt, never deletes it — consent history has to survive its own withdrawal to be auditable at all.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { buildHealthConsentView, activeHealthDataConsent, activeCoachViewConsent, canGrantCoachView, type ConsentRow } from '@/lib/health/consent';
import { grantHealthDataConsent } from '@/lib/health/intake';
import { eraseHealthData } from '@/lib/prq-data-rights';
import { canWriteHealthData, refuseHealthWrite } from '@/lib/privacy/healthWriteGate';

export const dynamic = 'force-dynamic';

async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

/** Every coach currently active on this athlete's roster, by name. Ended relationships are excluded on purpose. */
async function loadActiveCoaches(clientId: string) {
  const linked = await prisma.coachClient.findMany({
    where: { clientId, endedAt: null },
    select: { coachId: true, coach: { select: { name: true, email: true } } },
  });
  return linked.map((l) => ({ coachId: l.coachId, name: l.coach?.name || l.coach?.email || 'your coach' }));
}

/**
 * The whole response shape, every time — GET and every POST action return exactly this, never a subset. The page
 * does one `setView(json)` after each request (see components/profile-view.tsx's HealthDataSection), so a response
 * missing `counts` would read as `undefined` there rather than an explicit, honest zero.
 */
async function loadView(userId: string) {
  // MIRROR-COACH P6 (2026-09-29): readinessCheckIns counted too — the daily check-in is stored under this same
  // consent (lib/health/readiness.ts), so "what is stored" has to name it, and 'erase' below deletes it
  // (lib/prq-data-rights.ts eraseHealthData).
  // MIRROR-COACH P7 FIX (2026-09-29, review): breathLogs counted too — the Dial-Up Breath's use log is in the export and
  // both erases (lib/prq-data-rights.ts) and Privacy §5 names it, so "what is stored" and the erase toast name it as well.
  const [consents, coaches, healthIntakes, painCheckIns, readinessCheckIns, breathLogs] = await Promise.all([
    prisma.healthConsent.findMany({ where: { userId }, select: { scope: true, coachId: true, grantedAt: true, revokedAt: true } }),
    loadActiveCoaches(userId),
    prisma.healthIntake.count({ where: { userId } }),
    prisma.painCheckIn.count({ where: { userId } }),
    prisma.readinessCheckIn.count({ where: { userId } }),
    prisma.breathLog.count({ where: { userId } }),
  ]);
  return { ...buildHealthConsentView(consents as ConsentRow[], coaches), counts: { healthIntakes, painCheckIns, readinessCheckIns, breathLogs } };
}

/** GET /api/health/consent — the Health data section's current state. */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await loadView(userId));
}

const SCOPES = ['health_data', 'coach_view'] as const;
const ACTIONS = ['grant', 'revoke', 'erase'] as const;

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = ACTIONS.includes(body?.action) ? body.action : null;
  if (!action) return NextResponse.json({ error: 'bad_action' }, { status: 400 });

  if (action === 'erase') {
    const erased = await prisma.$transaction((tx) => eraseHealthData(tx, userId));
    const view = await loadView(userId);
    return NextResponse.json({ ...view, erased });
  }

  const scope = SCOPES.includes(body?.scope) ? body.scope : null;
  if (!scope) return NextResponse.json({ error: 'bad_scope' }, { status: 400 });
  const coachId = typeof body?.coachId === 'string' && body.coachId ? body.coachId : null;
  if (scope === 'coach_view' && !coachId) return NextResponse.json({ error: 'coach_id_required' }, { status: 400 });

  if (action === 'grant') {
    // TEEN-WRITE-BLOCK (FE PM 23:05 PT): both grants (d health_data, e coach_view) are health writes, verified 18+ only; revoke and erase stay open.
    if (!(await canWriteHealthData(prisma, userId))) return refuseHealthWrite();
    if (scope === 'health_data') {
      // Same helper the intake flow calls on submit (lib/health/intake.ts) — granting from Settings, without
      // redoing the whole intake, has to be the identical idempotent rule: already-active grants nothing new,
      // and a past revoke is never silently reactivated (a fresh row is written instead).
      await grantHealthDataConsent(prisma, userId);
    } else {
      // coach_view: only for a coach who is actually, currently, coaching this athlete, and only once the athlete
      // has opted health_data in at all (lib/health/consent.ts canGrantCoachView) — granting a view onto data that
      // was never opted into collecting would be backwards.
      const [isActiveCoach, rows] = await Promise.all([
        prisma.coachClient.findFirst({ where: { coachId, clientId: userId, endedAt: null }, select: { id: true } }),
        prisma.healthConsent.findMany({ where: { userId }, select: { scope: true, coachId: true, grantedAt: true, revokedAt: true } }),
      ]);
      const typed = rows as ConsentRow[];
      if (!canGrantCoachView(!!activeHealthDataConsent(typed), !!isActiveCoach)) {
        return NextResponse.json({ error: 'cannot_grant_coach_view' }, { status: 400 });
      }
      if (!activeCoachViewConsent(typed, coachId!)) {
        await prisma.healthConsent.create({ data: { userId, scope: 'coach_view', coachId, grantedAt: new Date() } });
      }
    }
  } else {
    // revoke: withdrawing health_data also revokes every live coach_view grant — a coach cannot keep a view onto
    // collection the athlete just turned off (Privacy §5: "withdrawing consent stops new collection immediately").
    const now = new Date();
    if (scope === 'health_data') {
      await prisma.healthConsent.updateMany({ where: { userId, scope: 'health_data', revokedAt: null }, data: { revokedAt: now } });
      await prisma.healthConsent.updateMany({ where: { userId, scope: 'coach_view', revokedAt: null }, data: { revokedAt: now } });
    } else {
      await prisma.healthConsent.updateMany({ where: { userId, scope: 'coach_view', coachId, revokedAt: null }, data: { revokedAt: now } });
    }
  }

  return NextResponse.json(await loadView(userId));
}
