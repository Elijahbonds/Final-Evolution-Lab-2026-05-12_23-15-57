import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { redirect } from 'next/navigation';
import MapPreviewClient from './_components/preview-client';

export const dynamic = 'force-dynamic';

export default async function MapPreviewPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/play/map-preview'));
  return <MapPreviewClient />;
}
