import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isDatabaseUnreachable } from '@/lib/db-health';

export const dynamic = 'force-dynamic';

/**
 * Database readiness probe.
 *
 * The plain liveness check answers "is the web server up?", which stays green
 * while the database is unreachable and every sign-in fails. This endpoint
 * answers the question that actually matters after a deploy: can the running
 * server talk to Postgres?
 *
 *   200 {"ok":true}                  → database reachable, sign-in can work
 *   503 {"ok":false,"reason":"..."}  → database unreachable, sign-in WILL fail
 *
 * The response never includes the connection string or the underlying driver
 * message: both name the database host and port.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, database: 'reachable', latencyMs: Date.now() - startedAt },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[health/db] database probe failed', err);
    const reason = isDatabaseUnreachable(err)
      ? 'Database unreachable — check DATABASE_URL on the deployed service.'
      : 'Database query failed.';
    return NextResponse.json(
      { ok: false, database: 'unreachable', reason, latencyMs: Date.now() - startedAt },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } }
    );
  }
}
