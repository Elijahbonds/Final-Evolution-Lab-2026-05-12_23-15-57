export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { houseOnlyCatalogue, loadCatalogue } from '@/lib/soundtrack/catalogue-server';

/**
 * GET /api/v1/soundtrack — CREATOR SOUNDTRACK piece B (owner, 2026-10-06): the soundtrack catalogue.
 *
 * The house songs plus every approved, public music card by an adult creator that an approver put in rotation — as slim
 * entries {id, source, title, creator{name, href}, url, mime, durationSec, gainDb, bpm, loop, moods, plays, featured},
 * never a card's payload (lib/soundtrack/catalogue.ts holds the rules). Public by design (lib/api/routeContract.test.ts):
 * it carries only what the menus already play to anyone. CDN-cached for five minutes; if the database cannot be reached
 * the house playlist still answers, cached briefly, so the menus never go silent for that.
 */
export async function GET() {
  try {
    const catalogue = await loadCatalogue(prisma);
    return NextResponse.json(catalogue, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
  } catch (e) {
    console.warn('[FEL-SOUNDTRACK] catalogue fell back to the house playlist', (e as Error)?.message);
    return NextResponse.json(houseOnlyCatalogue(), { headers: { 'Cache-Control': 'public, s-maxage=60' } });
  }
}
