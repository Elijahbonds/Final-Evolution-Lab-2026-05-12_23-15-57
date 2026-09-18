import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { MixedCombatLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function MixedCombatPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <MixedCombatLoader />;
}
