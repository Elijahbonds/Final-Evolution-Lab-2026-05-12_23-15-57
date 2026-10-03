import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { ClosetView } from '@/components/closet-view';
import { prisma } from '@/lib/db';
import { readDobYear } from '@/lib/privacy/scanSaveGate';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

export const dynamic = 'force-dynamic';

export default async function ClosetPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login?next=%2Fcloset');
  const userId = (session.user as { id?: string } | undefined)?.id;
  const adult = userId ? verifiedAdult(await readDobYear(prisma, userId, 'look_hold_page')) : false;
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <ClosetView adult={adult} />
    </div>
  );
}
