export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { assertCoachStoreOn } from '@/lib/coach-store/gate';
import { getProgramLibrarySeed } from '@/lib/coach-store/programLibrarySeed';

/**
 * PROGRAM-LIBRARY-SEED: read-only list of the seeded video/drill library behind the coach-store flag.
 * Flag off (default): assertCoachStoreOn() 404s before the seed is ever read, same as every other coach-store route.
 * No checkout, no pricing (every entry's priceCents is null) — this is a library listing, not a sellable item yet.
 */
export async function GET() {
  const blocked = assertCoachStoreOn();
  if (blocked) return blocked;
  return NextResponse.json({ entries: getProgramLibrarySeed() });
}
