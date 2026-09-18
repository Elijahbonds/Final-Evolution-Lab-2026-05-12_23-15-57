import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { MusicLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function MusicPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <MusicLoader />;
}
