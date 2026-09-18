// Liveness endpoint (2026-09-12 release pass). There was none: the smoke over the
// production build answered 404 here, which means an uptime monitor, a load
// balancer probe or a post-deploy check has nothing to ask except a page render.
//
// Deliberately dependency-free: no database, no session, no secrets. It answers
// "this process is up and serving" and nothing else, so it stays truthful even
// when a downstream dependency is the thing that is broken.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'fel',
    // set by the host where available; absent locally, which is honest rather than wrong
    release: process.env.K_REVISION ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    time: new Date().toISOString(),
  });
}
