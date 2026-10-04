import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath, safeLoginNext } from '@/lib/auth/safeNext';
import { prisma } from '@/lib/db';
import { AgeStep, AgeTurnAway } from '@/components/age-step';
import { AGE_BLOCK_COOKIE } from '@/lib/privacy/ageScreen';

export const dynamic = 'force-dynamic';

export default async function AgePage({ searchParams }: { searchParams?: { next?: string | string[] } }) {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  const raw = searchParams?.next;
  const next = safeLoginNext(Array.isArray(raw) ? raw[0] : raw) ?? '/';
  // A signed-out visitor comes back here after login, still carrying the post-age destination.
  const ageReturnPath = next === '/' ? '/age' : `/age?next=${encodeURIComponent(next)}`;
  if (!id) redirect(loginPath(ageReturnPath));
  if (cookies().get(AGE_BLOCK_COOKIE)) return <AgeTurnAway />;
  const user = await prisma.user.findUnique({ where: { id }, select: { dobYear: true } });
  if (user?.dobYear != null) redirect(next);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-3 py-6 sm:px-4">
      <div className="fel-panel relative w-full max-w-md rounded-2xl p-5 sm:p-8">
        <AgeStep mode="account" nextPath={next} />
      </div>
    </div>
  );
}
