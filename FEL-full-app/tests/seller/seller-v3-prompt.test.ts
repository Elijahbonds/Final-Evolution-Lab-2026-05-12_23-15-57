// SELLER-18-1 v3 (Cyber re-review N5 / C2): the /coach/business birth-year prompt is only for an account that really
// sells there (coach-business seller rows: a Connect account, a market profile or a package). A plain visitor with no
// birth year — possibly a teen — is never told to "add your birth year to sell". Setting off and on.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactNode } from 'react';

const h = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  users: {} as Record<string, number | null>,
  connect: [] as string[], profiles: [] as string[], packages: [] as string[],
  cartridges: [] as string[],
}));

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); } }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: async ({ where }: { where: { id: string } }) => (where.id in h.users ? { dobYear: h.users[where.id] } : null) },
    facilitatorProfile: { findUnique: async () => null },
    instructor: { findUnique: async () => null, count: async () => 0 },
    marketplaceListing: {
      count: async ({ where }: { where: { creatorId: string; listingType?: unknown } }) =>
        (where.listingType === 'CARTRIDGE' && h.cartridges.includes(where.creatorId) ? 1 : 0),
    },
    $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
      const id = String(args[0]);
      if (sql.includes('"CoachConnectAccount"')) return h.connect.includes(id) ? [{ ok: 1 }] : [];
      if (sql.includes('"CoachMarketProfile"')) return h.profiles.includes(id) ? [{ ok: 1 }] : [];
      if (sql.includes('"CoachPackage"')) return h.packages.includes(id) ? [{ ok: 1 }] : [];
      return [];
    },
  },
}));

import CoachBusinessPage from '@/app/coach/business/page';
import { SellerBirthYearPrompt } from '@/components/seller/birth-year-prompt';
import { sellerNeedsBirthYear } from '@/lib/seller/server';

function contains(node: ReactNode, type: unknown): boolean {
  if (Array.isArray(node)) return node.some((n) => contains(n, type));
  if (!isValidElement(node)) return false;
  if (node.type === type) return true;
  return contains((node.props as { children?: ReactNode }).children, type);
}
const prompted = async (id: string) => { h.session = { user: { id } }; return contains(await CoachBusinessPage(), SellerBirthYearPrompt); };

const saved = process.env.SELLER_ADULT_GATE_ENABLED;
beforeEach(() => {
  h.users = { plain: null, studio: null, viaConnect: null, viaProfile: null, viaPackage: null, adult: 1990 };
  h.connect = ['viaConnect', 'adult']; h.profiles = ['viaProfile']; h.packages = ['viaPackage'];
  h.cartridges = ['studio'];
  return () => { if (saved === undefined) delete process.env.SELLER_ADULT_GATE_ENABLED; else process.env.SELLER_ADULT_GATE_ENABLED = saved; };
});

for (const on of [false, true]) {
  describe(`/coach/business birth-year prompt, setting ${on ? 'on' : 'off'}`, () => {
    beforeEach(() => { if (on) process.env.SELLER_ADULT_GATE_ENABLED = '1'; else delete process.env.SELLER_ADULT_GATE_ENABLED; });

    it('a plain signed-in user with no birth year and no seller rows sees NO prompt', async () => {
      expect(await prompted('plain')).toBe(false);
    });

    it('a Studio-only creator (cartridges are not coach-business rows) sees no prompt here', async () => {
      expect(await prompted('studio')).toBe(false);
    });

    it('an unknown-age coach with a Connect account, a market profile or a package sees the prompt', async () => {
      for (const id of ['viaConnect', 'viaProfile', 'viaPackage']) expect(await prompted(id), id).toBe(true);
    });

    it('a coach with seller rows and a birth year sees no prompt', async () => {
      expect(await prompted('adult')).toBe(false);
    });
  });
}

describe('sellerNeedsBirthYear on the surfaces with no role of their own', () => {
  it('coach_business and studio need seller rows; a seller-rows read that fails shows nothing', async () => {
    expect(await sellerNeedsBirthYear('plain', 'coach_business')).toBe(false);
    expect(await sellerNeedsBirthYear('viaPackage', 'coach_business')).toBe(true);
    expect(await sellerNeedsBirthYear('plain', 'studio')).toBe(false);
    expect(await sellerNeedsBirthYear('studio', 'studio')).toBe(true);
    h.users.broken = null; h.packages = ['broken'];
    const { prisma } = await import('@/lib/db');
    const raw = prisma.$queryRawUnsafe;
    (prisma as { $queryRawUnsafe: unknown }).$queryRawUnsafe = async () => { throw new Error('table missing'); };
    try {
      expect(await sellerNeedsBirthYear('broken', 'coach_business')).toBe(false);
    } finally {
      (prisma as { $queryRawUnsafe: unknown }).$queryRawUnsafe = raw;
    }
  });
});
