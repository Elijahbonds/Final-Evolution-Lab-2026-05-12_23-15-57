// SERVER ONLY. The Studio save routes' wiring (docs/NEXUS-STUDIO-SAVE.md §5): the Prisma store, the switch, the age read
// from the DATABASE (never the session or the body), the per-account rate limiter and the PII-free log line. The route
// files read the session themselves (lib/api/routeContract.test.ts: the guard is visible in every route) and pass its user
// id in; the handlers are lib/nexus-studio/cloudRoute.ts.
import { prisma } from '@/lib/db';
import { isStudioCloudSaveEnabled } from '@/lib/flags';
import { rateLimit } from '@/lib/rate-limit';
import { logGateFailure, readDobYear, type GateDb } from '@/lib/privacy/scanSaveGate';
import type { CloudRouteDeps } from '@/lib/nexus-studio/cloudRoute';
import { prismaProjectStore } from '@/lib/nexus-studio/cloudStore';

/** The signed-in user's id from a session, or null. A query string or a body never chooses it. */
export function sessionUserId(session: unknown): string | null {
  const id = ((session as { user?: { id?: unknown } } | null)?.user)?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export function studioSaveDeps(userId: string | null): CloudRouteDeps {
  return {
    store: prismaProjectStore(prisma),
    userId,
    writesEnabled: isStudioCloudSaveEnabled(),
    dobYear: () => (userId ? readDobYear(prisma as unknown as GateDb, userId, 'studio_save') : Promise.resolve(null)),
    rateLimit,
    log: (event, e) => logGateFailure(event, e),
  };
}

