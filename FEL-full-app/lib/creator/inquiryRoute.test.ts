// POST /api/creator/inquiry end to end with a mocked database: the route fails closed (503 inquiries_unavailable)
// until the CreatorInquiry table exists, and stores a valid inquiry once it does. No Prisma client is opened.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  tableThere: false,
  executed: [] as Array<{ sql: string; values: unknown[] }>,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRawUnsafe: async () => (h.tableThere ? [{ ok: 1 }] : []),
    $executeRawUnsafe: async (sql: string, ...values: unknown[]) => {
      h.executed.push({ sql, values });
      return 1;
    },
  },
}));

import { POST } from '@/app/api/creator/inquiry/route';
import { resetInquiryProbe } from '@/lib/creator/inquiryStore';

let n = 0;
function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/creator/inquiry', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${(n += 1)}` },
    body: JSON.stringify(body),
  });
}

const VALID = {
  brand: 'Acme Hoops', contactName: 'Sam Rivera', email: 'sam@acme.test', budgetRange: '5k-15k',
  deliverables: 'Two reels', message: 'Hello', consent: true, website: '',
};

beforeEach(() => {
  resetInquiryProbe();
  h.tableThere = false;
  h.executed.length = 0;
});

describe('POST /api/creator/inquiry', () => {
  it('before the pending SQL is applied: 503 inquiries_unavailable, nothing written', async () => {
    const res = await POST(post(VALID));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'inquiries_unavailable' });
    expect(h.executed).toEqual([]);
  });

  it('after it is applied: 201 and one parameterised INSERT', async () => {
    h.tableThere = true;
    const res = await POST(post(VALID));
    expect(res.status).toBe(201);
    expect(h.executed.some((e) => e.sql.startsWith('INSERT INTO "CreatorInquiry"'))).toBe(true);
  });
});
