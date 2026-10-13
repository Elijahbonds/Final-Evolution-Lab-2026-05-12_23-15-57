import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, existsSync } from 'node:fs';

// COACH-THANKS (FE PM, Oct 12): /coach/thanks after a Stripe checkout.
const h = vi.hoisted(() => ({
  enabled: true,
  user: 'buyer-1' as string | null,
  retrieve: vi.fn(),
  booking: null as null | Record<string, unknown>,
}));

vi.mock('@/lib/flags', () => ({ isCoachStoreEnabled: () => h.enabled }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => (h.user ? { user: { id: h.user } } : null)) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ checkout: { sessions: { retrieve: h.retrieve } } }) }));
vi.mock('@/lib/db', () => ({ prisma: { booking: { findUnique: vi.fn(async () => h.booking) } } }));
vi.mock('@/components/coach-store/thanks-poll', () => ({ ThanksPoll: () => null }));

import ThanksPage from '@/app/coach/thanks/page';

const session = (over: Record<string, unknown> = {}) => ({
  id: 'cs_test_1',
  status: 'complete',
  payment_status: 'paid',
  amount_total: 7500,
  currency: 'usd',
  metadata: { product: 'COACH_STORE', userId: 'buyer-1', rowId: 'row-1', kind: 'live_1on1' },
  line_items: { data: [{ description: '1:1 Live Session (30 min)' }] },
  ...over,
});

async function render(params: Record<string, string>) {
  return renderToStaticMarkup(await ThanksPage({ searchParams: params }));
}

beforeEach(() => {
  h.enabled = true;
  h.user = 'buyer-1';
  h.retrieve.mockReset();
  h.booking = {
    id: 'row-1', clientUserId: 'buyer-1',
    startsAt: new Date('2026-10-15T00:00:00Z'), endsAt: new Date('2026-10-15T00:30:00Z'),
  };
});

const CONTACT = ['FinalEvolution.us@gmail.com', '(424) 415-8330', '18543 Devonshire St #2012, Northridge, CA 91324'];

describe('/coach/thanks', () => {
  it('is a 404 while the store is off (nothing can be bought)', async () => {
    h.enabled = false;
    await expect(render({ row: 'row-1', session_id: 'cs_test_1' })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.retrieve).not.toHaveBeenCalled();
  });

  it('shows item, price, booked slot, next step and contact for a paid live session', async () => {
    h.retrieve.mockResolvedValue(session());
    const html = await render({ row: 'row-1', session_id: 'cs_test_1' });
    expect(h.retrieve).toHaveBeenCalledWith('cs_test_1', { expand: ['line_items'] });
    expect(html).toContain('Item: 1:1 Live Session (30 min)');
    expect(html).toContain('Price: $75.00');
    expect(html).toContain('Booked: Wed, Oct 14, 5:00 PM – 5:30 PM PT');
    expect(html).toContain('Next step: Add the call to your calendar');
    for (const c of CONTACT) expect(html).toContain(c);
  });

  it('says payment pending for an unpaid session', async () => {
    h.retrieve.mockResolvedValue(session({ payment_status: 'unpaid', status: 'open' }));
    const html = await render({ row: 'row-1', session_id: 'cs_test_1' });
    expect(html).toContain('Payment pending');
    expect(html).toContain('Stripe has not confirmed your payment yet');
  });

  it.each([
    ['no session id', { row: 'row-1' }],
    ['no row', { session_id: 'cs_test_1' }],
    ['not a checkout id', { row: 'row-1', session_id: 'pi_123' }],
  ])('a bad link (%s) shows a plain error with contact, never a 404', async (_n, params) => {
    const html = await render(params as Record<string, string>);
    expect(html).toContain('We could not show this order');
    expect(html).toContain('We could not find an order for this link');
    for (const c of CONTACT) expect(html).toContain(c);
    expect(h.retrieve).not.toHaveBeenCalled();
  });

  it('an unknown session at Stripe shows the plain error', async () => {
    h.retrieve.mockRejectedValue(Object.assign(new Error('No such checkout.session'), { type: 'StripeInvalidRequestError', statusCode: 404 }));
    expect(await render({ row: 'row-1', session_id: 'cs_test_nope' })).toContain('We could not find an order for this link');
  });

  it("someone else's session shows nothing of the order", async () => {
    h.retrieve.mockResolvedValue(session({ metadata: { product: 'COACH_STORE', userId: 'other', rowId: 'row-1', kind: 'live_1on1' } }));
    const html = await render({ row: 'row-1', session_id: 'cs_test_1' });
    expect(html).toContain('This order belongs to a different account');
    expect(html).not.toContain('1:1 Live Session');
    expect(html).not.toContain('$75.00');
  });

  it('a session for a different row is a bad link', async () => {
    h.retrieve.mockResolvedValue(session());
    expect(await render({ row: 'row-2', session_id: 'cs_test_1' })).toContain('We could not find an order for this link');
  });

  it('Stripe being down shows a retry message, not a crash', async () => {
    h.retrieve.mockRejectedValue(new Error('socket hang up'));
    expect(await render({ row: 'row-1', session_id: 'cs_test_1' })).toContain('reload this page in a minute');
  });

  it('signed out: asks to sign in and links back to this page', async () => {
    h.user = null;
    const html = await render({ row: 'row-1', session_id: 'cs_test_1' });
    expect(html).toContain('Sign in with the account you paid from');
    expect(html).toContain('coach%2Fthanks');
    expect(h.retrieve).not.toHaveBeenCalled();
  });

  it('no placeholder text on the page or its helpers', () => {
    for (const f of ['app/coach/thanks/page.tsx', 'lib/coach-store/thanks.ts', 'components/coach-store/thanks-contact.tsx']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/coming soon|to be completed|\[placeholder|\bTBD\b|lorem/i);
    }
  });

  it('the after-purchase routes the store links to all exist as pages', () => {
    for (const p of ['app/coach/dashboard/page.tsx', 'app/coach/dashboard/settings/page.tsx', 'app/live/schedule/page.tsx', 'app/program/unlock/page.tsx']) {
      expect(existsSync(p)).toBe(true);
    }
  });
});
