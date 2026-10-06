import { afterEach, describe, expect, it, vi } from 'vitest';
import { adopt, linkPlan, readMark, startSync, SYNC_MARK_KEY, writeMark } from './syncClient';
import { freshState, recordView, setTopics } from './state';
import { CARDS } from './catalog';

// KNOWLEDGE-FEED v2: the device side of account sync — which merge a sign-in runs, what the device holds after it, and
// that anything but a clean "eligible" answer leaves the device exactly as it was (the teen and offline cases).

const D = 20_000;
const device = () => recordView(setTopics(freshState(), ['science']), CARDS.find((c) => c.topic === 'science')!, D, D * 86_400_000, 4000);

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}

describe('which merge a sign-in runs', () => {
  it('a device never linked: first-link (its progress joins the account)', () => {
    expect(linkPlan(null, 'u1')).toBe('first-link');
  });
  it('a device linked to this account: linked', () => {
    expect(linkPlan({ userId: 'u1' }, 'u1')).toBe('linked');
  });
  it('a device linked to ANOTHER account: never merged into this one', () => {
    expect(linkPlan({ userId: 'u2' }, 'u1')).toBe('other-account');
  });
  it('the mark round-trips through storage, and a junk mark reads as none', () => {
    const s = memStore();
    writeMark({ userId: 'u1' }, s);
    expect(readMark(s)).toEqual({ userId: 'u1' });
    s.setItem(SYNC_MARK_KEY, '{"userId":42}');
    expect(readMark(s)).toBeNull();
    s.setItem(SYNC_MARK_KEY, 'not json');
    expect(readMark(s)).toBeNull();
  });
});

describe('what the device holds after a sync', () => {
  it('a merge result is adopted, keeping the device\'s own near-repeat window', () => {
    const d = device();
    const server = { ...d, recent: [], xp: d.xp + 40 };
    const got = adopt(d, server, 'first-link');
    expect(got.xp).toBe(d.xp + 40);
    expect(got.recent).toEqual(d.recent);
  });
  it('another account\'s device takes this account\'s state — nothing of the other carries over', () => {
    const d = device();
    expect(adopt(d, null, 'other-account')).toEqual(freshState());
  });
});

describe('startSync leaves the device alone unless the server says "eligible"', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  for (const [label, res] of [
    ['under 18 / unknown age (eligible: false)', new Response(JSON.stringify({ eligible: false }), { status: 200 })],
    ['before the migration (503)', new Response(JSON.stringify({ error: 'learn_sync_unavailable' }), { status: 503 })],
    ['signed out (401)', new Response('{}', { status: 401 })],
  ] as const) {
    it(label, async () => {
      const fetchMock = vi.fn(async () => res);
      vi.stubGlobal('fetch', fetchMock);
      const d = device();
      const r = await startSync('u1', d);
      expect(r).toEqual({ synced: false, state: d });
      expect(fetchMock).toHaveBeenCalledTimes(1);   // the GET only — no push of a minor's progress
    });
  }

  it('an eligible account: the device is sent as a first link (without its near-repeat window) and the merge adopted', async () => {
    const d = device();
    const merged = { ...d, recent: [], xp: d.xp + 12 };
    const calls: { method: string; body?: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return init?.method === 'POST'
        ? new Response(JSON.stringify({ ok: true, mode: 'first-link', state: merged }), { status: 200 })
        : new Response(JSON.stringify({ eligible: true, state: null }), { status: 200 });
    }));
    const r = await startSync('u1', d);
    expect(r.synced).toBe(true);
    expect(r.plan).toBe('first-link');
    expect(r.state.xp).toBe(d.xp + 12);
    expect(r.state.recent).toEqual(d.recent);
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST']);
    expect(calls[1].body?.mode).toBe('first-link');
    expect((calls[1].body?.state as { recent: string[] }).recent).toEqual([]);
  });

  it('offline: unchanged, no throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const d = device();
    expect(await startSync('u1', d)).toEqual({ synced: false, state: d });
  });
});
