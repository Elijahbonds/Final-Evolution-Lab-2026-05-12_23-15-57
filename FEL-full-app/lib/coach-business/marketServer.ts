// lib/coach-business/marketServer.ts — COACH-BUSINESS: the coaches /coaches lists. Published profile + opted in + a
// verified adult today (a coach is an adult by the profile route's own gate; this re-checks, so a corrected birth year
// takes a listing down at once). Each card carries the coach's own words and lowest package price, nothing about clients.
import { cleanGoals, cleanSports, type MarketCard } from './market';
import { billingOf } from './packages';
import { adultIdsOf } from './profileServer';
import { activePackagesFor, businessReady, listedCoaches, type RawDb } from './store';

export async function loadMarketCards(db: RawDb, now: Date = new Date()): Promise<MarketCard[] | null> {
  if (!(await businessReady(db))) return null;
  const rows = await listedCoaches(db);
  const adults = await adultIdsOf(rows.map((r) => r.userId), now);
  const coaches = rows.filter((r) => adults.has(r.userId));
  const packages = await activePackagesFor(db, coaches.map((c) => c.userId));
  return coaches.map((c) => {
    const own = packages.filter((k) => k.coachId === c.userId).sort((a, b) => a.priceCents - b.priceCents);
    return {
      slug: c.slug,
      displayName: c.displayName,
      headline: c.headline,
      specialties: (c.specialties ?? []).slice(0, 4),
      sports: cleanSports(c.sports),
      goals: cleanGoals(c.goals),
      fromPriceCents: own[0]?.priceCents ?? null,
      fromMonthly: own[0] ? billingOf(own[0].kind) === 'month' : false,
      acceptingClients: !!c.acceptingClients,
    };
  });
}
