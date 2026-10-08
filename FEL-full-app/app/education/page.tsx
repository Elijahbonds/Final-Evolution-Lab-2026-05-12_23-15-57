import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { EducationView } from '@/components/education-view';
// EDU-LINKS (2026-10-07): the Playbook's door on /education (the movement course was unlinked from here).
import { PlaybookCard } from '@/components/education/playbook-card';

export const dynamic = 'force-dynamic';

export default async function EducationPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/education'));
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <PlaybookCard />
      <EducationView />
    </div>
  );
}
