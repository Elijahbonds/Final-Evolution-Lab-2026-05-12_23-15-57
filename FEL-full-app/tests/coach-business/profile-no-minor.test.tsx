// COACH-BUSINESS: the coach's public page (/coach/[slug]) never shows a minor's data. Rendered for real — the page module
// with its loaders — against a database holding every kind of client row: an adult's approved result, a result a client
// approved as an adult who is a minor by the database today, an unapproved one, a withdrawn one. Only the first shows,
// as text only, in the HTML and in the JSON-LD.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { fakeCoachBusinessDb, seedCoach } from '@/tests/helpers/fakeCoachBusinessDb';

const THIS_YEAR = new Date().getFullYear();
const h = vi.hoisted(() => ({ fake: null as any, users: [] as { id: string; dobYear: number | null; name: string }[] }));

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, redirect: () => { throw new Error('redirect'); } }));
vi.mock('next-auth', () => ({ getServerSession: async () => null }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, p) => {
      if (p === 'then') return undefined;
      if (p === '$queryRawUnsafe' || p === '$executeRawUnsafe' || p === '$transaction') return (h.fake.db as any)[p];
      if (p === 'instructor') return { findUnique: async ({ where }: any) => {
        const i = h.fake.state.instructors.find((x: any) => x.slug === where.slug || x.userId === where.userId);
        return i ? { ...i, bio: 'I coach jumpers.', certifications: ['CSCS'], businessMailingAddress: null, clientFullRefundHours: 24 } : null;
      } };
      if (p === 'marketplaceListing') return { findMany: async () => [] };
      if (p === 'subscription') return { findMany: async () => [] };
      if (p === 'user') return { findMany: async ({ where }: any) => h.users.filter((u) => where.id.in.includes(u.id)).map(({ id, dobYear }) => ({ id, dobYear })) };
      throw new Error(`prisma.${String(p)} not expected on the public page`);
    },
  }),
}));

import CoachPage, { generateMetadata } from '@/app/coach/[slug]/page';
import { resetBusinessProbe } from '@/lib/coach-business/store';
import { publicHighlights } from '@/lib/coach-business/profile';

const ADULT_TEXT = 'Added four inches to the vertical in ten weeks of work.';
const TEEN_TEXT = 'Mia Torres jumped thirty inches at fifteen.';
const UNAPPROVED = 'Unapproved result text about a client.';
const WITHDRAWN = 'Withdrawn result text about a client.';

function seed() {
  h.fake = fakeCoachBusinessDb();
  seedCoach(h.fake.state, { connect: false });
  h.fake.state.market.set('coach-1', { userId: 'coach-1', listed: true, acceptingClients: true, sports: ['basketball'], goals: ['vertical'] });
  h.users = [
    { id: 'client-adult', dobYear: 1990, name: 'Sam Adult' },
    { id: 'client-teen', dobYear: THIS_YEAR - 15, name: 'Mia Torres' },
    { id: 'client-x', dobYear: 1985, name: 'Pat Other' },
  ];
  const at = new Date('2026-10-01');
  const hl = (id: string, clientId: string, text: string, o: Partial<{ consentAt: Date | null; consentAdult: boolean; revokedAt: Date | null }>) =>
    h.fake.state.highlights.set(id, { id, coachId: 'coach-1', clientId, text, consentAt: null, consentAdult: false, revokedAt: null, ...o });
  hl('h1', 'client-adult', ADULT_TEXT, { consentAt: at, consentAdult: true });
  hl('h2', 'client-teen', TEEN_TEXT, { consentAt: at, consentAdult: true });
  hl('h3', 'client-x', UNAPPROVED, {});
  hl('h4', 'client-x', WITHDRAWN, { consentAt: at, consentAdult: true, revokedAt: at });
}

async function render(): Promise<string> {
  return renderToStaticMarkup(await CoachPage({ params: { slug: 'jordan-lee' } }));
}

beforeEach(() => {
  resetBusinessProbe();
  for (const k of ['COACH_STORE_ENABLED', 'COACH_MARKETPLACE_ENABLED', 'COACH_CONNECT_PAYMENTS_ENABLED', 'STRIPE_SECRET_KEY', 'NEXTAUTH_URL', 'COACH_PRO_ENABLED']) delete process.env[k];
  process.env.COACH_MARKETPLACE_ENABLED = '1';
  seed();
});

