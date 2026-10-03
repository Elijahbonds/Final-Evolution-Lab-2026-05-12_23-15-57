import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginRedirect, type LoginRedirectSearchParams } from '@/lib/auth/safeNext';
import { redirect } from 'next/navigation';
import MapPreviewClient from './_components/preview-client';

export const dynamic = 'force-dynamic';

export default async function MapPreviewPage({ searchParams }: { searchParams?: LoginRedirectSearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginRedirect('/play/map-preview', searchParams));
  return <MapPreviewClient />;
}
