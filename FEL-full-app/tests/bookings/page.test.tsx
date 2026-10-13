// /account/bookings (owner 2026-10-13): signed-in only, COACH_STORE_ENABLED-gated, the buyer's own rows, "not set up yet" on a
// missing table. next-auth, prisma, the flag and next/navigation are mocked; the page and the view model are real.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({
  flag: true,
  session: { user: { id: 'buyer-1' } } as { user: { id?: string } } | null,
  rows: [] as Array<Record<string, unknown>>,
  where: null as Record<string, unknown> | null,
  missingTable: false,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/flags', () => ({ isCoachStoreEnabled: () => h.flag }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    booking: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        h.where = args.where;
        if (h.missingTable) throw Object.assign(new Error('missing'), { code: 'P2021' });
        return h.rows;
      },
    },
  },
}));
vi.mock('@/lib/coach-store/api', () => ({ icsFor: (id: string) => `BEGIN:VCALENDAR ${id}` }));

import BookingsPage from '@/app/account/bookings/page';

const LATER = new Date(Date.now() + 3 * 3_600_000);
const base = {
  kind: 'video_review', status: 'PAID', startsAt: null, endsAt: null, submittedAt: null, deliveredAt: null, dueAt: null,
  createdAt: new Date(), clientTimeZone: 'America/Los_Angeles',
};

async function render(): Promise<string> {
  const jsx = await (BookingsPage as unknown as () => Promise<React.ReactElement>)();
  return renderToStaticMarkup(jsx);
}

beforeEach(() => {
  h.flag = true; h.session = { user: { id: 'buyer-1' } }; h.rows = []; h.where = null; h.missingTable = false;
  process.env.NEXTAUTH_URL = 'https://fel.example';
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('/account/bookings gates', () => {
  it('COACH_STORE_ENABLED off is a 404, before anything is read', async () => {
    h.flag = false;
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.where).toBeNull();
  });

  it('signed out goes to login and comes back to /account/bookings', async () => {
    h.session = null;
    await expect(render()).rejects.toThrow(/NEXT_REDIRECT:.*login.*bookings/i);
    expect(h.where).toBeNull();
  });

  it('a missing table says "not set up yet" and does not throw', async () => {
    h.missingTable = true;
    expect(await render()).toContain('Coach store is not set up yet.');
  });

  it('reads only the buyer\'s own rows as client, never held or expired ones', async () => {
    await render();
    expect(h.where).toMatchObject({ clientUserId: 'buyer-1', status: { notIn: ['HELD', 'EXPIRED'] } });
  });

  it('lists newest first (the query orders by createdAt desc)', () => {
    const src = readFileSync('app/account/bookings/page.tsx', 'utf8');
    expect(src).toContain("orderBy: { createdAt: 'desc' }");
    expect(src).toContain("import { icsFor } from '@/lib/coach-store/api'");
  });
});

describe('/account/bookings rows', () => {
  it('an empty list says so and points to coaching', async () => {
    const html = await render();
    expect(html).toContain('No bookings yet.');
    expect(html).toContain('href="/coach"');
    expect(html).toContain('href="/account/coaching"');
  });

  it('a paid review: Upload clips + Receipt; after submission it says Open review', async () => {
    h.rows = [{ ...base, id: 'rv_1' }];
    let html = await render();
    expect(html).toContain('href="/coach/review/rv_1"');
    expect(html).toContain('Upload clips');
    expect(html).toContain('href="/api/coach-store/receipt/rv_1"');
    h.rows = [{ ...base, id: 'rv_1', submittedAt: new Date() }];
    html = await render();
    expect(html).toContain('Open review');
    expect(html).not.toContain('Upload clips');
  });

  it('a live call inside its window: Join call + Add to calendar + Receipt', async () => {
    const start = new Date(Date.now() + 5 * 60_000);
    h.rows = [{ ...base, id: 'lv_1', kind: 'live_1on1', startsAt: start, endsAt: new Date(start.getTime() + 30 * 60_000) }];
    const html = await render();
    expect(html).toContain('href="/session/lv_1"');
    expect(html).toContain('Join call');
    expect(html).toContain('Add to calendar');
    expect(html).toContain('href="/api/coach-store/receipt/lv_1"');
  });

  it('a live call hours away: no Join call, but the room-opens line and Add to calendar', async () => {
    h.rows = [{ ...base, id: 'lv_2', kind: 'live_1on1', startsAt: LATER, endsAt: new Date(LATER.getTime() + 30 * 60_000) }];
    const html = await render();
    expect(html).not.toContain('Join call');
    expect(html).toContain('minutes before your call');
    expect(html).toContain('Add to calendar');
  });

  it('a refunded row has no actions but still shows', async () => {
    h.rows = [{ ...base, id: 'rv_9', status: 'REFUNDED' }];
    const html = await render();
    expect(html).toContain('Refunded');
    expect(html).not.toContain('Upload clips');
    expect(html).not.toContain('/api/coach-store/receipt/rv_9');
  });
});
