import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { KarateVsLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function KarateVsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/play/karate-vs'));
  // FN-BOX-1: the birth year decides whether this fight offers the body (bodySeam.gateBodyFight). A failed read is unknown,
  // and unknown gets no body path — pad play is the same either way.
  const userId = (session.user as { id?: string } | undefined)?.id;
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null) : null;
  return <KarateVsLoader dobYear={user?.dobYear ?? null} />;
}
