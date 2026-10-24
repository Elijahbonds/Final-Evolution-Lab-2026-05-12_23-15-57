// SAVE TO ACCOUNT: the Prisma store behind app/api/studio/projects/** (docs/NEXUS-STUDIO-SAVE.md §5). The table is
// StudioProjectSave (prisma/schema.prisma; prisma/pending/2026-10-17-studio-project-save.sql, applied by the owner in the
// deploy session). Every query is scoped by the session's userId, and the key starts with it.
//
// THE WRITE RULE, under one transaction-scoped advisory lock per account (the pattern lib/sessions/privateHold.ts uses):
//   1. read the account's rows (meta only);
//   2. the revision: create only at baseRev 0 with no row; update only when the row's rev is baseRev — anything else is a
//      conflict that changes nothing;
//   3. the quota (`admit`, quotaCheck over the rows read in 1);
//   4. write, rev + 1.
// Two writes for one account wait for each other, so two new projects at the same moment cannot both pass a full quota
// (the race the design noted), and two devices on the same base cannot both win. Other accounts never wait.
//
// A missing table (the SQL not applied yet) throws here; the route answers 503 save_unavailable (cloudRoute.ts guarded).

import type { Prisma, PrismaClient } from '@/public/_prisma/client';
import type { QuotaAdmit, StoredMeta, StudioProjectStore, StudioProjectWrite, StorePut } from './cloudRoute';

export type StudioStoreDb = Pick<PrismaClient, '$transaction' | 'studioProjectSave'>;

const META = { projectId: true, name: true, rev: true, bytes: true, updatedAt: true } as const;
/** The advisory-lock key for one account's Studio saves. hashtext() folds it to the lock's integer. */
export const lockKey = (userId: string) => `studio-save:${userId}`;
/** A 1 MiB document and the account's meta: well inside this. */
const TX = { timeout: 10_000, maxWait: 5_000 } as const;

export function prismaProjectStore(db: StudioStoreDb): StudioProjectStore {
  return {
    list: (userId) => db.studioProjectSave.findMany({ where: { userId }, select: META }),

    get: (userId, projectId) =>
      db.studioProjectSave.findUnique({
        where: { userId_projectId: { userId, projectId } },
        select: { ...META, version: true, doc: true },
      }),

    put: (userId: string, row: StudioProjectWrite, baseRev: number, admit: QuotaAdmit): Promise<StorePut> =>
      db.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))::text`, lockKey(userId));
        const existing: StoredMeta[] = await tx.studioProjectSave.findMany({ where: { userId }, select: META });
        const cur = existing.find((e) => e.projectId === row.projectId) ?? null;
        if ((cur?.rev ?? 0) !== baseRev) return { ok: false, current: cur };
        const q = admit(existing);
        if (!q.ok) return { ok: false, quota: q.error };
        const data = { name: row.name, version: row.version, bytes: row.bytes, doc: row.doc as Prisma.InputJsonValue, updatedAt: new Date() };
        const meta = cur
          ? await tx.studioProjectSave.update({ where: { userId_projectId: { userId, projectId: row.projectId } }, data: { ...data, rev: baseRev + 1 }, select: META })
          : await tx.studioProjectSave.create({ data: { userId, projectId: row.projectId, rev: 1, ...data }, select: META });
        return { ok: true, meta };
      }, TX),

    remove: async (userId, projectId) =>
      (await db.studioProjectSave.deleteMany({ where: { userId, projectId } })).count > 0,
  };
}

/** For the account export (lib/account/exportData.ts): every saved project, document included. A table that is not there
 *  yet (the SQL not applied: Prisma P2021) reads as none, so the rest of the export still downloads. */
export async function studioProjectsForExport(db: Pick<PrismaClient, 'studioProjectSave'> | Pick<Prisma.TransactionClient, 'studioProjectSave'>, userId: string) {
  try {
    return await db.studioProjectSave.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { projectId: true, name: true, rev: true, createdAt: true, updatedAt: true, doc: true },
    });
  } catch (e) {
    if ((e as { code?: unknown })?.code === 'P2021') return [];
    throw e;
  }
}
