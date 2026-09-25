import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { axesFor } from '@/lib/creator/athleteAxes-server';
import AthleteCreator from './_components/athlete-creator';

export const dynamic = 'force-dynamic';

export default async function AthleteCreatorPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  // PRQ axes are resolved server-side and passed down. Null is a perfectly good answer -- somebody with no
  // body scan gets no ceilings at all, which is the rule the whole attribute layer is built on.
  // HOTFIX (2026-09-24): this passed a hard-coded null, so the editor capped nothing while Finalize capped against
  // the (dice-seeded) profile row and refused the build. Both read axesFor now, and axesFor reads MEASUREMENTS only
  // (lib/creator/athleteAxes-server.ts). A database that will not answer leaves the editor uncapped rather than
  // taking the page down -- Finalize still checks on save.
  const userId = (session.user as { id?: string } | undefined)?.id;
  const axes = userId ? await axesFor(userId).catch(() => null) : null;
  return (
    <div className="min-h-screen bg-[#050505] pb-20 text-white">
      <AthleteCreator axes={axes} profileId={String(userId ?? 'local')} />
    </div>
  );
}
