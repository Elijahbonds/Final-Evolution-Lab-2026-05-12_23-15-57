import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { KitchenLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function KitchensPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <KitchenLoader />;
}
