import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { SnowboardLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function SnowboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <SnowboardLoader />;
}
