import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AuthForm } from '@/components/auth-form';
import { safePostSignInDestination } from '@/lib/auth/safeNext';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams?: { next?: string | string[] } }) {
  const session = await getServerSession(authOptions);
  const next = searchParams?.next;
  const raw = Array.isArray(next) ? next[0] : next;
  // LOGIN-LOOP-FIX: a next=/login (bare or nested) must not send an already-signed-in visitor back to /login.
  if (session) redirect(safePostSignInDestination(raw, '/'));
  return <AuthForm mode="login" />;
}
