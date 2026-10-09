// STORE-READY B4 (F20): the program player shows NOTHING to an unpaid, refunded, expired, paused or cancelled
// ProgramAccess row, or one past accessUntil — and the thanks page + /account/coaching link "Open your program"
// only for an open row; receiptFor issues a receipt only for a paid one.
//
// The truth table is pure (lib/coach-store/access.ts). The page is an async server component rendered here with
// prisma + next-auth mocked (vitest collects tests/ per vitest.config.ts; app/ is outside vitest's lib includes).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { programAccessOpen } from '@/lib/coach-store/access';

const readFileSyncForTest = (p: string): string => readFileSync(p, 'utf8');

const h = vi.hoisted(() => ({
  userId: 'buyer-1' as string | null,
  access: null as Record<string, unknown> | null,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => (h.userId ? { user: { id: h.userId } } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    programAccess: { findUnique: async () => h.access },
  },
}));

const NOW = new Date('2026-10-07T12:00:00Z');

describe('B4 programAccessOpen truth table', () => {
  it('PENDING, EXPIRED, REFUNDED, CANCELED, PAUSED are all closed', () => {
    for (const status of ['PENDING', 'EXPIRED', 'REFUNDED', 'CANCELED', 'PAUSED', 'DISPUTED', 'HELD']) {
      expect(programAccessOpen({ status, accessUntil: null }, NOW), status).toBe(false);
    }
  });

  it('ACTIVE and PAST_DUE are open while accessUntil is null or in the future', () => {
    expect(programAccessOpen({ status: 'ACTIVE', accessUntil: null }, NOW)).toBe(true);
    expect(programAccessOpen({ status: 'PAST_DUE', accessUntil: null }, NOW)).toBe(true);
    expect(programAccessOpen({ status: 'ACTIVE', accessUntil: new Date('2026-11-01T00:00:00Z') }, NOW)).toBe(true);
  });

  it('an ACTIVE row whose accessUntil has passed is closed', () => {
    expect(programAccessOpen({ status: 'ACTIVE', accessUntil: new Date('2026-10-01T00:00:00Z') }, NOW)).toBe(false);
    expect(programAccessOpen({ status: 'PAST_DUE', accessUntil: new Date('2026-10-07T11:59:59Z') }, NOW)).toBe(false);
  });
});

describe('B4 program player page (app/program/[accessId])', () => {
  beforeEach(() => {
    process.env.COACH_STORE_ENABLED = '1';
    h.userId = 'buyer-1';
  });
  afterEach(() => {
    delete process.env.COACH_STORE_ENABLED;
    h.access = null;
  });

  async function renderPage(access: Record<string, unknown>) {
    h.access = access;
    const { default: ProgramPlayerPage } = await import('@/app/program/[accessId]/page');
    const el = await ProgramPlayerPage({ params: { accessId: 'pa-1' } } as never);
    return renderToStaticMarkup(createElement(el.type as never, { ...(el.props as object) } as never));
  }

  const base = {
    id: 'pa-1', userId: 'buyer-1', instructorId: 'ins-1', listingId: 'l', beneficiary: 'self',
    scope: 'lane', lane: 'dunking', billing: 'one_time', priceCents: 7900, reviewCredits: 0,
  };

  it('PENDING (unpaid) shows no week or video content', async () => {
    const html = await renderPage({ ...base, status: 'PENDING', accessUntil: null });
    expect(html).toContain("This program isn&#x27;t active.");
    expect(html).not.toContain('Week 1');
    expect(html).not.toContain('youtu.be');
  });

  it.each(['EXPIRED', 'REFUNDED', 'CANCELED', 'PAUSED'])('%s shows no program content', async (status) => {
    const html = await renderPage({ ...base, status, accessUntil: null });
    expect(html).toContain("This program isn&#x27;t active.");
    expect(html).not.toContain('Week 1');
  });

  it('ACTIVE past accessUntil shows no content', async () => {
    const html = await renderPage({ ...base, status: 'ACTIVE', accessUntil: new Date('2026-10-01T00:00:00Z') });
    expect(html).toContain("This program isn&#x27;t active.");
    expect(html).not.toContain('Week 1');
  });

  it('ACTIVE shows the program weeks', async () => {
    const html = await renderPage({ ...base, status: 'ACTIVE', accessUntil: null });
    expect(html).toContain('Week 1');
    expect(html).not.toContain("isn&#x27;t active");
  });
});

describe('B4 source wiring: rowStatus, receiptFor, thanks + account links', () => {
  it('rowStatus returns a server-computed programOpen', () => {
    const api = readFileSyncForTest('lib/coach-store/api.ts');
    expect(api).toContain('programOpen: programAccessOpen(access, new Date())');
  });

  it('receiptFor issues a receipt only for PAID bookings or ACTIVE/PAST_DUE/CANCELED access rows', () => {
    const api = readFileSyncForTest('lib/coach-store/api.ts');
    expect(api).toContain("booking.status === 'PAID' : ['ACTIVE', 'PAST_DUE', 'CANCELED'].includes(access!.status)");
  });

  it('ThanksPoll links "Open your program" only when programOpen is true', () => {
    const poll = readFileSyncForTest('components/coach-store/thanks-poll.tsx');
    expect(poll).toContain('json.programOpen === true');
    expect(poll).toContain('programOpen ? <a');
    expect(poll).toContain('/program/${rowId}');
  });

  it('/account/coaching links the program only for open rows and shows "Ends" for a cancelling membership', () => {
    const page = readFileSyncForTest('app/account/coaching/page.tsx');
    expect(page).toContain('programAccessOpen(row, now)');
    expect(page).toContain('open ? <Link className="underline" href={`/program/${row.id}`}');
    expect(page).toContain('Ends ');
  });
});
