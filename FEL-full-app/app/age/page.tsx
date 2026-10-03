import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AgeStep, AgeTurnAway } from '@/components/age-step';
import { AGE_BLOCK_COOKIE } from '@/lib/privacy/ageScreen';
import { safeLoginNext } from '@/lib/auth/safeNext';

export const dynamic = 'force-dynamic';

/** Same-origin paths only. Anything else, including protocol-relative URLs, falls back to '/'. */
function sameOriginPath(raw: string | undefined): string {
  return safeLoginNext(raw) ?? '/';
}

export default async function AgePage({ searchParams }: { searchParams?: { next?: string } }) {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  const next = sameOriginPath(searchParams?.next);
  const ageReturnPath = next === '/' ? '/age' : `/age?next=${encodeURIComponent(next)}`;
  if (!id) redirect(`/login?next=${encodeURIComponent(ageReturnPath)}`);
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
