// GET/POST /api/education/playbook, DRIVEN — progress outages must not look like "0 lessons done".
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { CHAPTERS } from './course';

const h = vi.hoisted(() => ({
  session: { user: { id: 'u1' } } as unknown,
  rows: [] as { lessonKey: string }[],
  findCalls: 0,
  failFindOnCall: 0,
  failUpsert: false,
  upserts: [] as unknown[],
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    lessonProgress: {
      findMany: async () => {
        h.findCalls++;
        if (h.failFindOnCall === h.findCalls) throw new Error('lessonProgress unavailable');
        return h.rows;
      },
      upsert: async (arg: unknown) => {
        if (h.failUpsert) throw new Error('lessonProgress unavailable');
        h.upserts.push(arg);
        return {};
      },
    },
    walletLedgerEntry: { findMany: async () => [] },
  },
}));
vi.mock('@/lib/wallet/wallet-service', () => ({ grantServerReward: async () => null }));

import { GET, POST } from '@/app/api/education/playbook/route';

const firstLesson = CHAPTERS[0].lessons[0];
const req = (body: unknown) =>
  new NextRequest('http://fel.test/api/education/playbook', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  h.session = { user: { id: 'u1' } };
  h.rows = [];
  h.findCalls = 0;
  h.failFindOnCall = 0;
  h.failUpsert = false;
  h.upserts = [];
});

describe('GET /api/education/playbook', () => {
  it('returns stored progress when the read succeeds', async () => {
    h.rows = [{ lessonKey: '1:intro' }];

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ done: ['1:intro'] });
  });

  it('fails closed when progress cannot be read', async () => {
    h.failFindOnCall = 1;

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });
});

describe('POST /api/education/playbook', () => {
  it('fails closed when the progress write fails', async () => {
    h.failUpsert = true;

    const res = await POST(req({ chapter: 1, lesson: firstLesson.key }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  it('fails closed when the authoritative reread fails', async () => {
    h.failFindOnCall = 1;

    const res = await POST(req({ chapter: 1, lesson: firstLesson.key }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  it('still records and returns progress when storage works', async () => {
    h.rows = [{ lessonKey: `1:${firstLesson.key}` }];

    const res = await POST(req({ chapter: 1, lesson: firstLesson.key }));

    expect(res.status).toBe(200);
    expect(h.upserts).toHaveLength(1);
    expect(await res.json()).toMatchObject({ done: [`1:${firstLesson.key}`], chapterComplete: false });
  });
});
