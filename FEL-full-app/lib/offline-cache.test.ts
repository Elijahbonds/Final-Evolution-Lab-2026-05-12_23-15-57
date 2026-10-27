// lib/offline-cache.ts, wired for offline play (offline-push, round 8): each queued run belongs to the account that
// played it and is sent only under that account; the server's answers decide what is kept.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFLINE_QUEUE_MAX_AGE_MS, OFFLINE_RESULTS_ENDPOINT, SessionResultQueue } from './offline-cache';

const run = (score: number) => ({ mode: 'dunkContest', score, completedAt: new Date(0).toISOString(), durationMs: 60_000, won: true });
let posts: { url: string; key: string | null; body: unknown }[] = [];
let answer: (n: number) => Response | Promise<Response> = () => new Response('{"ok":true}', { status: 200 });

beforeEach(() => {
  posts = [];
  answer = () => new Response('{"ok":true}', { status: 200 });
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    posts.push({ url, key: (init.headers as Record<string, string>)['X-Client-Result-Id'] ?? null, body: JSON.parse(String(init.body)) });
    return answer(posts.length);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('SessionResultQueue for offline runs', () => {
  it('sends to /api/offline/results with the run\'s own id, and clears what was recorded', async () => {
    const q = new SessionResultQueue();
    q.enqueue(run(10), 'u1');
    q.enqueue(run(20), 'u1');
    const out = await q.flush('u1', 0);
    expect(out).toMatchObject({ delivered: 2, dropped: 0, remaining: 0 });
    expect(posts.map((p) => p.url)).toEqual([OFFLINE_RESULTS_ENDPOINT, OFFLINE_RESULTS_ENDPOINT]);
    expect(posts.map((p) => (p.body as { score: number }).score)).toEqual([10, 20]);
    expect(posts.every((p) => typeof p.key === 'string' && p.key.length >= 8)).toBe(true);
  });

  it('another account\'s runs are never sent under this one, and nothing is sent signed out', async () => {
    const q = new SessionResultQueue();
    q.enqueue(run(1), 'alice');
    q.enqueue(run(2), 'bob');
    expect(q.pendingFor('bob')).toBe(1);
    await q.flush(null, 0);
    expect(posts).toEqual([]);
    const out = await q.flush('bob', 0);
    expect(out).toMatchObject({ delivered: 1, remaining: 1 });
    expect(posts.map((p) => (p.body as { score: number }).score)).toEqual([2]);
    expect(q.pendingFor('alice')).toBe(1);
  });

  it('offline: nothing is tried and everything is kept', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const q = new SessionResultQueue();
    q.enqueue(run(1), 'u1');
    expect(await q.flush('u1', 0)).toMatchObject({ delivered: 0, remaining: 1 });
    expect(posts).toEqual([]);
  });

  it('a 400 drops the run; a 401, a 429 and a network error keep it and use a try; a 503 (table not applied) keeps it free', async () => {
    const q = new SessionResultQueue({ maxAttempts: 2 });
    q.enqueue(run(1), 'u1');
    answer = () => new Response('{}', { status: 503 });
    for (let i = 0; i < 5; i++) await q.flush('u1', 0);
    expect(q.pendingFor('u1')).toBe(1);   // five 503s used no tries
    answer = () => new Response('{}', { status: 429 });
    await q.flush('u1', 0);
    expect(q.pendingFor('u1')).toBe(1);
    await q.flush('u1', 0);
    expect(q.pendingFor('u1')).toBe(0);   // two tries used: dropped
    q.enqueue(run(2), 'u1');
    answer = () => new Response('{"error":"mode_not_offline"}', { status: 400 });
    expect(await q.flush('u1', 0)).toMatchObject({ dropped: 1, remaining: 0 });
    q.enqueue(run(3), 'u1');
    answer = () => { throw new TypeError('Failed to fetch'); };
    expect(await q.flush('u1', 0)).toMatchObject({ delivered: 0, remaining: 1 });
  });

  it('a run older than the server accepts is dropped unsent', async () => {
    const q = new SessionResultQueue();
    q.enqueue(run(1), 'u1');
    const out = await q.flush('u1', Date.now() + OFFLINE_QUEUE_MAX_AGE_MS + 1);
    expect(out).toMatchObject({ delivered: 0, dropped: 1, remaining: 0 });
    expect(posts).toEqual([]);
  });

  it('the queue is bounded: the oldest go first', () => {
    const q = new SessionResultQueue({ maxQueue: 3 });
    for (let i = 0; i < 5; i++) q.enqueue(run(i), 'u1');
    expect(q.peek().map((e) => e.payload.score)).toEqual([2, 3, 4]);
  });
});
