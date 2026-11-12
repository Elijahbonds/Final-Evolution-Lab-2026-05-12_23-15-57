import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { MODE_INFO } from '@/lib/game-data';
import { DEFAULT_FIRST_GAME, pathFor, welcomeHref } from '@/lib/onboarding/firstRun';
import { firstPlaybookCard } from '@/lib/onboarding/welcomeData';
import { FirstWin } from '@/components/onboarding/first-win';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Welcome — Final Evolution Lab', robots: { index: false } };

/**
 * /welcome — ONB-02: the guided first win for the path a new account picked (lib/onboarding/firstWin.ts). Sign-up lands
 * here for train, learn, teach and create; play opens its game directly. Signed-in only. Teach is for verified adults:
 * anyone else asking for it is shown train (lib/onboarding/firstRun.ts pathFor), and the picker holds it.
 */
export default async function WelcomePage({ searchParams }: { searchParams: { path?: string } }) {
  const session = await getServerSession(authOptions);
  const asked = typeof searchParams?.path === 'string' ? searchParams.path : null;
  if (!session) redirect(loginPath(asked ? welcomeHref(pathFor(asked, { adult: true })) : '/welcome'));
  const userId = (session.user as { id?: string } | undefined)?.id;
  const adult = userId ? verifiedAdult(await readDobYear(prisma, userId, 'welcome_page')) : false;
  const path = pathFor(asked, { adult });
  return (
    <div className="min-h-screen bg-[#050505]">
      <FirstWin
        path={path}
        adult={adult}
        card={firstPlaybookCard()}
        gameHref={MODE_INFO[DEFAULT_FIRST_GAME]?.href ?? '/play'}
        gameName={MODE_INFO[DEFAULT_FIRST_GAME]?.name ?? 'the dunk contest'}
      />
    </div>
  );
}
