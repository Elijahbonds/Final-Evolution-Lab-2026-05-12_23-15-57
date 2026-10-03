import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { KBAdmin } from './_components/kb-admin';

export const dynamic = 'force-dynamic';

export default async function CoachAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const role = (session.user as any)?.role;
  if (role !== 'admin') redirect('/coach');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <KBAdmin />
    </div>
  );
}
