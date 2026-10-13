import { describe, expect, it } from 'vitest';
import { rateLimit } from '@/lib/rate-limit';
import { INQUIRIES_UNAVAILABLE_MESSAGE, INQUIRY_LIMIT, submitInquiry } from './inquiry';
import type { InquiryRecord, SaveInquiryResult } from './inquiryStore';

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

/** A save() that records what it was given and answers like the Postgres store would. */
function fakeSave(answer: SaveInquiryResult | 'throw' = { ok: true, id: 'inq_1' }) {
  const saved: InquiryRecord[] = [];
  const save = async (record: InquiryRecord): Promise<SaveInquiryResult> => {
    if (answer === 'throw') throw new Error('db down');
    if (answer.ok) saved.push(record);
    return answer;
  };
  return { save, saved };
}

describe('work-with-us inquiry', () => {
  it('saves a valid inquiry with lower-cased email, the approved profile, and no IP or IP hash', async () => {
    const db = fakeSave();
    const ip = freshIp();
    const res = await submitInquiry(valid({ profile: 'elijah-bonds' }), ip, { save: db.save });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, id: 'inq_1' });
    expect(db.saved).toHaveLength(1);
    expect(db.saved[0]).toEqual({
      brand: 'Acme Hoops', contactName: 'Sam Rivera', email: 'sam@acme.test', budgetRange: '5k-15k', dates: 'November',
      deliverables: 'Two reels', message: 'Hello', profileSlug: 'elijah-bonds', source: 'work-with-us',
    });
    // The owner dropped the salted IP hash (2026-10-13): nothing about the caller's address reaches the store.
    expect(JSON.stringify(db.saved[0])).not.toContain(ip);
    expect(db.saved[0]).not.toHaveProperty('ipHash');
    expect(db.saved[0]).not.toHaveProperty('website');
    expect(db.saved[0]).not.toHaveProperty('consent');
  });

  it('keeps no profile for an unknown or unapproved slug', async () => {
    const db = fakeSave();
    await submitInquiry(valid({ profile: 'example-teammate' }), freshIp(), { save: db.save });
    await submitInquiry(valid({ profile: 'nobody' }), freshIp(), { save: db.save });
    expect(db.saved.map((r) => r.profileSlug)).toEqual([null, null]);
  });

  it('rejects bad input with 400 and field issues, and stores nothing', async () => {
    const db = fakeSave();
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
      const res = await submitInquiry(body, freshIp(), { save: db.save });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(Array.isArray(res.body.issues)).toBe(true);
    }
    expect(db.saved).toHaveLength(0);
  });

  it('drops a honeypot submission with a 201 and stores nothing', async () => {
    const db = fakeSave();
    const res = await submitInquiry(valid({ website: 'http://spam.test' }), freshIp(), { save: db.save });
    expect(res.status).toBe(201);
    expect(db.saved).toHaveLength(0);
  });

  it('rate-limits one IP with 429 and a Retry-After', async () => {
    const db = fakeSave();
    const ip = freshIp();
    const limit = (k: string) => rateLimit(k, INQUIRY_LIMIT, 60_000);
    const statuses: number[] = [];
    for (let i = 0; i < INQUIRY_LIMIT + 1; i += 1) {
      statuses.push((await submitInquiry(valid(), ip, { save: db.save, limit })).status);
    }
    const last = await submitInquiry(valid(), ip, { save: db.save, limit });
    expect(statuses.slice(0, INQUIRY_LIMIT).every((s) => s === 201)).toBe(true);
    expect(statuses[INQUIRY_LIMIT]).toBe(429);
    expect(last.status).toBe(429);
    expect(last.headers?.['Retry-After']).toMatch(/^\d+$/);
    expect(db.saved).toHaveLength(INQUIRY_LIMIT);
    // Another IP is unaffected.
    expect((await submitInquiry(valid(), freshIp(), { save: db.save, limit })).status).toBe(201);
  });

  it('FAILS CLOSED before the table exists: 503 inquiries_unavailable with an honest message, nothing stored', async () => {
    const db = fakeSave({ ok: false, reason: 'unavailable' });
    const res = await submitInquiry(valid(), freshIp(), { save: db.save });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'inquiries_unavailable', message: INQUIRIES_UNAVAILABLE_MESSAGE });
    expect(INQUIRIES_UNAVAILABLE_MESSAGE).toMatch(/unavailable/i);
    expect(db.saved).toHaveLength(0);
  });

  it('a database failure is a 500, never a 201 that lost the inquiry', async () => {
    expect((await submitInquiry(valid(), freshIp(), { save: fakeSave({ ok: false, reason: 'failed' }).save })).status).toBe(500);
    expect((await submitInquiry(valid(), freshIp(), { save: fakeSave('throw').save })).status).toBe(500);
  });
});
