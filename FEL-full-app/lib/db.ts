import { Prisma, PrismaClient } from '@/public/_prisma/client'
import { cloudSqlEnabled, createCloudSqlPrisma } from '@/lib/db/cloudSql'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// CLOUD_SQL_INSTANCE set (production): through the Cloud SQL Node.js Connector — see lib/db/cloudSql.ts.
// Unset (local dev, tests, tip=eye): the plain client on DATABASE_URL, exactly as it always was.
const createPrisma = (): PrismaClient =>
  cloudSqlEnabled()
    ? createCloudSqlPrisma<PrismaClient>(
        PrismaClient,
        (message, errorCode) => new Prisma.PrismaClientInitializationError(message, Prisma.prismaVersion.client, errorCode),
      )
    : new PrismaClient()

export const prisma = globalForPrisma.prisma ?? createPrisma()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
