// lib/teach/server.ts — the teacher platform's server reads (platform phase 10, 2026-11-03): the role's deps over the
// database, and the signed-in viewer. Server only.
import 'server-only';
import { prisma } from '@/lib/db';
import type { RawDb } from './store';
import { hasTeacherRow } from './store';
import type { RoleDeps } from './role';
import type { TeachApiDeps } from './api';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';

export const teachDb = (): RawDb => prisma as unknown as RawDb;

/** The role's reads over the database: the owner-granted row (through the pending seam) and the Camp's certification. */
export function teacherRoleDeps(db: RawDb = teachDb()): RoleDeps {
  return {
    teacherRow: (userId) => hasTeacherRow(db, userId),
    campCertified: async (userId) => {
      const p = await prisma.facilitatorProfile.findUnique({ where: { userId }, select: { certificationStatus: true } });
      return p?.certificationStatus === 'certified';
    },
  };
}

/** Everything lib/teach/api.ts reads, over the database. */
export function teachApiDeps(db: RawDb = teachDb()): TeachApiDeps {
  return {
    db,
    role: teacherRoleDeps(db),
    isAdult: async (userId) => {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { dobYear: true } }).catch(() => null);
      return verifiedAdult(u?.dobYear ?? null);
    },
    bestScore: async (userId, mode) => {
      const r = await prisma.gameSession.aggregate({ where: { userId, mode }, _max: { score: true } }).catch(() => null);
      return r?._max.score ?? null;
    },
  };
}

/** The signed-in user's id, or null. */
export async function sessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return ((session?.user as { id?: string } | undefined)?.id) ?? null;
}
