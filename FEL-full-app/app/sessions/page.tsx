import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { SessionsView } from '@/components/sessions-view';

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/sessions'));
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <SessionsView />
    </div>
  );
}
