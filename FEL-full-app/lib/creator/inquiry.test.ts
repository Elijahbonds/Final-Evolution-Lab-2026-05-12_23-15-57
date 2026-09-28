import { describe, expect, it } from 'vitest';
import { rateLimit } from '@/lib/rate-limit';
import { INQUIRY_LIMIT, submitInquiry } from './inquiry';
import { memoryCreatorStore } from './creatorStore';

const SALTED = { CREATOR_IP_SALT: 'test-salt' } as unknown as NodeJS.ProcessEnv;
const NOW = new Date('2026-10-05T12:00:00Z');

let ipSeq = 0;
const freshIp = () => `203.0.113.${++ipSeq}`;

const valid = (over: Record<string, unknown> = {}) => ({
  brand: 'Acme Hoops',
  contactName: 'Sam Rivera',
  email: 'Sam@Acme.test',
  budgetRange: '5k-15k',
  dates: 'November',
  deliverables: 'Two reels',
  message: 'Hello',
  consent: true,
  website: '',
  ...over,
});

describe('work-with-us inquiry', () => {
  it('stores a valid inquiry as NEW with a salted IP hash and no raw IP', async () => {
    const db = memoryCreatorStore();
    const ip = freshIp();
    const res = await submitInquiry(valid({ profile: 'elijah-bonds' }), ip, { store: db.store, env: SALTED, now: NOW });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true, id: 'inq_1' });
    const row = db.inquiries.get('inq_1')!;
    expect(row).toMatchObject({
      brand: 'Acme Hoops', email: 'sam@acme.test', budgetRange: '5k-15k', status: 'NEW', source: 'work-with-us',
      profileSlug: 'elijah-bonds', consent: true, createdAt: NOW.toISOString(),
    });
    expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(ip);
    expect(row).not.toHaveProperty('website');
  });

  it('stores no hash at all without a salt, rather than an unsalted one', async () => {
    const db = memoryCreatorStore();
    await submitInquiry(valid(), freshIp(), { store: db.store, env: {} as NodeJS.ProcessEnv });
    expect(db.inquiries.get('inq_1')?.ipHash).toBeNull();
  });

  it('rejects bad input with 400 and field issues, and stores nothing', async () => {
    const db = memoryCreatorStore();
    const cases = [
      valid({ email: 'not-an-email' }),
      valid({ consent: false }),
      valid({ budgetRange: 'a-million' }),
      valid({ brand: '   ' }),
      valid({ deliverables: '' }),
      valid({ message: 'x'.repeat(4001) }),
      null,
    ];
    for (const body of cases) {
      const res = await submitInquiry(body, freshIp(), { store: db.store, env: SALTED });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(Array.isArray(res.body.issues)).toBe(true);
    }
    expect(db.inquiries.size).toBe(0);
  });

  it('drops a honeypot submission with a 201 and stores nothing', async () => {
    const db = memoryCreatorStore();
    const res = await submitInquiry(valid({ website: 'http://spam.test' }), freshIp(), { store: db.store, env: SALTED });
    expect(res.status).toBe(201);
    expect(db.inquiries.size).toBe(0);
  });

  it('rate-limits one IP with 429 and a Retry-After', async () => {
    const db = memoryCreatorStore();
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < INQUIRY_LIMIT + 1; i += 1) {
      statuses.push((await submitInquiry(valid(), ip, { store: db.store, env: SALTED, limit: (k) => rateLimit(k, INQUIRY_LIMIT, 60_000) })).status);
    }
    expect(statuses.slice(0, INQUIRY_LIMIT).every((s) => s === 201)).toBe(true);
    const last = await submitInquiry(valid(), ip, { store: db.store, env: SALTED });
    expect(statuses[INQUIRY_LIMIT]).toBe(429);
    expect(last.status).toBe(429);
    expect(last.headers?.['Retry-After']).toMatch(/^\d+$/);
    expect(db.inquiries.size).toBe(INQUIRY_LIMIT);
    // Another IP is unaffected.
    expect((await submitInquiry(valid(), freshIp(), { store: db.store, env: SALTED })).status).toBe(201);
  });

  it('answers 503 when the store is not configured', async () => {
    expect((await submitInquiry(valid(), freshIp(), { store: null, env: SALTED })).status).toBe(503);
  });
});
