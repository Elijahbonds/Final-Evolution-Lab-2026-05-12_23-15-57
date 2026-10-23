import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canWriteHealthData } from '@/lib/privacy/healthWriteGate';
import { ELIJAH_COACH_STORE_HREF } from '@/lib/creator/coachStoreHrefs';
import { ResultsPage } from '../_components/results-page';

/** Server-only. Rendered when the coach store flag is on. */
export async function AdultTrainResults() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const trainWithElijahHref = userId && await canWriteHealthData(prisma, userId) ? ELIJAH_COACH_STORE_HREF : null;
  return <ResultsPage trainWithElijahHref={trainWithElijahHref} />;
}
