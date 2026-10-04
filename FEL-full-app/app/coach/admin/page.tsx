import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { KBAdmin } from './_components/kb-admin';

export const dynamic = 'force-dynamic';

export default async function CoachAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/coach/admin'));
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <KBAdmin />
    </div>
  );
}
