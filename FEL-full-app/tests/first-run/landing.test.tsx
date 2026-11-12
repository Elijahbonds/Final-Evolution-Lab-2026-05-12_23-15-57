// The landing page (app/page.tsx): the Stripe return still verifies before the signed-in redirect (SEC-F4 NO-WEBHOOK),
// and ONB-06's social proof renders nothing until the owner adds a quote with consent.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const h = vi.hoisted(() => ({ session: null as null | { user: { id: string } } }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock('@/components/guest-landing-hero', () => ({ GuestLandingHero: () => createElement('div', { 'data-hero': '' }) }));
vi.mock('@/components/stripe/verify-checkout-params', () => ({
  VerifyCheckoutParams: ({ signedIn }: { signedIn: boolean }) => createElement('div', { 'data-verify': String(signedIn) }),
}));

import HomePage from '@/app/page';
import { SocialProof } from '@/components/social-proof/social-proof';
import { QUOTES, usableQuotes, type SocialQuote } from '@/components/social-proof/quotes';

const render = async (searchParams: { session_id?: string }) => renderToStaticMarkup(await HomePage({ searchParams }));

beforeEach(() => { h.session = null; });

describe('/ — the Stripe return', () => {
  it('a signed-in visitor with no checkout goes to /play', async () => {
    h.session = { user: { id: 'u1' } };
    await expect(render({})).rejects.toThrow('REDIRECT /play');
  });
  it('a signed-in buyer coming back from Stripe stays for the verify (no redirect before it)', async () => {
    h.session = { user: { id: 'u1' } };
    const html = await render({ session_id: 'cs_test_1' });
    expect(html).toContain('data-verify="true"');
    expect(html).not.toContain('data-hero');
  });
  it('a signed-out visitor gets the pitch, the verify, and no empty social-proof frame', async () => {
    const html = await render({});
    expect(html).toContain('data-hero');
    expect(html).toContain('data-verify="false"');
    expect(html).not.toContain('data-social-proof');
  });
});

describe('ONB-06: social proof', () => {
  const ok: SocialQuote = {
    id: 'q1', role: 'parent', text: 'My son asks to train now.', credit: 'A parent in Austin', adult: true,
    consent: { use: ['landing'], givenOn: '2026-10-20' },
  };
  it('ships with no quotes, and renders nothing then', () => {
    expect(QUOTES).toEqual([]);
    expect(renderToStaticMarkup(createElement(SocialProof))).toBe('');
  });
  it('shows a coach or parent quote only with written consent for the landing page, from an adult, not withdrawn', () => {
    expect(usableQuotes([ok])).toHaveLength(1);
    expect(usableQuotes([{ ...ok, adult: false }])).toEqual([]);
    expect(usableQuotes([{ ...ok, role: 'athlete' as never }])).toEqual([]);
    expect(usableQuotes([{ ...ok, consent: { use: [], givenOn: '2026-10-20' } }])).toEqual([]);
    expect(usableQuotes([{ ...ok, consent: { use: ['landing'], givenOn: 'yes' } }])).toEqual([]);
    expect(usableQuotes([{ ...ok, consent: { use: ['landing'], givenOn: '2026-10-20', withdrawnOn: '2026-10-22' } }])).toEqual([]);
    const html = renderToStaticMarkup(createElement(SocialProof, { quotes: [ok] }));
    expect(html).toContain('My son asks to train now.');
    expect(html).toContain('A parent in Austin');
  });
});
