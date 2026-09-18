import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import RailLoader from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function RailPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  return <RailLoader />;
}
