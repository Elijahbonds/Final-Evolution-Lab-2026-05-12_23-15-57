import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { EducationView } from '@/components/education-view';

export const dynamic = 'force-dynamic';

export default async function EducationPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <EducationView />
    </div>
  );
}
