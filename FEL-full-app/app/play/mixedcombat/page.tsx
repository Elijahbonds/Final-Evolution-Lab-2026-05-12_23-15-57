import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginRedirect, type LoginRedirectSearchParams } from '@/lib/auth/safeNext';
import { MixedCombatLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function MixedCombatPage({ searchParams }: { searchParams?: LoginRedirectSearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirect('/play/mixedcombat', searchParams));
  return <MixedCombatLoader />;
}
