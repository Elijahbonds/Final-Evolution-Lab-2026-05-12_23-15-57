import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { SprintLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function SprintPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <SprintLoader />;
}
