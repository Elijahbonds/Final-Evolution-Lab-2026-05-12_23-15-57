// COACH-BUSINESS: find a coach — the filters, the listing (opted-in, published, verified adults only) and applying
// (adults only; a minor gets the guardian path and nothing is stored).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeCoachBusinessDb, seedCoach } from '@/tests/helpers/fakeCoachBusinessDb';

const h = vi.hoisted(() => ({ dob: new Map<string, number | null>() }));
vi.mock('@/lib/db', () => ({
  prisma: { user: { findMany: async ({ where }: any) => where.id.in.map((id: string) => ({ id, dobYear: h.dob.get(id) ?? null })) } },
}));

import { cleanGoals, cleanSports, filterCoaches, marketHref, parseMarketQuery, type MarketCard } from '@/lib/coach-business/market';
import { loadMarketCards } from '@/lib/coach-business/marketServer';
import { applyToCoach, GUARDIAN_PATH, type ApplyDeps } from '@/lib/coach-business/service';
import { resetBusinessProbe } from '@/lib/coach-business/store';

const card = (o: Partial<MarketCard>): MarketCard => ({
  slug: 's', displayName: 'Coach', headline: null, specialties: [], sports: [], goals: [], fromPriceCents: null, fromMonthly: false, acceptingClients: true, ...o,
});

beforeEach(() => { resetBusinessProbe(); h.dob.clear(); });

