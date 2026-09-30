import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AuthForm } from '@/components/auth-form';
import { AgeTurnAway } from '@/components/age-step';
import { AGE_BLOCK_COOKIE } from '@/lib/privacy/ageScreen';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect('/');
  if (cookies().get(AGE_BLOCK_COOKIE)) return <AgeTurnAway />;
  return <AuthForm mode="signup" />;
}
