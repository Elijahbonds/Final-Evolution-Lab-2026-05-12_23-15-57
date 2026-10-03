import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { OneVOneLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function OneVOnePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?next=%2Fplay%2Fonevone');
  return <OneVOneLoader />;
}
