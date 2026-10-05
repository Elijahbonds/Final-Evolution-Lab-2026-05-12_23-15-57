import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canWriteHealthData } from '@/lib/privacy/healthWriteGate';
import type { LaneSlug } from '@/lib/screen/PROPOSED-program-lanes';
import { ProgramLane } from './program-lane';

/** Server-only. Rendered when the store flag is on and the lane is dunking. */
export async function AdultDunkLane({ lane }: { lane: LaneSlug }) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const dunkHref = userId && await canWriteHealthData(prisma, userId) ? '/coach/elijah/programs/dunking' : null;
  return <ProgramLane lane={lane} dunkHref={dunkHref} />;
}
