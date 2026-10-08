import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AuthForm } from '@/components/auth-form';
import { AgeTurnAway } from '@/components/age-step';
import { AGE_BLOCK_COOKIE } from '@/lib/privacy/ageScreen';
import { safePostSignInDestination } from '@/lib/auth/safeNext';

export const dynamic = 'force-dynamic';

export default async function SignupPage({ searchParams }: { searchParams?: { next?: string | string[] } }) {
  const session = await getServerSession(authOptions);
  const next = searchParams?.next;
  const raw = Array.isArray(next) ? next[0] : next;
  // LOGIN-LOOP-FIX: see app/login/page.tsx — a next=/login (bare or nested) must not send an already-signed-in
  // visitor back to /login.
  if (session) redirect(safePostSignInDestination(raw, '/'));
  if (cookies().get(AGE_BLOCK_COOKIE)) return <AgeTurnAway />;
  return <AuthForm mode="signup" />;
}
