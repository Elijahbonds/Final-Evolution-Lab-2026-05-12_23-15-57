// COACH-HOURS-SETTINGS: POST /api/coach-store/settings, driven with a mocked prisma and session.
// Covers the unchanged auth guards (flag off -> 404, no session -> 401, non-allowlisted -> 404), the
// new weeklyHours/blackoutDates validation path (400 + no write on bad input), the missing-row guard
// (409 + no write), and that existing fields still save exactly as before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: { user: { id: 'coach-1' } } as { user: { id: string } } | null,
  instructor: null as Record<string, unknown> | null,
  updateManyCalls: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
  findUniqueCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    instructor: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        h.findUniqueCalls.push(where);
        return h.instructor;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        h.updateManyCalls.push({ where, data });
        return { count: h.instructor ? 1 : 0 };
      },
    },
    marketplaceListing: {
      findUnique: async () => null,
      update: async () => ({}),
    },
  },
}));

import { POST } from '@/app/api/coach-store/settings/route';

const ORIGINAL_ENABLED = process.env.COACH_STORE_ENABLED;
const ORIGINAL_ALLOWLIST = process.env.COACH_STORE_COACH_USER_IDS;

function req(body: unknown): Request {
  return new Request('http://localhost/api/coach-store/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.COACH_STORE_ENABLED = '1';
  process.env.COACH_STORE_COACH_USER_IDS = 'coach-1';
  h.session = { user: { id: 'coach-1' } };
  h.instructor = { id: 'inst-1', userId: 'coach-1' };
  h.updateManyCalls = [];
  h.findUniqueCalls = [];
});

afterEach(() => {
  if (ORIGINAL_ENABLED === undefined) delete process.env.COACH_STORE_ENABLED;
  else process.env.COACH_STORE_ENABLED = ORIGINAL_ENABLED;
  if (ORIGINAL_ALLOWLIST === undefined) delete process.env.COACH_STORE_COACH_USER_IDS;
  else process.env.COACH_STORE_COACH_USER_IDS = ORIGINAL_ALLOWLIST;
});

describe('POST /api/coach-store/settings — auth guards (unchanged)', () => {
  it('flag off -> 404, no DB call', async () => {
    process.env.COACH_STORE_ENABLED = '0';
    const res = await POST(req({ weeklyHours: [] }) as never);
    expect(res.status).toBe(404);
    expect(h.updateManyCalls).toHaveLength(0);
    expect(h.findUniqueCalls).toHaveLength(0);
  });

  it('no session -> 401', async () => {
    h.session = null;
    const res = await POST(req({ weeklyHours: [] }) as never);
    expect(res.status).toBe(401);
    expect(h.updateManyCalls).toHaveLength(0);
  });

  it('non-allowlisted user -> 404 and no write', async () => {
    process.env.COACH_STORE_COACH_USER_IDS = 'someone-else';
    const res = await POST(req({ weeklyHours: [] }) as never);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('not_found');
    expect(h.updateManyCalls).toHaveLength(0);
  });
});

describe('POST /api/coach-store/settings — weeklyHours/blackoutDates', () => {
  it('allowlisted coach: valid weeklyHours is normalized and written scoped to their own userId', async () => {
    const res = await POST(req({
      weeklyHours: [
        { dow: 2, startMin: 600, endMin: 660 },
        { dow: 0, startMin: 540, endMin: 600 },
      ],
    }) as never);
    expect(res.status).toBe(200);
    expect(h.updateManyCalls).toHaveLength(1);
    expect(h.updateManyCalls[0].where).toEqual({ userId: 'coach-1' });
    expect(h.updateManyCalls[0].data.weeklyHours).toEqual([
      { dow: 0, startMin: 540, endMin: 600 },
      { dow: 2, startMin: 600, endMin: 660 },
    ]);
  });

  it('allowlisted coach: valid blackoutDates is normalized and written', async () => {
    const d1 = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const d2 = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
    const res = await POST(req({ blackoutDates: [d2, d1] }) as never);
    expect(res.status).toBe(200);
    expect(h.updateManyCalls[0].data.blackoutDates).toEqual([d1, d2].sort());
  });

  it('invalid weeklyHours -> 400 and writes nothing, even with other valid fields present', async () => {
    const res = await POST(req({
      weeklyHours: [{ dow: 9, startMin: 540, endMin: 600 }],
      businessMailingAddress: 'PO Box 42, Springfield',
    }) as never);
    expect(res.status).toBe(400);
    expect(h.updateManyCalls).toHaveLength(0);
  });

  it('invalid blackoutDates -> 400 and writes nothing', async () => {
    const res = await POST(req({ blackoutDates: ['2026-02-30'] }) as never);
    expect(res.status).toBe(400);
    expect(h.updateManyCalls).toHaveLength(0);
  });

  it('no Instructor row -> 409 coach_profile_missing and writes nothing', async () => {
    h.instructor = null;
    const res = await POST(req({ weeklyHours: [{ dow: 1, startMin: 540, endMin: 600 }] }) as never);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('coach_profile_missing');
    expect(h.updateManyCalls).toHaveLength(0);
  });

  it('does not require an Instructor row lookup when hours fields are absent', async () => {
    const res = await POST(req({ businessMailingAddress: 'PO Box 42, Springfield' }) as never);
    expect(res.status).toBe(200);
    expect(h.findUniqueCalls).toHaveLength(0);
  });
});

describe('POST /api/coach-store/settings — existing fields unaffected', () => {
  it('businessMailingAddress/reviewSlaHours/clientFullRefundHours/refundBusinessDays still save as before', async () => {
    const res = await POST(req({
      businessMailingAddress: 'PO Box 42, Springfield',
      reviewSlaHours: 48,
      clientFullRefundHours: 24,
      refundBusinessDays: 5,
    }) as never);
    expect(res.status).toBe(200);
    expect(h.updateManyCalls[0].data).toEqual({
      businessMailingAddress: 'PO Box 42, Springfield',
      reviewSlaHours: 48,
      clientFullRefundHours: 24,
      refundBusinessDays: 5,
    });
  });
});
