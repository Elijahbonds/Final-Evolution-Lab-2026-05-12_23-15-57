import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { HighlightConsent } from '@/components/coach-business/highlight-consent';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Share a result' };

// COACH-BUSINESS: the link a coach sends a client to approve a result for the coach's public page.
export default async function HighlightConsentPage({ params }: { params: { id: string } }) {
  const id = String(params?.id ?? '');
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath(`/coach/highlight/${encodeURIComponent(id)}`));
  return (
    <div className="min-h-screen bg-fel-bg">
      <HighlightConsent id={id} />
    </div>
  );
}
