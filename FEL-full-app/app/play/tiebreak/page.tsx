import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { TiebreakLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function TiebreakPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <TiebreakLoader />;
}
