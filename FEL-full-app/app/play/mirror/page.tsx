import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { youthGateFor } from '@/lib/mirror/screenCorrectives';
import { MirrorHarness } from './_components/mirror-harness';
import { HealthIntakeGate } from './_components/health-intake-gate';
import { GuardianConsentGate } from './_components/guardian-consent-gate';

export const dynamic = 'force-dynamic';

// Neuro-Mechanic Mirror (v1). Client-side biomechanical coaching overlay gated to
// a single movement pattern (split-stance press/row). Camera + pose run entirely
// in the browser; nothing is uploaded. See lib/babylon/nexus/neuro-mirror/.
export default async function MirrorPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  // YOUTH RULES (MIRROR-COACH P3 review, 2026-09-26; PLAN item 9, owner decisions #6, #20): the screen's written
  // corrective blocks are off under 18 or with no birth year on file. A read that fails is no birth year — youth rules.
  const userId = (session.user as { id?: string } | undefined)?.id;
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null)
    : null;
  // Standard chrome — a menu screen with no header/nav is a dead end.
  // MIRROR-COACH P5 (2026-09-29): two gates in front of the session, HealthIntakeGate outermost. Owner decision #6
  // ("guardian consent before the Mirror") is about the camera/pose session itself — GuardianConsentGate sits
  // directly in front of MirrorHarness, never reaching it without an accepted consent. It comes AFTER the intake,
  // not before: intake is the ONLY place a brand-new account with no dobYear on file yet gets to answer its birth
  // year (lib/health/intake.ts birth_year question, written to User.dobYear when blank). Putting the guardian gate
  // first would ask every adult who simply hasn't answered that question yet to "ask a parent or guardian" before
  // they ever get the chance to say they don't need one — a real adult should never see that screen. A genuine minor
  // still meets the guardian gate before MirrorHarness either way, whether or not they answer the intake's birth
  // year question (decision #20: skipping it still reads as a minor).
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <HealthIntakeGate>
        <GuardianConsentGate>
          <MirrorHarness youth={youthGateFor(user?.dobYear)} />
        </GuardianConsentGate>
      </HealthIntakeGate>
    </div>
  );
}
