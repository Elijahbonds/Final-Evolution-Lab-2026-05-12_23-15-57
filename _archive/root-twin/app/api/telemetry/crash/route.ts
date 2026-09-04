export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

/** POST /api/telemetry/crash — fire-and-forget client crash reports so broken
 *  builds/routes are visible in server logs (the M15 "assert rendering" lesson). */
export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore malformed */ }
  console.error('[FEL-CRASH]', JSON.stringify({
    message: String(body?.message ?? '').slice(0, 400),
    path: String(body?.path ?? ''),
    at: String(body?.at ?? new Date().toISOString()),
    stack: String(body?.stack ?? '').slice(0, 1200),
  }));
  return NextResponse.json({ ok: true });
}
