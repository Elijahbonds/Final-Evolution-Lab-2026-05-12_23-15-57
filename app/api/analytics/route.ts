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
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { recordServerEvents } from '@/lib/analytics-server';
import { GUEST_COOKIE } from '@/lib/guest';

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
    if (!parsed.success) return new NextResponse(null, { status: 204 });

    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id ?? null;
    const guestId = userId ? null : cookies().get(GUEST_COOKIE)?.value ?? null;

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
  } catch {
    // Telemetry must never surface an error to the client.
    return new NextResponse(null, { status: 204 });
  }
}