describe('filters', () => {
  const cards = [
    card({ slug: 'a', displayName: 'Avery', sports: ['basketball'], goals: ['vertical', 'speed'] }),
    card({ slug: 'b', displayName: 'Blake', sports: ['volleyball'], goals: ['vertical'] }),
    card({ slug: 'c', displayName: 'Casey', sports: ['basketball'], goals: ['strength'], acceptingClients: false }),
    card({ slug: 'd', displayName: 'Drew', sports: ['basketball', 'volleyball'], goals: ['speed'] }),
  ];

  it('by sport, by goal, and by both', () => {
    expect(filterCoaches(cards, { sport: 'basketball', goal: null }).map((c) => c.slug)).toEqual(['a', 'd', 'c']);
    expect(filterCoaches(cards, { sport: null, goal: 'vertical' }).map((c) => c.slug)).toEqual(['a', 'b']);
    expect(filterCoaches(cards, { sport: 'volleyball', goal: 'speed' }).map((c) => c.slug)).toEqual(['d']);
    expect(filterCoaches(cards, { sport: 'tennis', goal: null })).toEqual([]);
    expect(filterCoaches(cards, { sport: null, goal: null })).toHaveLength(4);
  });

  it('coaches taking clients come first, then by name', () => {
    expect(filterCoaches(cards, { sport: null, goal: null }).map((c) => c.slug)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('the URL is read against fixed lists: anything else means "any"', () => {
    expect(parseMarketQuery({ sport: 'Basketball', goal: 'vertical' })).toEqual({ sport: 'basketball', goal: 'vertical' });
    expect(parseMarketQuery({ sport: '<script>', goal: ['speed', 'x'] })).toEqual({ sport: null, goal: 'speed' });
    expect(parseMarketQuery({})).toEqual({ sport: null, goal: null });
    expect(cleanSports(['tennis', 'nope', 'basketball', 'tennis'])).toEqual(['basketball', 'tennis']);
    expect(cleanGoals('vertical')).toEqual([]);
  });

  it('filter links keep the other filter and clear with null', () => {
    expect(marketHref({ sport: 'basketball', goal: null }, { goal: 'vertical' })).toBe('/coaches?sport=basketball&goal=vertical');
    expect(marketHref({ sport: 'basketball', goal: 'vertical' }, { sport: null })).toBe('/coaches?goal=vertical');
    expect(marketHref({ sport: null, goal: null }, {})).toBe('/coaches');
  });
});

describe('the listing', () => {
  it('lists published, opted-in, verified-adult coaches with their lowest price — and nothing about clients', async () => {
    const { db, state } = fakeCoachBusinessDb();
    seedCoach(state, { coachId: 'c1', slug: 'adult-coach', packageId: 'p1', priceCents: 15_000 });
    state.packages.set('p2', { ...state.packages.get('p1'), id: 'p2', kind: 'monthly', priceCents: 9_900, sessions: null });
    seedCoach(state, { coachId: 'c2', slug: 'teen-coach', packageId: 'p3' });
    seedCoach(state, { coachId: 'c3', slug: 'not-listed', packageId: 'p4' });
    state.market.set('c1', { userId: 'c1', listed: true, acceptingClients: true, sports: ['basketball'], goals: ['vertical'] });
    state.market.set('c2', { userId: 'c2', listed: true, acceptingClients: true, sports: ['basketball'], goals: ['vertical'] });
    state.market.set('c3', { userId: 'c3', listed: false, acceptingClients: true, sports: [], goals: [] });
    h.dob.set('c1', 1988).set('c2', new Date().getFullYear() - 16).set('c3', 1980);
    const cards = (await loadMarketCards(db as any))!;
    expect(cards.map((c) => c.slug)).toEqual(['adult-coach']);
    expect(cards[0]).toMatchObject({ fromPriceCents: 9_900, fromMonthly: true, sports: ['basketball'], goals: ['vertical'] });
    expect(Object.keys(cards[0]).sort()).toEqual(['acceptingClients', 'displayName', 'fromMonthly', 'fromPriceCents', 'goals', 'headline', 'slug', 'specialties', 'sports']);
  });

  it('before the SQL is applied: null (the page says the list is not set up)', async () => {
    expect(await loadMarketCards(fakeCoachBusinessDb({ ready: false }).db as any)).toBeNull();
  });
});

describe('applying', () => {
  function applyDeps(adult: boolean, accepting = true) {
    const fake = fakeCoachBusinessDb();
    seedCoach(fake.state);
    const deps: ApplyDeps = {
      db: fake.db as any, env: {} as NodeJS.ProcessEnv, isAdult: async () => adult,
      coachBySlug: async (slug) => (slug === 'jordan-lee' ? { userId: 'coach-1', acceptingClients: accepting } : null),
    };
    return { deps, fake };
  }

  it('an adult applies once; applying again updates the same row', async () => {
    const { deps, fake } = applyDeps(true);
    expect(await applyToCoach(deps, 'adult-1', { slug: 'jordan-lee', goal: 'vertical', note: '  I want   to dunk ', packageId: 'pkg-1' })).toEqual({ ok: true });
    expect(await applyToCoach(deps, 'adult-1', { slug: 'jordan-lee', goal: 'speed' })).toEqual({ ok: true });
    expect([...fake.state.applications.values()]).toEqual([expect.objectContaining({ applicantId: 'adult-1', goal: 'speed', status: 'OPEN' })]);
  });

  it('a minor (or an unknown age) gets the guardian path, and NOTHING is stored', async () => {
    const { deps, fake } = applyDeps(false);
    const r = await applyToCoach(deps, 'teen-1', { slug: 'jordan-lee', goal: 'vertical', note: 'my phone is 555' });
    expect(r).toEqual({ ok: false, status: 403, ...GUARDIAN_PATH });
    expect(fake.state.applications.size).toBe(0);
    expect(fake.state.statements.filter((s) => s === 'upsertApplication')).toEqual([]);
  });

  it('refuses a bad goal, an unknown coach, one\'s own page, a coach not taking clients, and another coach\'s package', async () => {
    const { deps } = applyDeps(true);
    expect(await applyToCoach(deps, 'a', { slug: 'jordan-lee', goal: 'fly' })).toMatchObject({ status: 400 });
    expect(await applyToCoach(deps, 'a', { slug: 'nobody', goal: 'vertical' })).toMatchObject({ status: 404 });
    expect(await applyToCoach(deps, 'coach-1', { slug: 'jordan-lee', goal: 'vertical' })).toMatchObject({ error: 'own_profile' });
    expect(await applyToCoach(applyDeps(true, false).deps, 'a', { slug: 'jordan-lee', goal: 'vertical' })).toMatchObject({ status: 409 });
    expect(await applyToCoach(deps, 'a', { slug: 'jordan-lee', goal: 'vertical', packageId: 'pkg-other' })).toMatchObject({ status: 404 });
  });
});
