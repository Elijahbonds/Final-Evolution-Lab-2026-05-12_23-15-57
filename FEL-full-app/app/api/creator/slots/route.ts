export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getBookableService } from '@/lib/creator/creatorCatalog';
import { cellRange, freeSlots } from '@/lib/creator/creatorSlots';
import { creatorStoreFromEnv } from '@/lib/creator/creatorStore.firestore';

/**
 * GET /api/creator/slots?service=<serviceId>
 * Public: future free slots for one approved service. Computed from the catalog's weekly hours, minus
 * cells that are held or booked. No personal data in the answer.
 */
export async function GET(req: NextRequest) {
  const serviceId = (req.nextUrl.searchParams.get('service') ?? '').slice(0, 120);
  const found = getBookableService(serviceId);
  if (!found) return NextResponse.json({ error: 'Unknown service.' }, { status: 404 });
  const { profile, service } = found;

  const store = creatorStoreFromEnv();
  if (!store) return NextResponse.json({ error: 'Booking is not configured on this server yet.', code: 'store_not_configured' }, { status: 503 });

  const now = new Date();
  try {
    const range = cellRange(profile, now);
    const taken = await store.listTakenCells(profile.slug, range.from, range.to, now);
    return NextResponse.json(
      {
        service: { id: service.id, name: service.name, durationMinutes: service.durationMinutes },
        timeZone: profile.timeZone,
        hoursAreExample: profile.hoursAreExample,
        slots: freeSlots(profile, service, now, taken),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[creator-slots]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not read availability.' }, { status: 500 });
  }
}
