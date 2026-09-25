export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

/** POST /api/telemetry/crash — fire-and-forget client crash reports so broken
 *  builds/routes are visible in server logs (the M15 "assert rendering" lesson). */
export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore malformed */ }
  // HOTFIX (2026-09-24): only a plain object is a report, and only its OWN fields are read. A JSON string, number or
  // array parsed fine and then had its prototype read — POST '"str"' logged `"at":"function at() { [native code] }"`
  // (String.prototype.at) — and a field holding an object like {"toString":1} made String() throw, a 500 from the one
  // route that must always answer. Every field is capped: this route takes anything from anyone, signed in or not, and
  // writes it straight to the log.
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  const text = (key: string, max: number): string => {
    const v: unknown = Object.prototype.hasOwnProperty.call(body, key) ? body[key] : undefined;
    if (v === undefined || v === null) return '';
    return (typeof v === 'string' ? v : JSON.stringify(v)).slice(0, max);   // a parsed JSON value always stringifies
  };
  const caughtBy = text('caughtBy', 16);
  console.error('[FEL-CRASH]', JSON.stringify({
    message: text('message', 400),
    path: text('path', 256),
    at: text('at', 64) || new Date().toISOString(),
    stack: text('stack', 1200),
    // HOTFIX (2026-09-24): the crash screens send Next's error digest. A server-render crash reaches the client with
    // its message stripped in production, and the digest is what matches it to the server's own log line.
    digest: text('digest', 64) || null,
    // HOTFIX (2026-09-24): which catcher sent it — the /play boundary or the root screen (app/global-error.tsx). A
    // root report's `path` can be the page the player navigated FROM; see reportCrash.
    caughtBy: caughtBy === 'boundary' || caughtBy === 'root' ? caughtBy : null,
  }));
  return NextResponse.json({ ok: true });
}
