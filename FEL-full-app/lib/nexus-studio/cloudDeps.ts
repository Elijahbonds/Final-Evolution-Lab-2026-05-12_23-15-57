// SERVER ONLY. The Studio save routes' wiring (docs/NEXUS-STUDIO-SAVE.md §5): the session's user, the Prisma store, the switch, the age
// read from the DATABASE (never the session or the body), the per-account rate limiter and the PII-free log line. The
// handlers themselves are lib/nexus-studio/cloudRoute.ts.
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isStudioCloudSaveEnabled } from '@/lib/flags';
import { rateLimit } from '@/lib/rate-limit';
import { logGateFailure, readDobYear, type GateDb } from '@/lib/privacy/scanSaveGate';
import type { CloudRouteDeps } from '@/lib/nexus-studio/cloudRoute';
import { prismaProjectStore } from '@/lib/nexus-studio/cloudStore';

export async function studioSaveDeps(): Promise<CloudRouteDeps> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  const userId = typeof id === 'string' && id.length > 0 ? id : null;
  return {
    store: prismaProjectStore(prisma),
    userId,
    writesEnabled: isStudioCloudSaveEnabled(),
    dobYear: () => (userId ? readDobYear(prisma as unknown as GateDb, userId, 'studio_save') : Promise.resolve(null)),
    rateLimit,
    log: (event, e) => logGateFailure(event, e),
  };
}
