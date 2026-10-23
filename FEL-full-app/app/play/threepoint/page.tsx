import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { loginPath } from '@/lib/auth/safeNext';
import { couchRequested } from '@/lib/party/catalog';
import { CouchRoom, CouchStart } from '@/components/controller-link/couch-start';
import { ThreePointLoader } from './_components/loader';

export const dynamic = 'force-dynamic';

export default async function ThreePointPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect(loginPath('/play/threepoint'));
  // FN-0 COUCH: the signed-in visitor hosts; seats 2–4 join by pad or phone code (no camera, no party chat)
  if (couchRequested(searchParams)) return <CouchRoom modeId="threepoint" />;
  return <><ThreePointLoader /><CouchStart modeId="threepoint" /></>;
}
