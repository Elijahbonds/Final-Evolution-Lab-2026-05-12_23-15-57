import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readUserDob } from '@/lib/age/userDob';
import type { RawDb } from '@/lib/coach/pendingSchema';
import { accountAgeBand } from '@/lib/screen/accountAge';
import { AssessApp } from './_components/assess-app';
import type { ScreenKind } from '@/lib/screen/flow';

// Mirror Assess: the Quick Screen (lib/assess; FEL-MIRROR-REALTIME-SPEC phases 1–2). A new route beside the Mirror's
// existing tabs, which it does not touch. Open to anyone, with no sign-in: camera and pose run in the browser, there is
// no Babylon here, and nothing is saved to the server (SCREEN-SHIP A2-3): the results stay on the device. The QR code's
// stable address is /screen. ?run=jump or ?run=full is the button the person pressed, not a tracking tag.
export default async function MirrorAssessPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const raw = searchParams?.run;
  // VERTICAL-EASY: ?run=vertical is "Measure my vertical" (arms free); ?run=jump the hands-on-hips jump check
  const run: ScreenKind | null = raw === 'jump' || raw === 'vertical' || raw === 'full' ? raw : null;
  // EVERY-SCREEN P7 (owner, 2026-11-11): signed in with a full birth date on file → the age band comes from the account
  // and "How old are you?" is not asked (lib/screen/accountAge.ts). Signed out, or no full date: asked as before.
  const userId = (await getServerSession(authOptions).catch(() => null))?.user as { id?: string } | undefined;
  const dob = userId?.id ? await readUserDob(prisma as unknown as RawDb, userId.id).catch(() => null) : null;
  return <AssessApp initialRun={run} accountAge={accountAgeBand(dob)} />;
}
