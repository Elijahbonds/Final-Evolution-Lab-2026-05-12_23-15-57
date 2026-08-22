import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { SkateboardLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function SkateboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <SkateboardLoader />;
}
