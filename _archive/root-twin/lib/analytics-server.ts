/**
 * lib/analytics-server.ts
 * =======================
 * M13 Step 5 — first-party analytics ingestion helpers (server side).
 *
 * Telemetry ONLY: events never carry credit amounts or PRQ deltas (those are
 * server-authoritative and travel through /api/sessions + the economy routes).
 * No third-party trackers — rows land in our own AnalyticsEvent table and
 * respect the privacy policy (guests carry a rotating token, never PII).
 *
 * All writes are best-effort: a telemetry failure must never break a request.
 */

import { prisma } from '@/lib/db';

export interface ServerEventInput {
  name: string;
  props?: Record<string, unknown> | null;
  sessionKey?: string | null;
  userId?: string | null;
  guestId?: string | null;
  ts?: number; // client wall-clock ms; defaults to now
}

/** Record a single analytics event. Never throws. */
export async function recordServerEvent(e: ServerEventInput): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        name: String(e.name).slice(0, 64),
        props: (e.props ?? undefined) as any,
        sessionKey: e.sessionKey ?? null,
        userId: e.userId ?? null,
        guestId: e.guestId ?? null,
        ts: e.ts ? new Date(e.ts) : new Date(),
      },
    });
  } catch (err) {
    console.warn('[analytics] event write skipped:', (err as any)?.message);
  }
}

/** Record a batch of events efficiently. Never throws. */
export async function recordServerEvents(events: ServerEventInput[]): Promise<number> {
  if (!events.length) return 0;
  try {
    const rows = events.map((e) => ({
      name: String(e.name).slice(0, 64),
      props: (e.props ?? undefined) as any,
      sessionKey: e.sessionKey ?? null,
      userId: e.userId ?? null,
      guestId: e.guestId ?? null,
      ts: e.ts ? new Date(e.ts) : new Date(),
    }));
    const res = await prisma.analyticsEvent.createMany({ data: rows });
    return res.count;
  } catch (err) {
    console.warn('[analytics] batch write skipped:', (err as any)?.message);
    return 0;
  }
}
