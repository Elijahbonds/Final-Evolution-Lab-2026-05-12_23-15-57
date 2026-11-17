import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import HoopsBuilder from './_components/hoops-builder';

export const dynamic = 'force-dynamic';

// THE HOOPS BUILDER (lane/hoops-builder, owner 2026-11-12): a position, a playing height and five ratings, raised with points earned
// by playing. Part of the Creator: it lives in the athlete's one build record (lib/creator/hoops/hoopsBuild.ts).
export default async function HoopsBuilderPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/creator/hoops'));
  return (
    <div className="min-h-screen bg-[#050505] pb-40 text-white md:pb-20">
      <HoopsBuilder />
    </div>
  );
}
