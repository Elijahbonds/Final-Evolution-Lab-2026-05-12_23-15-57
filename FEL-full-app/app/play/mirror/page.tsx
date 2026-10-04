import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { youthGateFor } from '@/lib/mirror/screenCorrectives';
import { isHardStopped, latestIntake, needsIntake } from '@/lib/health/intake';
import { canSaveScanNumbers, logGateFailure } from '@/lib/privacy/scanSaveGate';
import { canWriteHealthData } from '@/lib/privacy/healthWriteGate';
import { MirrorHarness } from './_components/mirror-harness';
import { HealthIntakeGate } from './_components/health-intake-gate';
import { UNKNOWN_LOCAL_STATUS, type LocalIntakeStatus } from './_components/intake-refusal';

export const dynamic = 'force-dynamic';

/** One gate's answer, or false: a throw or a rejection never 500s this page (AM 19:47 PT), it just saves nothing. */
async function gateOrFalse(userId: string | undefined, gate: (userId: string) => Promise<boolean>, event: string): Promise<boolean> {
  if (!userId) return false;
  try {
    return (await gate(userId)) === true;
  } catch (e) {
    logGateFailure(event, e);
    return false;
  }
}

// Neuro-Mechanic Mirror (v1). Client-side biomechanical coaching overlay gated to
// a single movement pattern (split-stance press/row). Camera + pose run entirely
// in the browser; nothing is uploaded. See lib/babylon/nexus/neuro-mirror/.
export default async function MirrorPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/play/mirror'));
  // YOUTH RULES (MIRROR-COACH P3 review, 2026-09-26; PLAN item 9, owner decisions #6, #20): the screen's written
  // corrective blocks are off under 18 or with no birth year on file. A read that fails is no birth year — youth rules.
  const userId = (session.user as { id?: string } | undefined)?.id;
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null)
    : null;
  // WHO CAN SAVE (R-HEALTH-CLIENT, 2026-09-30; FE PM 19:38, 19:53 PT): asked ONCE, here, on the server — the client never
  // asks. Mirror saves follow canSaveScanNumbers (the database's dobYear verified 18+ AND opted in); the intake's saves
  // follow canWriteHealthData (verified 18+, no opt-in part: the intake has its own health_data consent screen). Both
  // read only the User row, and any error answers false: the page still renders, and saves nothing.
  const [canSaveScan, canWriteHealth] = await Promise.all([
    gateOrFalse(userId, (id) => canSaveScanNumbers(prisma, id), 'mirror_page_can_save_failed'),
    gateOrFalse(userId, (id) => canWriteHealthData(prisma, id), 'mirror_page_health_write_failed'),
  ]);
  // The browser-only intake's starting point, read here so that path sends no request at all: is an intake due, and
  // does a stored one still stop (HealthIntake, a p5 table)? No user or a failed read → due, and nothing stops.
  let localStatus: LocalIntakeStatus = UNKNOWN_LOCAL_STATUS;
  if (!canWriteHealth && userId) {
    try {
      const latest = await latestIntake(prisma, userId);
      localStatus = { intakeDue: needsIntake(latest), storedHardStop: isHardStopped(latest) };
    } catch (e) {
      logGateFailure('mirror_page_intake_status_failed', e);
    }
  }
  // Standard chrome — a menu screen with no header/nav is a dead end.
  // THE MIRROR RUNS ON THE DEVICE FOR EVERYONE (R-HEALTH-CLIENT; FE PM 19:38 PT; Elijah 2026-09-29 2:40 PM PT: the guardian
  // path is gone). The intake screen is the only gate in front of it: a red flag stops, none continues. What gets SAVED is
  // decided per kind: the intake's answers by canWriteHealth (a verified adult who agrees on its consent screen), the
  // Mirror's results by canSaveScan (a verified adult who has opted in). Everyone else runs both in page memory and sends
  // nothing. MIRROR-COACH P5's GuardianConsentGate is no longer in this flow; the component stays, for /consent/guardian.
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <HealthIntakeGate canWriteHealth={canWriteHealth} localStatus={localStatus}>
        <MirrorHarness youth={youthGateFor(user?.dobYear)} canSaveScan={canSaveScan} />
      </HealthIntakeGate>
    </div>
  );
}
