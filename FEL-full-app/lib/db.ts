import { Prisma, PrismaClient } from '@/lib/generated/prisma'
import { cloudSqlEnabled, createCloudSqlPrisma } from '@/lib/db/cloudSql'
import { resolveQueryEngine } from '@/lib/db/queryEngine'

// PRISMA-PUBLIC step 2 (docs/PRISMA-PUBLIC-PLAN.md): the client is lib/generated/prisma, no longer public/_prisma/client.
// Its engine does not ride with it to the deployed function (lib/ is never packaged); next.config.js copies it into
// <distDir>/prisma-engine, and this points PRISMA_QUERY_ENGINE_LIBRARY at it before any client is constructed.
resolveQueryEngine()

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
