import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import RailLoader from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function RailPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(loginPath('/story/rail'));
  return <RailLoader />;
}
