import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { BrainBrawlLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function BrainBrawlPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <BrainBrawlLoader />;
}
