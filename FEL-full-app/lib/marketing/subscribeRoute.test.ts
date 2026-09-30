// POST /api/marketing/subscribe, DRIVEN (no database, no email) — JOIN-LAB-HIDE (2026-09-29).
//
// The Join the Lab form is hidden on `/` behind lib/marketing/joinLab.ts, and its intake is closed with it: a POST
// while the switch is off answers 404 { error: 'closed' } before the rate limit, the body, any database read or write,
// or any email. This drives the real handler with the database, the email sender, the rate limiter and the server
// telemetry mocked, so the guard moving below any of them fails here. With the switch on, the handler runs as before
// (one happy path, mocks only: never a real email).
//
// It lives in lib/marketing/ because vitest collects no tests under app/ (vitest.config.ts: routes there are covered
// by the static lib/api/routeContract.test.ts), the way lib/sessions-route.test.ts drives app/api/sessions/route.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    marketingLead: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    referralCode: { updateMany: vi.fn() },
  },
  sendWelcomeEmail: vi.fn(),
  notifyAdminNewLead: vi.fn(),
  recordServerEvent: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: h.prisma }));
vi.mock('@/lib/marketing/email', () => ({ sendWelcomeEmail: h.sendWelcomeEmail, notifyAdminNewLead: h.notifyAdminNewLead }));
vi.mock('@/lib/analytics-server', () => ({ recordServerEvent: h.recordServerEvent }));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  rateLimit: h.rateLimit,
}));

import { POST } from '@/app/api/marketing/subscribe/route';

const FLAG = 'NEXT_PUBLIC_JOIN_LAB_ENABLED';

function subscribe(body: unknown): Request {
  return new Request('http://127.0.0.1/api/marketing/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(body),
  });
}

/** Every side effect the intake has: none may run while it is closed. */
const SIDE_EFFECTS = () => ({
  'rateLimit': h.rateLimit,
  'prisma.user.findUnique': h.prisma.user.findUnique,
  'prisma.marketingLead.findUnique': h.prisma.marketingLead.findUnique,
  'prisma.marketingLead.upsert': h.prisma.marketingLead.upsert,
  'prisma.marketingLead.update': h.prisma.marketingLead.update,
  'prisma.referralCode.updateMany': h.prisma.referralCode.updateMany,
  'sendWelcomeEmail': h.sendWelcomeEmail,
  'notifyAdminNewLead': h.notifyAdminNewLead,
  'recordServerEvent': h.recordServerEvent,
});

describe('POST /api/marketing/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rateLimit.mockReturnValue({ ok: true, remaining: 7, retryAfterSec: 0 });
    h.prisma.user.findUnique.mockResolvedValue(null);
    h.prisma.marketingLead.findUnique.mockResolvedValue(null);
    h.prisma.marketingLead.upsert.mockResolvedValue({ id: 'lead_1' });
    h.prisma.marketingLead.update.mockResolvedValue({ id: 'lead_1' });
    h.prisma.referralCode.updateMany.mockResolvedValue({ count: 0 });
    h.sendWelcomeEmail.mockResolvedValue(true);
    h.notifyAdminNewLead.mockResolvedValue(true);
    h.recordServerEvent.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it.each([['unset', undefined], ["'false'", 'false'], ["'1'", '1']])(
    'with the switch %s: 404 { error: "closed" }, and nothing is read, written, limited or emailed',
    async (_label, value) => {
      vi.stubEnv(FLAG, value);
      const req = subscribe({ email: 'fan@example.com', source: 'landing_hero', ref: 'ABC123' });
      const res = await POST(req);

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'closed' });
      expect(req.bodyUsed, 'the body is never read').toBe(false);
      for (const [name, fn] of Object.entries(SIDE_EFFECTS())) expect(fn, name).not.toHaveBeenCalled();
    },
  );

  it("with the switch 'true': the intake runs as before (lead upserted, welcome and admin emails sent, all mocked)", async () => {
    vi.stubEnv(FLAG, 'true');
    const res = await POST(subscribe({ email: ' Fan@Example.com ', source: 'landing_hero' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, welcomed: true, alreadyMember: false });
    expect(h.rateLimit).toHaveBeenCalledTimes(1);
    expect(h.prisma.marketingLead.upsert).toHaveBeenCalledTimes(1);
    expect(h.prisma.marketingLead.upsert.mock.calls[0][0]).toMatchObject({
      where: { email: 'fan@example.com' },
      create: { email: 'fan@example.com', source: 'landing_hero' },
    });
    expect(h.sendWelcomeEmail).toHaveBeenCalledWith('fan@example.com', null);
    expect(h.notifyAdminNewLead).toHaveBeenCalledWith('fan@example.com', 'landing_hero');
  });
});
