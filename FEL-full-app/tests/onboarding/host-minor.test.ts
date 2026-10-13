import { beforeEach, describe, expect, it, vi } from 'vitest';

// CARD-SAFE-1 (Cyber review #1): GET /api/onboarding/host?ref=CODE is unauthenticated, so a code must not expose a
// minor's card or name. Age comes only from the server User.dobYear (isVerifiedAdult).
const h = vi.hoisted(() => ({ dobYear: null as number | null }));
const Y = new Date().getFullYear();
const ROW = { user: { id: 'u1', name: 'Jamie Kid', creatorCards: [{ displayName: 'Jamie J', mode: 'skateboarding', accent: '#00E5FF' }] } };
vi.mock('@/lib/db', () => ({
  prisma: {
    referralCode: { findUnique: vi.fn(async () => ROW) },
    user: { findUnique: vi.fn(async () => ({ dobYear: h.dobYear })) },
    scanSaveOptIn: { findUnique: vi.fn(async () => null) },
  },
}));

import { GET } from '@/app/api/onboarding/host/route';
import { hostFrom } from '@/lib/onboarding/firstRun';

const call = async () => (await GET({ nextUrl: new URL('http://x/api/onboarding/host?ref=JAMIE1') } as any)).json();

describe('GET /api/onboarding/host (CARD-SAFE-1)', () => {
  beforeEach(() => { h.dobYear = null; });

  it('a minor with a published card and a ref code: no card fields and no name', async () => {
    for (const dob of [Y - 15, Y - 18, null]) {
      h.dobYear = dob;
      const body = await call();
      expect(body).toEqual({ host: null });
      const s = JSON.stringify(body);
      for (const leak of ['Jamie', 'skateboarding', '#00E5FF', 'u1']) expect(s).not.toContain(leak);
    }
    expect(hostFrom(null, null)).toBeNull();
  });

  it("an adult's response is unchanged", async () => {
    h.dobYear = Y - 30;
    expect(await call()).toEqual({ host: { name: 'Jamie J', mode: 'skateboarding', accent: '#00E5FF' } });
  });
});
