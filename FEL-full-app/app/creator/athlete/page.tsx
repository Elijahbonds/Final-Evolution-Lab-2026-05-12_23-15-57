import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import AthleteCreator from './_components/athlete-creator';

export const dynamic = 'force-dynamic';

export default async function AthleteCreatorPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  // PRQ axes are resolved server-side and passed down. Null is a perfectly good answer -- somebody with no
  // body scan gets no ceilings at all, which is the rule the whole attribute layer is built on.
  return (
    <div className="min-h-screen bg-[#050505] pb-20 text-white">
      <AthleteCreator axes={null} profileId={String((session.user as { id?: string } | undefined)?.id ?? 'local')} />
    </div>
  );
}
