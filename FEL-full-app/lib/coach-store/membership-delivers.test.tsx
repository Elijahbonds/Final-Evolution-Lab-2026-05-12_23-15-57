// STORE-ECON-EDU-10 Phase 3 (S15/S4/S16 — "membership delivers"): an ACTIVE paid membership opens a REAL
// program at /program/[accessId], never an empty page. Owner decision (Elijah, 4:18 PM PT Oct 7 2026):
// memberships SELL at launch and an ACTIVE adult membership opens /program/.
//
// The page is an async server component rendered here with prisma + next-auth mocked (vitest collects lib/ per
// vitest.config.ts; app/ is outside vitest's lib includes, the same pattern as program-access-open.test.tsx).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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

describe('P3 membership delivers — /program/[accessId] renders real program content for a membership', () => {
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
    const el = await ProgramPlayerPage({ params: { accessId: 'pa-mem' } } as never);
    return renderToStaticMarkup(createElement(el.type as never, { ...(el.props as object) } as never));
  }

  const membership = {
    id: 'pa-mem', userId: 'buyer-1', instructorId: 'ins-1', listingId: 'l', beneficiary: 'self',
    billing: 'month', priceCents: 2999, reviewCredits: 0, status: 'ACTIVE', accessUntil: null,
  };

  it('an ACTIVE adult membership (scope all) shows the program weeks — never an empty page', async () => {
    const html = await renderPage({ ...membership, scope: 'all', lane: 'adult' });
    expect(html).toContain('Your membership program');
    expect(html).toContain('Week 1');
    expect(html).toContain('Week 8');
    expect(html).not.toContain("isn&#x27;t active");
  });

  it('an ACTIVE adult membership opens the course and series video libraries', async () => {
    const html = await renderPage({ ...membership, scope: 'all', lane: 'adult' });
    expect(html).toContain('Signature Dunk Course');
    expect(html).toContain('Blueprint series');
    expect(html).toContain('youtu.be');
  });

  it('an ACTIVE teen membership (scope teen_all) shows the program weeks but never the external video links', async () => {
    const html = await renderPage({ ...membership, scope: 'teen_all', lane: 'teen', beneficiary: 'teen' });
    expect(html).toContain('Your membership program');
    expect(html).toContain('Week 1');
    // teen members keep the program on the phone: no external course/series video links.
    expect(html).not.toContain('youtu.be');
    expect(html).not.toContain('Signature Dunk Course');
    expect(html).not.toContain('Blueprint series');
  });

  it('a teen membership filters adult-only drills out of the weeks', async () => {
    const html = await renderPage({ ...membership, scope: 'teen_all', lane: 'teen', beneficiary: 'teen' });
    // 'Loaded jump' is adultOnly (lib/coach-store/dunkProgram week 4); a teen must never see it.
    expect(html).not.toContain('Loaded jump');
    expect(html).toContain('One-foot takeoff'); // the non-adult week-4 drill stays
  });

  it('an unpaid (PENDING) membership shows no program content — the paywall still holds', async () => {
    const html = await renderPage({ ...membership, scope: 'all', lane: 'adult', status: 'PENDING' });
    expect(html).toContain("This program isn&#x27;t active.");
    expect(html).not.toContain('Week 1');
    expect(html).not.toContain('youtu.be');
  });

  it('a cancelled membership past accessUntil shows no content', async () => {
    const html = await renderPage({
      ...membership, scope: 'all', lane: 'adult', status: 'ACTIVE', accessUntil: new Date('2026-10-01T00:00:00Z'),
    });
    expect(html).toContain("This program isn&#x27;t active.");
    expect(html).not.toContain('Week 1');
  });

  it('a one-time dunking program (scope lane) still renders exactly the weeks, no course/series', async () => {
    const html = await renderPage({
      ...membership, scope: 'lane', lane: 'dunking', billing: 'one_time',
    });
    expect(html).toContain('Your program');
    expect(html).toContain('Week 1');
    expect(html).not.toContain('Signature Dunk Course');
    expect(html).not.toContain('Blueprint series');
  });
});
