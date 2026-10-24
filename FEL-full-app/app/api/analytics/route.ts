/**
 * app/api/analytics/route.ts
 * ==========================
 * M13 Step 5 — first-party analytics ingestion endpoint.
 *
 * The client bus (lib/analytics.ts) batches events and POSTs { events: [...] }
 * here (also via sendBeacon on pagehide). We attach the authenticated userId
 * when present, otherwise the guest token cookie, and store rows in our own
 * table. No third-party trackers; telemetry only. Always returns 204 so the
 * fire-and-forget client never re-queues on a soft failure.
 *
 * TIP-GUEST-TOKEN-HASH (2026-10-19): a guest row's guestId is the HASH of the
 * guest token (lib/guestSession.ts guestIdFrom), never the cookie itself, and a
 * signed-out browser carrying the AGE-SCREEN block flag has its batch dropped.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { recordServerEvents } from '@/lib/analytics-server';
import { guestIdFrom } from '@/lib/guestSession';
import { AGE_BLOCK_COOKIE } from '@/lib/privacy/ageScreen';

export const dynamic = 'force-dynamic';

const eventSchema = z.object({
  name: z.string().min(1).max(64),
  props: z.record(z.any()).optional().nullable(),
  ts: z.number().optional(),
  sessionKey: z.string().max(80).optional(),
});
const bodySchema = z.object({ events: z.array(eventSchema).max(100) });

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      // Ship pass 2: a 204 on a bad batch is right for the client and wrong for
      // us — say what was rejected, once per request, so a shape drift shows.
      console.warn('[analytics] batch rejected:', parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      return new NextResponse(null, { status: 204 });
    }

    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id ?? null;
    const jar = cookies();
    if (!userId && jar.get(AGE_BLOCK_COOKIE)) return new NextResponse(null, { status: 204 });
    const guestId = userId ? null : guestIdFrom(jar);

    await recordServerEvents(
      parsed.data.events.map((e) => ({
        name: e.name,
        props: e.props ?? null,
        sessionKey: e.sessionKey ?? null,
        ts: e.ts,
        userId,
        guestId,
      })),
    );
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    // Telemetry must never surface an error to the client — but it must
    // surface to US. Measured 2026-09-03: a valid batch vanished behind this
    // 204 with nothing in the log.
    console.error('[analytics] POST failed:', (err as Error)?.message ?? err);
    return new NextResponse(null, { status: 204 });
  }
}
