import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AuthForm } from '@/components/auth-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect('/');
  return <AuthForm mode="login" />;
}