describe('the coach\'s public page shows no minor\'s data', () => {
  it('only the adult\'s approved result shows, as text only — no name, no id, in the HTML or the JSON-LD', async () => {
    const html = await render();
    expect(html).toContain(ADULT_TEXT);
    for (const leak of [TEEN_TEXT, 'Mia', 'Torres', UNAPPROVED, WITHDRAWN, 'client-teen', 'client-adult', 'client-x', 'Sam Adult', 'Pat Other']) {
      expect(html, leak).not.toContain(leak);
    }
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
    const doc = JSON.parse(ld);
    expect(doc['@type']).toBe('Person');
    expect(doc.name).toBe('Jordan Lee');
    expect(ld).not.toContain(ADULT_TEXT);   // results are never put in structured data
    expect(ld).not.toMatch(/client|Mia|rating/i);
  });

  it('a client who becomes a minor by the database (a corrected birth year) disappears at once', async () => {
    h.users[0].dobYear = THIS_YEAR - 16;
    const html = await render();
    expect(html).not.toContain(ADULT_TEXT);
    expect(html).not.toContain('data-results');
  });

  it('an age read that fails shows no result at all', async () => {
    h.users = [];
    expect(await render()).not.toContain(ADULT_TEXT);
  });

  it('the filter itself: consent, consent as an adult, not withdrawn, and an adult now — all four', () => {
    const base = { coachId: 'c', text: 't', consentAt: new Date(), consentAdult: true, revokedAt: null };
    const adults = new Set(['a']);
    expect(publicHighlights([{ ...base, id: '1', clientId: 'a' }], adults)).toEqual([{ id: '1', text: 't' }]);
    expect(publicHighlights([{ ...base, id: '2', clientId: 'b' }], adults)).toEqual([]);
    expect(publicHighlights([{ ...base, id: '3', clientId: 'a', consentAdult: false }], adults)).toEqual([]);
    expect(publicHighlights([{ ...base, id: '4', clientId: 'a', consentAt: null }], adults)).toEqual([]);
    expect(publicHighlights([{ ...base, id: '5', clientId: 'a', revokedAt: new Date() }], adults)).toEqual([]);
    expect(Object.keys(publicHighlights([{ ...base, id: '1', clientId: 'a' }], adults)[0])).toEqual(['id', 'text']);
  });
});

describe('the rest of the page', () => {
  it('packages show with "Payments aren\'t live yet" and Apply while payments are off', async () => {
    const html = await render();
    expect(html).toContain('4 sessions');
    expect(html).toContain('$199.99');
    expect(html).toContain('Payments aren&#x27;t live yet.');
    expect(html).toContain('data-action="apply"');
    expect(html).not.toContain('data-action="book"');
    expect(html).toContain('data-guardian-line');
  });

  it('Book shows only when payments are live AND this coach can charge', async () => {
    Object.assign(process.env, { COACH_CONNECT_PAYMENTS_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_x', NEXTAUTH_URL: 'https://fel.test' });
    expect(await render()).not.toContain('data-action="book"');   // no Connect account yet
    h.fake.state.connect.set('coach-1', { userId: 'coach-1', stripeAccountId: 'acct_1', livemode: false, chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true });
    const html = await render();
    expect(html).toContain('data-action="book"');
    expect(html).toContain('TEST MODE');
    expect(html).not.toContain('data-payments-not-live');
  });

  it('SEO: the coach\'s own name and headline, canonical, indexable', async () => {
    const m = await generateMetadata({ params: { slug: 'jordan-lee' } });
    expect(m.title).toBe('Jordan Lee · Coach · Final Evolution');
    expect(m.description).toBe('Jump coach');
    expect((m.alternates as any).canonical).toMatch(/\/coach\/jordan-lee$/);
    expect(m.robots).toMatchObject({ index: true });
  });

  it('both switches off: a 404, as before', async () => {
    delete process.env.COACH_MARKETPLACE_ENABLED;
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
